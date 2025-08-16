
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  listInventory: (locationId) => ipcRenderer.invoke('inventory:list', { locationId }),
  summary: () => ipcRenderer.invoke('inventory:summary'),
  saveTextFile: (opts) => ipcRenderer.invoke('file:saveText', opts),
  itemCount: () => ipcRenderer.invoke('inventory:itemCount'),
  filters: () => ipcRenderer.invoke('catalog:filters')
});
