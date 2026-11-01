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
    updateMessage: (messageId, updates) => ipcRenderer.invoke('db:updateMessage', messageId, updates),
    deleteMessages: (messageIds) => ipcRenderer.invoke('db:deleteMessages', messageIds),
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

    // Character memory operations
    createMemory: (memory) => ipcRenderer.invoke('db:createMemory', memory),
    getMemoriesForCharacter: (characterId) => ipcRenderer.invoke('db:getMemoriesForCharacter', characterId),
    getAllMemories: () => ipcRenderer.invoke('db:getAllMemories'),
    updateMemory: (memoryId, updates) => ipcRenderer.invoke('db:updateMemory', memoryId, updates),
    deleteMemory: (memoryId) => ipcRenderer.invoke('db:deleteMemory', memoryId),
    
    // Export/Import operations
    exportSessions: () => ipcRenderer.invoke('db:exportSessions'),
    importSessions: (data) => ipcRenderer.invoke('db:importSessions', data),
    exportToFile: () => ipcRenderer.invoke('db:exportToFile'),
    importFromFile: () => ipcRenderer.invoke('db:importFromFile'),

    // Saved script operations
    createSavedScript: (script) => ipcRenderer.invoke('db:createSavedScript', script),
    getAllSavedScripts: () => ipcRenderer.invoke('db:getAllSavedScripts'),
    updateSavedScript: (scriptId, updates) => ipcRenderer.invoke('db:updateSavedScript', scriptId, updates),
    deleteSavedScript: (scriptId) => ipcRenderer.invoke('db:deleteSavedScript', scriptId)
  },

  // LLM connections. API keys go in here but never come back out.
  llm: {
    init: (legacy) => ipcRenderer.invoke('llm:init', legacy),
    listConnections: () => ipcRenderer.invoke('llm:listConnections'),
    saveConnection: (input) => ipcRenderer.invoke('llm:saveConnection', input),
    deleteConnection: (id) => ipcRenderer.invoke('llm:deleteConnection', id),
    forgetAllKeys: () => ipcRenderer.invoke('llm:forgetAllKeys'),
    testConnection: (draft) => ipcRenderer.invoke('llm:testConnection', draft),
    detectLocalServers: () => ipcRenderer.invoke('llm:detectLocalServers'),
    listModels: (id) => ipcRenderer.invoke('llm:listModels', id),
    startChat: (requestId, request) => ipcRenderer.invoke('llm:startChat', requestId, request),
    abortChat: (requestId) => ipcRenderer.invoke('llm:abortChat', requestId),
    onChatEvent: (requestId, callback) => {
      const listener = (_event, chatEvent) => {
        if (chatEvent.requestId === requestId) callback(chatEvent)
      }
      ipcRenderer.on('llm:chat-event', listener)
      return () => ipcRenderer.removeListener('llm:chat-event', listener)
    }
  },

  // Script execution
  executeScript: (code, timeoutMs) => ipcRenderer.invoke('script:execute', code, timeoutMs),

  // File operations for import/export
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath)
})

// Add type definitions for TypeScript
window.electronAPI = window.electronAPI 