const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanSkills: () => ipcRenderer.invoke('scan-skills'),
  toggleSkill: (skillId, enabled) => ipcRenderer.invoke('toggle-skill', { skillId, enabled }),
});
