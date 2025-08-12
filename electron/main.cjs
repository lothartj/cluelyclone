const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const path = require('node:path');
const url = require('node:url');

let mainWindow = null;
let tray = null;
let isVisibleToOthers = false;

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
    opacity: 1.0,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      devTools: isDev()
    }
  });

  if (isDev()) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http://localhost:* ws://localhost:*;",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
            "font-src 'self' https://fonts.gstatic.com;",
            "img-src 'self' data: https:;",
            "connect-src 'self' ws://localhost:* http://localhost:* https://openrouter.ai/;",
          ].join(' ')
        }
      });
    });
  }

  if (isDev()) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = url.pathToFileURL(path.join(process.cwd(), 'dist', 'index.html')).toString();
    mainWindow.loadURL(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    updateWindowVisibility();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateWindowVisibility() {
  if (!mainWindow) return;

  try {
    if (isVisibleToOthers) {
      mainWindow.setContentProtection(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setSkipTaskbar(false);
      mainWindow.setOpacity(1.0);
      mainWindow.setBackgroundColor('#00000000');
    } else {
      mainWindow.setContentProtection(true);
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setSkipTaskbar(true);
      mainWindow.setOpacity(1.0);
      mainWindow.setBackgroundColor('#00000000');
    }
  } catch (e) {
    console.error('Error updating window visibility:', e);
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
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
    mainWindow.show();
    mainWindow.moveTop();
  }
}

function setupIpc() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  });

  ipcMain.handle('window:hide', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:set-sharing-mode', (_e, visible) => {
    isVisibleToOthers = !!visible;
    updateWindowVisibility();
    return isVisibleToOthers;
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIpc();

  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
}); 