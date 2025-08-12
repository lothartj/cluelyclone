import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, ipcMain } from 'electron';
import path from 'node:path';
import url from 'node:url';

let mainWindow = null;
let tray = null;
let selectorWindow = null;

function isDev() {
  return !!process.env.VITE_DEV_SERVER_URL;
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const height = Math.min(680, Math.floor(primaryDisplay.workAreaSize.height * 0.6));
  const width = Math.min(480, Math.floor(primaryDisplay.workAreaSize.width * 0.34));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 360,
    minHeight: 520,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(process.cwd(), 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  mainWindow.setContentProtection(true);
  try {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {}

  if (isDev()) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = url.pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).toString();
    mainWindow.loadURL(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.showInactive();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(process.cwd(), 'electron', 'assets', 'trayTemplate.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]);
  tray.setToolTip('CluelyClone');
  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.showInactive();
  }
}

function openSelectorWindow() {
  if (selectorWindow) {
    try { selectorWindow.focus(); } catch {}
    return;
  }
  const primaryDisplay = screen.getPrimaryDisplay();
  selectorWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    fullscreen: false,
    backgroundColor: '#00000001',
    webPreferences: {
      preload: path.join(process.cwd(), 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  const selectorPath = url.pathToFileURL(path.join(process.cwd(), 'electron', 'selector.html')).toString();
  selectorWindow.loadURL(selectorPath);

  selectorWindow.on('closed', () => {
    selectorWindow = null;
  });
}

function setupIpc() {
  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    win?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    } else {
      win.maximize();
      return true;
    }
  });
  ipcMain.handle('window:hide', () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    win?.hide();
  });
  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    win?.close();
  });
  ipcMain.handle('window:get-bounds', () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return null;
    const b = win.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  ipcMain.handle('selector:open', () => {
    openSelectorWindow();
  });
  ipcMain.handle('selector:cancel', () => {
    if (selectorWindow) {
      selectorWindow.close();
      selectorWindow = null;
    }
  });
  ipcMain.handle('selector:complete', (_e, payload) => {
    if (selectorWindow) {
      selectorWindow.close();
      selectorWindow = null;
    }
    if (mainWindow && payload && payload.imageDataUrl) {
      mainWindow.webContents.send('visual-ask', { imageDataUrl: payload.imageDataUrl });
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIpc();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
}); 