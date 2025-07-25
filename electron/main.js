import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import DatabaseService from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  const { default: squirrelStartup } = await import('electron-squirrel-startup')
  if (squirrelStartup) {
    app.quit()
  }
} catch (e) {
  // electron-squirrel-startup is optional
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '..', 'public', 'vite.svg'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    
    if (parsedUrl.origin !== 'http://localhost:5173' && parsedUrl.origin !== 'file://') {
      event.preventDefault()
      shell.openExternal(navigationUrl)
    }
  })

  return mainWindow
}

// Create application menu
function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Initialize IPC handlers with real database
function setupDatabase() {
  const db = new DatabaseService();
  setupIpcHandlers(db);
}

function setupIpcHandlers(db) {
  // Session operations
  ipcMain.handle('db:createSession', async (event, session) => db.createSession(session));
  ipcMain.handle('db:getAllSessions', async () => db.getAllSessions());
  ipcMain.handle('db:getSession', async (event, sessionId) => db.getSession(sessionId));
  ipcMain.handle('db:updateSession', async (event, sessionId, updates) => db.updateSession(sessionId, updates));
  ipcMain.handle('db:deleteSession', async (event, sessionId) => db.deleteSession(sessionId));
  ipcMain.handle('db:duplicateSession', async (event, sessionId, newSessionId, newTitle) => 
    db.duplicateSession(sessionId, newSessionId, newTitle)
  );

  // Message operations
  ipcMain.handle('db:addMessages', async (event, sessionId, messages) => db.addMessages(sessionId, messages));
  ipcMain.handle('db:searchMessages', async (event, query) => db.searchMessages(query));

  // Settings operations
  ipcMain.handle('db:getSetting', async (event, key) => db.getSetting(key));
  ipcMain.handle('db:setSetting', async (event, key, value) => db.setSetting(key, value));

  // Character operations
  ipcMain.handle('db:createCharacter', async (event, character) => db.createCharacter(character));
  ipcMain.handle('db:getAllCharacters', async () => db.getAllCharacters());
  ipcMain.handle('db:getCharacter', async (event, characterId) => db.getCharacter(characterId));
  ipcMain.handle('db:updateCharacter', async (event, characterId, updates) => db.updateCharacter(characterId, updates));
  ipcMain.handle('db:deleteCharacter', async (event, characterId) => db.deleteCharacter(characterId));
  ipcMain.handle('db:searchCharacters', async (event, query) => db.searchCharacters(query));

  // Export/Import operations
  ipcMain.handle('db:exportSessions', async () => db.exportSessions());
  ipcMain.handle('db:importSessions', async (event, data) => db.importSessions(data));
  ipcMain.handle('db:exportToFile', async () => db.exportToFile());
  ipcMain.handle('db:importFromFile', async () => db.importFromFile());

  // File dialog operations
  ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
    const result = await dialog.showSaveDialog(options)
    return result
  })

  ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    const result = await dialog.showOpenDialog(options)
    return result
  })

  // File system operations
  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    await fs.writeFile(filePath, data, 'utf8')
    return true
  })

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    const data = await fs.readFile(filePath, 'utf8')
    return data
  })
}

// Add global handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow()
  createMenu()
  
  // Setup database after window is created
  setupDatabase()

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch(err => {
  console.error('Error during app startup:', err);
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up when app is closing
app.on('before-quit', () => {
  console.log('App is closing...')
})

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault()
    shell.openExternal(navigationUrl)
  })
}) 