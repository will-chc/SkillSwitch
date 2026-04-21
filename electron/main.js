const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Skill directories to scan
const SKILL_DIRECTORIES = [
  // User skills (can be toggled)
  { path: path.join(os.homedir(), '.claude', 'skills'), isPluginLocked: false },
  // Plugin skills (locked)
  { path: path.join(os.homedir(), '.codex', 'superpowers', 'skills'), isPluginLocked: true },
  { path: path.join(os.homedir(), '.codex', 'skills'), isPluginLocked: true },
];

// Find plugin skill directories dynamically
function findPluginSkillDirs() {
  const pluginDirs = [];
  const pluginsCacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache');

  if (!fs.existsSync(pluginsCacheDir)) {
    return pluginDirs;
  }

  // Scan plugin cache for skills directories
  try {
    const pluginEntries = fs.readdirSync(pluginsCacheDir, { withFileTypes: true });
    for (const pluginEntry of pluginEntries.filter(e => e.isDirectory())) {
      const pluginPath = path.join(pluginsCacheDir, pluginEntry.name);
      // Look for skills in plugin subdirectories
      const pluginSubEntries = fs.readdirSync(pluginPath, { withFileTypes: true });
      for (const subEntry of pluginSubEntries.filter(e => e.isDirectory())) {
        const skillsPath = path.join(pluginPath, subEntry.name, 'skills');
        if (fs.existsSync(skillsPath)) {
          const stats = fs.statSync(skillsPath);
          if (stats.isDirectory()) {
            pluginDirs.push({ path: skillsPath, isPluginLocked: true });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error scanning plugin directories:', e);
  }

  return pluginDirs;
}

// Scan skills from all directories
function scanSkills() {
  try {
    const allSkillDirs = [...SKILL_DIRECTORIES, ...findPluginSkillDirs()];
    const skillsMap = new Map(); // Use Map to avoid duplicates

    for (const dirConfig of allSkillDirs) {
      if (!fs.existsSync(dirConfig.path)) {
        continue;
      }

      const entries = fs.readdirSync(dirConfig.path, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden files and non-directories
        if (entry.name.startsWith('.')) continue;

        let isSkillDir = false;
        if (entry.isDirectory()) {
          isSkillDir = true;
        } else if (entry.isSymbolicLink()) {
          const skillPath = path.join(dirConfig.path, entry.name);
          try {
            const stats = fs.statSync(skillPath);
            isSkillDir = stats.isDirectory();
          } catch {
            continue;
          }
        }

        if (!isSkillDir) continue;

        const skillPath = path.join(dirConfig.path, entry.name);
        const isEnabled = !entry.name.endsWith('.disabled');
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

        // Determine if skill is plugin-locked
        // User skills in ~/.claude/skills/ without symlinks are NOT locked
        // Symlinked skills or skills from plugin directories ARE locked
        const isUserSkillsDir = dirConfig.path === path.join(os.homedir(), '.claude', 'skills');
        const isSymlink = entry.isSymbolicLink();
        const isPluginLocked = dirConfig.isPluginLocked || (isUserSkillsDir && isSymlink);

        // Use skill name as key to avoid duplicates
        const skillKey = skillInfo.name || baseName;
        if (!skillsMap.has(skillKey)) {
          skillsMap.set(skillKey, {
            id: entry.name,
            name: skillInfo.name || baseName,
            description: skillInfo.description || '',
            isEnabled,
            isPluginLocked,
            path: skillPath,
            source: isUserSkillsDir ? 'user' : 'plugin',
          });
        }
      }
    }

    return { skills: Array.from(skillsMap.values()), error: null };
  } catch (error) {
    return { skills: [], error: error.message };
  }
}

// Toggle skill enable/disable (only for user skills)
function toggleSkill(skillId, enabled) {
  const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

  try {
    const skillPath = path.join(CLAUDE_SKILLS_DIR, skillId);

    // Check if skill exists
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: 'Skill not found' };
    }

    // Check if it's a symlink (plugin-locked)
    const linkPath = path.join(CLAUDE_SKILLS_DIR, skillId);
    try {
      const lstats = fs.lstatSync(linkPath);
      if (lstats.isSymbolicLink()) {
        return { success: false, error: 'Skill is locked by plugin' };
      }
    } catch (e) {
      // Ignore
    }

    const baseName = skillId.replace('.disabled', '');
    const newId = enabled ? baseName : `${baseName}.disabled`;
    const newPath = path.join(CLAUDE_SKILLS_DIR, newId);

    fs.renameSync(skillPath, newPath);
    return { success: true };
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
