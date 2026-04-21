const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Settings file path
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');

// Skill directories to scan
const SKILL_DIRECTORIES = [
  { path: path.join(os.homedir(), '.claude', 'skills') },
  { path: path.join(os.homedir(), '.codex', 'superpowers', 'skills') },
  { path: path.join(os.homedir(), '.codex', 'skills') },
];

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

// Get disabled skills from settings.json
function getDisabledSkills() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return [];
    }
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(content);
    return Array.isArray(settings.disabledSkills) ? settings.disabledSkills : [];
  } catch (e) {
    console.error('Error reading settings.json:', e);
    return [];
  }
}

// Save disabled skills to settings.json
function saveDisabledSkills(disabledSkills) {
  try {
    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      settings = JSON.parse(content);
    }
    settings.disabledSkills = disabledSkills;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error('Error writing settings.json:', e);
    return { success: false, error: e.message };
  }
}

// Scan skills from all directories
function scanSkills() {
  try {
    const allSkillDirs = [...SKILL_DIRECTORIES, ...findPluginSkillDirs()];
    const skillsMap = new Map();
    const disabledSkills = getDisabledSkills();

    for (const skillDir of allSkillDirs) {
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
        const baseName = entry.name.replace('.disabled', '');

        // Try to read skill.json for metadata
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

        // Use skill name as key to avoid duplicates
        const skillKey = skillInfo.name || baseName;
        if (!skillsMap.has(skillKey)) {
          // Check if disabled via settings.json
          const isEnabled = !disabledSkills.includes(skillKey);

          skillsMap.set(skillKey, {
            id: entry.name,
            name: skillInfo.name || baseName,
            description: skillInfo.description || '',
            isEnabled,
          });
        }
      }
    }

    return { skills: Array.from(skillsMap.values()), error: null };
  } catch (error) {
    return { skills: [], error: error.message };
  }
}

// Toggle skill enable/disable via settings.json
function toggleSkill(skillName, enabled) {
  try {
    const disabledSkills = getDisabledSkills();

    if (enabled) {
      // Enable: remove from disabled list
      const newDisabled = disabledSkills.filter(s => s !== skillName);
      const result = saveDisabledSkills(newDisabled);
      return result;
    } else {
      // Disable: add to disabled list (avoid duplicates)
      if (!disabledSkills.includes(skillName)) {
        const newDisabled = [...disabledSkills, skillName];
        return saveDisabledSkills(newDisabled);
      }
      return { success: true };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// IPC handlers
ipcMain.handle('scan-skills', () => {
  return scanSkills();
});

ipcMain.handle('toggle-skill', (_, { skillId, enabled }) => {
  return toggleSkill(skillId, enabled);
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
