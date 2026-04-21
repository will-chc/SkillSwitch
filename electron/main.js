const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  buildPluginInfoMap,
  computePluginSkillState,
  extractPluginNameFromPath,
  hasAnyEnabledPluginSkills,
  isPluginDisabled,
  normalizeSkillSwitchSettings,
  setPluginDisabled,
  setPluginSkillEnabled,
} = require('./skill-state');
const { syncPluginSkillSymlinks } = require('./plugin-takeover');
const { buildManagedSkillEntries } = require('./manual-mode');
const { findPluginVersionPath } = require('./plugin-paths');

// ============================================================================
// Configuration
// ============================================================================

// Settings file - stores enabledPlugins configuration
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

// App settings file - stores per-plugin-skill overrides
const SKILL_SWITCH_FILE = path.join(os.homedir(), '.claude', 'skill-switch.json');

// User skills directory - stores direct user skills
const USER_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

// Plugin cache directory - stores installed plugin packages
const PLUGIN_CACHE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cache');

function extractPublisherFromPath(skillDir) {
  const parts = skillDir.split(path.sep);
  const cacheIndex = parts.lastIndexOf('cache');
  if (cacheIndex >= 0 && parts.length > cacheIndex + 2) {
    return parts[cacheIndex + 1];
  }
  return null;
}

function buildPluginId(pluginName, publisher) {
  return pluginName ? (publisher ? `${pluginName}@${publisher}` : pluginName) : null;
}

// Find plugin skill directories dynamically
function findPluginSkillDirs() {
  const pluginDirs = [];
  const pluginsCacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache');

  if (!fs.existsSync(pluginsCacheDir)) {
    return pluginDirs;
  }

  function findSkillsDirs(dir) {
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'skills' && entry.isDirectory()) {
          results.push(path.join(dir, 'skills'));
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          results.push(...findSkillsDirs(path.join(dir, entry.name)));
        }
      }
    } catch (e) {
      // Ignore inaccessible directories
    }
    return results;
  }

  const skillsDirs = findSkillsDirs(pluginsCacheDir);
  for (const skillsDir of skillsDirs) {
    pluginDirs.push(skillsDir);
  }

  return pluginDirs;
}

// Scan skills from all directories
function scanSkills() {
  try {
    const pluginSkillDirs = findPluginSkillDirs();
    const userSkills = [];
    const pluginSkillsMap = new Map();
    const settings = getSettings();
    const enabledPlugins = settings.enabledPlugins || {};
    const pluginInfoMap = buildPluginInfoMap(enabledPlugins);
    const skillSwitchSettings = getSkillSwitchSettings();

    // First pass: collect plugin skills with their parent plugin info
    for (const skillDir of pluginSkillDirs) {
      if (!fs.existsSync(skillDir)) {
        continue;
      }

      const entries = fs.readdirSync(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        let isSkillDir = false;
        if (entry.isDirectory()) {
          isSkillDir = true;
        } else if (entry.isSymbolicLink()) {
          const skillPath = path.join(skillDir, entry.name);
          try {
            const stats = fs.statSync(skillPath);
            isSkillDir = stats.isDirectory();
          } catch {
            continue;
          }
        }

        if (!isSkillDir) continue;

        const skillPath = path.join(skillDir, entry.name);
        const baseName = entry.name;

        let skillInfo = { name: baseName, description: '' };
        const skillJsonPath = path.join(skillPath, 'skill.json');
        if (fs.existsSync(skillJsonPath)) {
          try {
            const content = fs.readFileSync(skillJsonPath, 'utf-8');
            skillInfo = JSON.parse(content);
          } catch (e) {
            // Ignore parse errors
          }
        }

        const parentPluginName = extractPluginNameFromPath(skillDir);
        const publisher = extractPublisherFromPath(skillDir);
        const pluginInfo = parentPluginName ? pluginInfoMap.get(parentPluginName) : null;
        const skillKey = pluginInfo ? `${pluginInfo.pluginId}:${baseName}` : `${skillPath}:${baseName}`;

        if (!pluginSkillsMap.has(skillKey)) {
          const pluginSkillState = computePluginSkillState({
            baseName,
            skillInfo,
            skillPath,
            parentPluginName,
            pluginInfoMap,
            skillSwitchSettings,
          });

          if (!pluginSkillState.parentPlugin && parentPluginName) {
            pluginSkillState.parentPlugin = buildPluginId(parentPluginName, publisher);
          }

          pluginSkillsMap.set(skillKey, pluginSkillState);
        }
      }
    }

    // Scan user skills (skills that exist directly in ~/.claude/skills/)
    if (fs.existsSync(USER_SKILLS_DIR)) {
      const entries = fs.readdirSync(USER_SKILLS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        let isSkillDir = false;
        if (entry.isDirectory()) {
          isSkillDir = true;
        } else if (entry.isSymbolicLink()) {
          const skillPath = path.join(USER_SKILLS_DIR, entry.name);
          try {
            const stats = fs.statSync(skillPath);
            isSkillDir = stats.isDirectory();
          } catch {
            continue;
          }
        }

        if (!isSkillDir) continue;

        const skillPath = path.join(USER_SKILLS_DIR, entry.name);
        const baseName = entry.name;

        // Read skill.json for metadata
        let skillInfo = { name: baseName, description: '' };
        const skillJsonPath = path.join(skillPath, 'skill.json');
        if (fs.existsSync(skillJsonPath)) {
          try {
            const content = fs.readFileSync(skillJsonPath, 'utf-8');
            skillInfo = JSON.parse(content);
          } catch (e) {
            // Ignore parse errors
          }
        }

        // Ignore legacy symlinks that point back into the plugin cache.
        try {
          const resolvedPath = fs.realpathSync(skillPath);
          if (resolvedPath.startsWith(PLUGIN_CACHE_DIR + path.sep) || resolvedPath === PLUGIN_CACHE_DIR) {
            continue;
          }
        } catch {
          // Ignore resolution errors and treat it like a regular user skill.
        }

        userSkills.push({
          id: entry.name,
          name: skillInfo.name || baseName,
          description: skillInfo.description || '',
          isEnabled: true, // User skills are always enabled (they exist in the directory)
          sourcePath: skillPath,
        });
      }
    }

    return {
      userSkills,
      pluginSkills: Array.from(pluginSkillsMap.values()),
      error: null
    };
  } catch (error) {
    return { userSkills: [], pluginSkills: [], error: error.message };
  }
}

