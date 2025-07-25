const { contextBridge, ipcRenderer } = require('electron')

// Expose database API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Session operations
  db: {
    createSession: (session) => ipcRenderer.invoke('db:createSession', session),
    getAllSessions: () => ipcRenderer.invoke('db:getAllSessions'),
    getSession: (sessionId) => ipcRenderer.invoke('db:getSession', sessionId),
    updateSession: (sessionId, updates) => ipcRenderer.invoke('db:updateSession', sessionId, updates),
    deleteSession: (sessionId) => ipcRenderer.invoke('db:deleteSession', sessionId),
    duplicateSession: (sessionId, newSessionId, newTitle) => 
      ipcRenderer.invoke('db:duplicateSession', sessionId, newSessionId, newTitle),
    
    // Message operations
    addMessages: (sessionId, messages) => ipcRenderer.invoke('db:addMessages', sessionId, messages),
    searchMessages: (query) => ipcRenderer.invoke('db:searchMessages', query),
    
    // Settings operations
    getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
    
    // Character operations
    createCharacter: (character) => ipcRenderer.invoke('db:createCharacter', character),
    getAllCharacters: () => ipcRenderer.invoke('db:getAllCharacters'),
    getCharacter: (characterId) => ipcRenderer.invoke('db:getCharacter', characterId),
    updateCharacter: (characterId, updates) => ipcRenderer.invoke('db:updateCharacter', characterId, updates),
    deleteCharacter: (characterId) => ipcRenderer.invoke('db:deleteCharacter', characterId),
    searchCharacters: (query) => ipcRenderer.invoke('db:searchCharacters', query),
    
    // Export/Import operations
    exportSessions: () => ipcRenderer.invoke('db:exportSessions'),
    importSessions: (data) => ipcRenderer.invoke('db:importSessions', data),
    exportToFile: () => ipcRenderer.invoke('db:exportToFile'),
    importFromFile: () => ipcRenderer.invoke('db:importFromFile')
  },

  // File operations for import/export
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath)
})

// Add type definitions for TypeScript
window.electronAPI = window.electronAPI 