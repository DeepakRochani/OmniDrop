const { app, BrowserWindow, Tray, Menu, shell, Notification, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let wakeLockBlockerId = null;
const PORT = process.env.PORT || 53317;
const APP_URL = `http://localhost:${PORT}`;

// Native OS-Level Screen Wake Lock (prevents display sleep during active file transfers)
ipcMain.handle('acquire-wake-lock', () => {
  if (wakeLockBlockerId === null || !powerSaveBlocker.isStarted(wakeLockBlockerId)) {
    wakeLockBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.log('[Desktop] Native Screen Wake Lock acquired (ID:', wakeLockBlockerId, ')');
  }
  return { ok: true, id: wakeLockBlockerId };
});

ipcMain.handle('release-wake-lock', () => {
  if (wakeLockBlockerId !== null && powerSaveBlocker.isStarted(wakeLockBlockerId)) {
    powerSaveBlocker.stop(wakeLockBlockerId);
    console.log('[Desktop] Native Screen Wake Lock released (ID:', wakeLockBlockerId, ')');
    wakeLockBlockerId = null;
  }
  return { ok: true };
});

// 1. Start embedded OmniDrop background server
function startServer() {
  const serverScript = path.join(__dirname, 'server.js');
  serverProcess = spawn(process.execPath, [serverScript], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start OmniDrop server process:', err);
  });
}

// 2. Poll server until ready, then create window
function waitForServerAndCreateWindow() {
  const check = () => {
    http.get(APP_URL, (res) => {
      if (res.statusCode === 200) {
        createMainWindow();
      } else {
        setTimeout(check, 300);
      }
    }).on('error', () => {
      setTimeout(check, 300);
    });
  };
  check();
}

// 3. Create Native Frameless Glass Window
function createMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#0b0f19',
    title: 'OmniDrop',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links (e.g. documentation) in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 4. Create Native System Tray / Menu Bar Icon
function createTray() {
  try {
    const iconPath = path.join(__dirname, 'public', 'icon.svg');
    tray = new Tray(iconPath);
    tray.setToolTip('OmniDrop - Universal AirDrop');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open OmniDrop Radar',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Open Downloads Folder',
        click: () => {
          const dlPath = path.join(__dirname, 'downloads');
          shell.openPath(dlPath);
        }
      },
      { type: 'separator' },
      {
        label: 'Copy Mobile Web Link',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(APP_URL);
          if (Notification.isSupported()) {
            new Notification({
              title: 'OmniDrop',
              body: 'Copied local link to clipboard!'
            }).show();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit OmniDrop',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      } else {
        createMainWindow();
      }
    });
  } catch (err) {
    console.warn('Tray icon initialization skipped:', err.message);
  }
}

// App lifecycle
app.whenReady().then(() => {
  startServer();
  waitForServerAndCreateWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

