import { contextBridge, ipcRenderer } from 'electron'

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
    
    // Export/Import operations
    exportSessions: () => ipcRenderer.invoke('db:exportSessions'),
    importSessions: (data) => ipcRenderer.invoke('db:importSessions', data)
  },

  // File operations for import/export
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath)
})

// Add type definitions for TypeScript
window.electronAPI = window.electronAPI 