const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');

const PORT = process.env.SMART_AUTO_PORT || 5000;
const isDev = !app.isPackaged;

// En dev : la racine du projet. En prod : le dossier resources/ (extraResources).
const baseDir = isDev ? path.join(__dirname, '..') : process.resourcesPath;

let serverProcess = null;
let mainWindow = null;

// Démarre le serveur Express en tant que processus enfant, avec le Node embarqué d'Electron.
function startServer() {
  const entry = path.join(baseDir, 'server', 'src', 'server.js');
  const uploadsDir = path.join(app.getPath('userData'), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  serverProcess = fork(entry, [], {
    cwd: path.join(baseDir, 'server'), // pour que dotenv charge server/.env
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // exécute l'enfant comme un Node classique
      PORT: String(PORT),
      UPLOAD_DIR: uploadsDir, // dossier inscriptible (AppData)
      PUBLIC_URL: `http://localhost:${PORT}`,
    },
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => console.log('[serveur] arrêté, code', code));
}

// Attend que /api/health réponde avant d'ouvrir la fenêtre.
function waitForServer(cb, tries = 0) {
  const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
    res.resume();
    if (res.statusCode === 200) cb();
    else retry();
  });
  req.on('error', retry);
  function retry() {
    if (tries > 80) return cb(new Error('Le serveur ne répond pas.'));
    setTimeout(() => waitForServer(cb, tries + 1), 500);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Smart Auto',
    backgroundColor: '#f8fafc',
    icon: path.join(baseDir, isDev ? 'client/public/icon-512.png' : 'client/dist/icon-512.png'),
    webPreferences: { contextIsolation: true },
  });

  mainWindow.setMenuBarVisibility(false);

  // Les liens externes s'ouvrent dans le navigateur, pas dans l'app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
  startServer();
  waitForServer((err) => {
    if (err) {
      dialog.showErrorBox(
        'Smart Auto — erreur de démarrage',
        "Le serveur n'a pas démarré. Vérifiez la connexion MongoDB et la clé GEMINI_API_KEY dans server/.env."
      );
      app.quit();
      return;
    }
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function shutdown() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on('window-all-closed', () => {
  shutdown();
  if (process.platform !== 'darwin') app.quit();
});
app.on('quit', shutdown);
