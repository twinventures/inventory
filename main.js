
import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Database } from './src/db.js';
import fs from 'fs';
import { dialog } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });
  win.loadFile('src/index.html');
};

app.whenReady().then(() => {
  db = new Database(path.join(app.getPath('userData'), 'inventory.sqlite'));
  db.init();
  
  // macOS dev: set Dock icon
  const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (app.dock && !dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc() {
  ipcMain.handle('inventory:list', (_e, { locationId }) => {
    return db.listInventory(locationId);
  });
  
  ipcMain.handle('inventory:summary', () => db.summary());
  
  ipcMain.handle('file:saveText', async (event, { defaultPath, content }) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultPath || 'export.txt',
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return true;
  });

  ipcMain.handle('inventory:itemCount', async () => {
    return db.countItems();
  });
  
  ipcMain.handle('catalog:filters', () => db.filters());
}
