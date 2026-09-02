const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

let mainWindow = null;
let serverInstance = null;
let serverPort = null;

// Determine Data Directory
// Portable mode: Save data next to portable executable in 'Sortirr-Data'
// Installed / standard mode: Save data in 'Documents/Sortirr'
function resolveDataDirectory() {
    if (process.env.SORTIRR_DATA_DIR) {
        return process.env.SORTIRR_DATA_DIR;
    }

    if (process.env.PORTABLE_EXECUTABLE_DIR) {
        return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Sortirr-Data');
    }

    try {
        const documentsDir = app.getPath('documents');
        return path.join(documentsDir, 'Sortirr');
    } catch (_) {
        const userDataDir = app.getPath('userData');
        return path.join(userDataDir, 'Sortirr-Library');
    }
}

const dataDir = resolveDataDirectory();
process.env.SORTIRR_DATA_DIR = dataDir;

// Ensure base data directories exist
try {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const dumpDir = path.join(dataDir, 'dump');
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
    }
} catch (e) {
    console.error('Failed to initialize data directory:', e);
}

// Start Express backend
async function startBackend() {
    const { startServer } = require('./server');
    // Listen on dynamic port (0) to prevent any port collision
    const result = await startServer(0, dataDir);
    serverInstance = result.server;
    serverPort = result.port;
    return serverPort;
}

function createMainWindow(port) {
    const iconPath = process.platform === 'win32'
        ? path.join(__dirname, 'build', 'icon.ico')
        : path.join(__dirname, 'build', 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1380,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        title: 'Sortirr',
        backgroundColor: '#090d16',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        show: false
    });

    // Custom lightweight menu
    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Buka Folder Data (Storage)',
                    click: () => {
                        shell.openPath(dataDir);
                    }
                },
                {
                    label: 'Buka Folder Dump',
                    click: () => {
                        const dumpPath = path.join(dataDir, 'dump');
                        if (!fs.existsSync(dumpPath)) fs.mkdirSync(dumpPath, { recursive: true });
                        shell.openPath(dumpPath);
                    }
                },
                { type: 'separator' },
                {
                    label: 'Keluar',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Tampilan',
            submenu: [
                { role: 'reload', label: 'Muat Ulang (Reload)' },
                { role: 'forceReload', label: 'Paksa Muat Ulang' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Ukuran Normal' },
                { role: 'zoomIn', label: 'Perbesar' },
                { role: 'zoomOut', label: 'Perkecil' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Layar Penuh (Full Screen)' },
                {
                    label: 'Developer Tools',
                    accelerator: 'F12',
                    click: () => mainWindow.webContents.toggleDevTools()
                }
            ]
        },
        {
            label: 'Bantuan',
            submenu: [
                {
                    label: 'Kunjungi GitHub Repository',
                    click: () => {
                        shell.openExternal('https://github.com/satriaksm/sortirr');
                    }
                },
                {
                    label: 'Tentang Sortirr',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Tentang Sortirr',
                            message: `Sortirr v${app.getVersion()}`,
                            detail: `Universal Smart File Sorter\n\nFolder Data:\n${dataDir}\n\nLisensi: Open Source`,
                            buttons: ['Tutup']
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    // Open external links in default OS browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            if (!url.includes(`127.0.0.1:${port}`) && !url.includes(`localhost:${port}`)) {
                shell.openExternal(url);
                return { action: 'deny' };
            }
        }
        return { action: 'allow' };
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (process.argv.includes('--test')) {
        console.log('Smoke test flag detected: Waiting 3 seconds then quitting.');
        setTimeout(() => {
            console.log('Smoke test passed successfully.');
            app.quit();
        }, 3000);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(async () => {
    try {
        const port = await startBackend();
        createMainWindow(port);

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWindow(port);
            }
        });
    } catch (err) {
        console.error('Failed to initialize Sortirr application:', err);
        dialog.showErrorBox('Gagal Memulai Sortirr', `Terjadi kesalahan saat memulai server internal:\n${err.message}`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverInstance) {
            try { serverInstance.close(); } catch (_) {}
        }
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverInstance) {
        try { serverInstance.close(); } catch (_) {}
    }
});