// ============================================================================
// Skill Override Management Layer
// ============================================================================

function getSkillSwitchSettings() {
  try {
    if (!fs.existsSync(SKILL_SWITCH_FILE)) {
      return normalizeSkillSwitchSettings({});
    }

    const content = fs.readFileSync(SKILL_SWITCH_FILE, 'utf-8');
    return normalizeSkillSwitchSettings(JSON.parse(content));
  } catch (e) {
    return normalizeSkillSwitchSettings({});
  }
}

function saveSkillSwitchSettings(settings) {
  fs.mkdirSync(path.dirname(SKILL_SWITCH_FILE), { recursive: true });
  fs.writeFileSync(SKILL_SWITCH_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

function setNativePluginEnabled(pluginId, enabled) {
  const settings = getSettings();
  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }
  settings.enabledPlugins[pluginId] = enabled === true;
  saveSettings(settings);
}

function syncPluginRuntimeState() {
  const skillSwitchSettings = getSkillSwitchSettings();
  const scanResult = scanSkills();
  if (scanResult.error) {
    throw new Error(scanResult.error);
  }

  const pluginSkillMap = new Map();
  for (const skill of scanResult.pluginSkills) {
    if (!skill.parentPlugin) continue;
    if (!pluginSkillMap.has(skill.parentPlugin)) {
      pluginSkillMap.set(skill.parentPlugin, []);
    }
    pluginSkillMap.get(skill.parentPlugin).push(skill);
  }

  const pluginsToSync = new Set([
    ...Object.keys(skillSwitchSettings.disabledPlugins || {}),
    ...Object.keys(skillSwitchSettings.enabledPluginSkills || {}),
    ...pluginSkillMap.keys(),
  ]);

  const takenOverPlugins = [];

  for (const pluginId of pluginsToSync) {
    const pluginSkills = pluginSkillMap.get(pluginId) || [];
    const pluginName = pluginId.split('@')[0];
    const publisher = pluginId.split('@').slice(1).join('@');
    const pluginDisabled = isPluginDisabled(skillSwitchSettings, pluginId);
    const hasEnabledSkills = hasAnyEnabledPluginSkills(skillSwitchSettings, pluginId);

    if (pluginDisabled) {
      setNativePluginEnabled(pluginId, false);
      if (hasEnabledSkills) {
        const cachePath = findPluginVersionPath(PLUGIN_CACHE_DIR, pluginName, publisher);
        if (cachePath) {
          const enabledSkillIds = Object.keys(skillSwitchSettings.enabledPluginSkills?.[pluginId] || {});
          takenOverPlugins.push({
            pluginId,
            cachePath,
            skills: buildManagedSkillEntries(cachePath, enabledSkillIds),
          });
        }
      }
      continue;
    }

    setNativePluginEnabled(pluginId, true);
  }

  syncPluginSkillSymlinks({
    userSkillsDir: USER_SKILLS_DIR,
    pluginCacheDir: PLUGIN_CACHE_DIR,
    takenOverPlugins,
  });
}

function toggleSkill(skillId, parentPlugin, enabled) {
  try {
    if (!parentPlugin) {
      return { success: false, error: 'Cannot toggle a skill without a parent plugin' };
    }

    const currentSettings = getSkillSwitchSettings();
    if (!isPluginDisabled(currentSettings, parentPlugin)) {
      return { success: false, error: 'Disable the plugin before toggling individual skills' };
    }

    const pluginName = parentPlugin.split('@')[0];
    const publisher = parentPlugin.split('@').slice(1).join('@');
    const cachePath = findPluginVersionPath(PLUGIN_CACHE_DIR, pluginName, publisher);
    const sourcePath = cachePath ? require('path').join(cachePath, 'skills', skillId) : null;

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: `Plugin skill '${skillId}' not found` };
    }

    const updatedSettings = setPluginSkillEnabled(currentSettings, parentPlugin, skillId, enabled);
    saveSkillSwitchSettings(updatedSettings);
    syncPluginRuntimeState();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Plugin Management Layer
// ============================================================================

// Scan installed plugins from settings.json
function scanPlugins() {
  try {
    const settings = getSettings();
    const enabledPlugins = settings.enabledPlugins || {};
    const skillSwitchSettings = getSkillSwitchSettings();
    const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache');
    const plugins = [];

    for (const [pluginId, isEnabled] of Object.entries(enabledPlugins)) {
      // Parse pluginId: "plugin-name@publisher"
      const parts = pluginId.split('@');
      const pluginName = parts[0];
      const publisher = parts.slice(1).join('@');

      // Find the plugin directory to read metadata
      const pluginPath = findPluginPath(cacheDir, pluginName, publisher);
      const pluginInfo = pluginPath ? readPluginInfo(pluginPath, pluginName) : { name: pluginName, description: '', version: '0.0.0' };

      plugins.push({
        id: pluginId,
        name: pluginInfo.name,
        author: publisher,
        description: pluginInfo.description || '',
        version: pluginInfo.version,
        isEnabled: !isPluginDisabled(skillSwitchSettings, pluginId),
        isNativeEnabled: isEnabled === true,
        isManualMode: isPluginDisabled(skillSwitchSettings, pluginId),
        hasEnabledSkills: hasAnyEnabledPluginSkills(skillSwitchSettings, pluginId),
        sourcePath: pluginPath || '',
      });
    }

    return { plugins, error: null };
  } catch (error) {
    return { plugins: [], error: error.message };
  }
}

// Get settings.json content
function getSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return {};
  }
}

