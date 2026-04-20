const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get Claude skills directory
const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

// Scan skills directory
function scanSkills() {
  try {
    if (!fs.existsSync(CLAUDE_SKILLS_DIR)) {
      return { skills: [], error: 'Claude skills directory not found' };
    }

    const entries = fs.readdirSync(CLAUDE_SKILLS_DIR, { withFileTypes: true });
    const skills = entries
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const skillPath = path.join(CLAUDE_SKILLS_DIR, entry.name);
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

        return {
          id: entry.name,
          name: skillInfo.name || baseName,
          description: skillInfo.description || '',
          isEnabled,
          path: skillPath,
        };
      });

    return { skills, error: null };
  } catch (error) {
    return { skills: [], error: error.message };
  }
}

// Toggle skill enable/disable
function toggleSkill(skillId, enabled) {
  try {
    const oldPath = path.join(CLAUDE_SKILLS_DIR, skillId);
    const baseName = skillId.replace('.disabled', '');
    const newId = enabled ? baseName : `${baseName}.disabled`;
    const newPath = path.join(CLAUDE_SKILLS_DIR, newId);

    if (!fs.existsSync(oldPath)) {
      return { success: false, error: 'Skill not found' };
    }

    fs.renameSync(oldPath, newPath);
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
    },
  });

  // Dev mode: load from Vite dev server
  // Prod mode: load built files
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173');
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
