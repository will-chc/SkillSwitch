const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanSkills: () => ipcRenderer.invoke('scan-skills'),
  toggleSkill: (skillId, parentPlugin, enabled) => ipcRenderer.invoke('toggle-skill', { skillId, parentPlugin, enabled }),
  scanPlugins: () => ipcRenderer.invoke('scan-plugins'),
  togglePlugin: (pluginId, enabled) => ipcRenderer.invoke('toggle-plugin', { pluginId, enabled }),
});