// Read plugin metadata
function readPluginInfo(pluginDir, defaultName) {
  let pluginInfo = {
    name: defaultName,
    description: '',
    version: '0.0.0',
  };

  // Try package.json
  const packageJsonPath = path.join(pluginDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      pluginInfo.name = typeof pkg.name === 'string' ? pkg.name : defaultName;
      pluginInfo.description = typeof pkg.description === 'string' ? pkg.description : '';
      pluginInfo.version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch (e) {
      // Ignore
    }
  }

  return pluginInfo;
}

// Find plugin path in cache directory - returns the directory containing skills
function findPluginPath(cacheDir, pluginName, publisher) {
  if (!fs.existsSync(cacheDir)) {
    return null;
  }

  try {
    const publisherDir = path.join(cacheDir, publisher);
    if (!fs.existsSync(publisherDir)) {
      return null;
    }

    // Search for the plugin directory that contains skills
    function searchDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check if this directory has skills
      const hasSkills = entries.some(e => e.name === 'skills' && e.isDirectory());
      if (hasSkills && dir.endsWith(pluginName)) {
        return dir;
      }

      // Also check subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Check if subdirectory has skills
          const subPath = path.join(dir, entry.name);
          const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
          const subHasSkills = subEntries.some(e => e.name === 'skills' && e.isDirectory());
          if (subHasSkills && entry.name === pluginName) {
            return subPath;
          }

          // Recurse deeper
          const found = searchDir(subPath);
          if (found) return found;
        }
      }
      return null;
    }

    return searchDir(publisherDir);
  } catch (e) {
    return null;
  }
}

// Toggle plugin by updating settings.json
function togglePlugin(pluginId, enabled) {
  try {
    const settings = getSkillSwitchSettings();
    const updatedSettings = setPluginDisabled(settings, pluginId, !enabled);
    saveSkillSwitchSettings(updatedSettings);
    syncPluginRuntimeState();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

// Skills IPC handlers
ipcMain.handle('scan-skills', () => {
  return scanSkills();
});

ipcMain.handle('toggle-skill', (_, { skillId, parentPlugin, enabled }) => {
  return toggleSkill(skillId, parentPlugin, enabled);
});

// Plugins IPC handlers
ipcMain.handle('scan-plugins', () => {
  return scanPlugins();
});

ipcMain.handle('toggle-plugin', (_, { pluginId, enabled }) => {
  return togglePlugin(pluginId, enabled);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:8800');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  try {
    syncPluginRuntimeState();
  } catch (error) {
    console.error('Failed to reconcile plugin runtime state:', error);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
