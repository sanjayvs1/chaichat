import type { ChatSession, ChatMessage, Character, CharacterMemory, SavedScript, ScriptExecutionResult } from '../types/chat'

// Helper to ensure we're running inside Electron renderer
const getElectronDB = () => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('Electron database API not available')
  }
  return window.electronAPI.db
}

export class DatabaseService {
  private get api() {
    return getElectronDB()
  }

  async createSession(session: ChatSession): Promise<string> {
    return this.api.createSession(session)
  }

  async getAllSessions(): Promise<ChatSession[]> {
    return this.api.getAllSessions()
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.api.getSession(sessionId)
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<boolean> {
    return this.api.updateSession(sessionId, updates)
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.api.deleteSession(sessionId)
  }

  async duplicateSession(sessionId: string, newSessionId: string, newTitle: string): Promise<ChatSession | null> {
    return this.api.duplicateSession(sessionId, newSessionId, newTitle)
  }

  async addMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    return this.api.addMessages(sessionId, messages)
  }

  async updateMessage(messageId: string, updates: Partial<ChatMessage>): Promise<boolean> {
    return this.api.updateMessage(messageId, updates)
  }

  async deleteMessages(messageIds: string[]): Promise<number> {
    return this.api.deleteMessages(messageIds)
  }

  async searchMessages(query: string): Promise<Array<{ sessionId: string; message: ChatMessage; sessionTitle: string }>> {
    return this.api.searchMessages(query)
  }

  async getSetting(key: string): Promise<string | null> {
    return this.api.getSetting(key)
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.setSetting(key, value)
    }
    // Fallback for development
    localStorage.setItem(`setting_${key}`, value)
  }

  // Character operations
  async createCharacter(character: Character): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.createCharacter(character)
    }
    // Fallback for development
    const characters = await this.getAllCharacters()
    characters.push(character)
    localStorage.setItem('characters', JSON.stringify(characters))
    return character.id
  }

  async getAllCharacters(): Promise<Character[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.getAllCharacters()
    }
    // Fallback for development
    const stored = localStorage.getItem('characters')
    return stored ? JSON.parse(stored) : []
  }

  async getCharacter(characterId: string): Promise<Character | null> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.getCharacter(characterId)
    }
    // Fallback for development
    const characters = await this.getAllCharacters()
    return characters.find(c => c.id === characterId) || null
  }

  async updateCharacter(characterId: string, updates: Partial<Character>): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.updateCharacter(characterId, updates)
    }
    // Fallback for development
    const characters = await this.getAllCharacters()
    const index = characters.findIndex(c => c.id === characterId)
    if (index === -1) return false
    
    characters[index] = { ...characters[index], ...updates, updatedAt: new Date().toISOString() }
    localStorage.setItem('characters', JSON.stringify(characters))
    return true
  }

  async deleteCharacter(characterId: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.deleteCharacter(characterId)
    }
    // Fallback for development
    const characters = await this.getAllCharacters()
    const filtered = characters.filter(c => c.id !== characterId)
    if (filtered.length === characters.length) return false
    
    localStorage.setItem('characters', JSON.stringify(filtered))
    return true
  }

  async searchCharacters(query: string): Promise<Character[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.searchCharacters(query)
    }
    // Fallback for development
    const characters = await this.getAllCharacters()
    const lowerQuery = query.toLowerCase()
    return characters.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery)
    )
  }

  // Character memory operations
  async createMemory(memory: CharacterMemory): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.createMemory(memory)
    }
    const memories = JSON.parse(localStorage.getItem('characterMemories') || '[]')
    memories.push(memory)
    localStorage.setItem('characterMemories', JSON.stringify(memories))
    return memory.id
  }

  async getMemoriesForCharacter(characterId: string): Promise<CharacterMemory[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.getMemoriesForCharacter(characterId)
    }
    const memories: CharacterMemory[] = JSON.parse(localStorage.getItem('characterMemories') || '[]')
    return memories
      .filter(m => m.characterId === characterId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100)
  }

  async getAllMemories(): Promise<CharacterMemory[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.getAllMemories()
    }
    return JSON.parse(localStorage.getItem('characterMemories') || '[]')
  }

  async updateMemory(memoryId: string, updates: Partial<CharacterMemory>): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.updateMemory(memoryId, updates)
    }
    const memories: CharacterMemory[] = JSON.parse(localStorage.getItem('characterMemories') || '[]')
    const idx = memories.findIndex(m => m.id === memoryId)
    if (idx === -1) return false
    memories[idx] = { ...memories[idx], ...updates, updatedAt: new Date().toISOString() }
    localStorage.setItem('characterMemories', JSON.stringify(memories))
    return true
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.deleteMemory(memoryId)
    }
    const memories: CharacterMemory[] = JSON.parse(localStorage.getItem('characterMemories') || '[]')
    localStorage.setItem('characterMemories', JSON.stringify(memories.filter(m => m.id !== memoryId)))
    return true
  }

  // Export/Import operations
  async exportSessions(): Promise<{ version?: string; exportDate?: string; sessions: ChatSession[] }> {
    return this.api.exportSessions()
  }

  async importSessions(data: { sessions: ChatSession[]; characters?: Character[]; memories?: CharacterMemory[] }): Promise<number> {
    return this.api.importSessions(data)
  }

  // File operations (only available in Electron)
  async exportToFile(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('File operations are only available in Electron')
    }

    const data = await this.exportSessions()
    const result = await window.electronAPI.showSaveDialog({
      defaultPath: `chaichat-export-${new Date().toISOString().split('T')[0]}.json`,
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    })

    if (!result.canceled && result.filePath) {
      await window.electronAPI.writeFile(result.filePath, JSON.stringify(data, null, 2))
    }
  }

  async importFromFile(): Promise<number> {
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('File operations are only available in Electron')
    }

    const result = await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    })

    if (result.canceled || !result.filePaths[0]) {
      return 0
    }

    const fileContent = await window.electronAPI.readFile(result.filePaths[0])
    const data = JSON.parse(fileContent)
    return this.importSessions(data)
  }

  // Saved script operations
  async createSavedScript(script: SavedScript): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.createSavedScript(script)
    }
    const scripts = await this.getAllSavedScripts()
    scripts.push(script)
    localStorage.setItem('savedScripts', JSON.stringify(scripts))
    return script.id
  }

  async getAllSavedScripts(): Promise<SavedScript[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.getAllSavedScripts()
    }
    const stored = localStorage.getItem('savedScripts')
    return stored ? JSON.parse(stored) : []
  }

  async updateSavedScript(scriptId: string, updates: Partial<SavedScript>): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.updateSavedScript(scriptId, updates)
    }
    const scripts = await this.getAllSavedScripts()
    const idx = scripts.findIndex(s => s.id === scriptId)
    if (idx === -1) return false
    scripts[idx] = { ...scripts[idx], ...updates, updatedAt: new Date().toISOString() }
    localStorage.setItem('savedScripts', JSON.stringify(scripts))
    return true
  }

  async deleteSavedScript(scriptId: string): Promise<boolean> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.db.deleteSavedScript(scriptId)
    }
    const scripts = await this.getAllSavedScripts()
    const filtered = scripts.filter(s => s.id !== scriptId)
    if (filtered.length === scripts.length) return false
    localStorage.setItem('savedScripts', JSON.stringify(filtered))
    return true
  }

  async executeScript(code: string, timeoutMs?: number): Promise<ScriptExecutionResult> {
    if (typeof window !== 'undefined' && window.electronAPI?.executeScript) {
      return window.electronAPI.executeScript(code, timeoutMs)
    }
    return {
      success: false,
      stdout: '',
      stderr: 'Script execution is only available in the desktop app.',
      exitCode: 1,
      timedOut: false,
    }
  }

  // Migration helper
  async migrateFromLocalStorage(): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI) return

    console.log('Checking for localStorage data to migrate...')
    
    // Check if we have old localStorage data
    const oldSessions = localStorage.getItem('chatSessions')
    const oldSystemPrompt = localStorage.getItem('systemPrompt')
    
    if (oldSessions) {
      try {
        const sessions = JSON.parse(oldSessions)
        console.log(`Found ${sessions.length} sessions to migrate`)
        
        for (const session of sessions) {
          // Ensure messages have proper timestamps
          session.messages = session.messages.map((msg: ChatMessage) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
          
          await this.createSession(session)
        }
        
        // Clear old localStorage data after successful migration
        localStorage.removeItem('chatSessions')
        console.log('Migration completed successfully')
      } catch (error) {
        console.error('Error migrating sessions:', error)
      }
    }
    
    if (oldSystemPrompt) {
      try {
        await this.setSetting('systemPrompt', oldSystemPrompt)
        localStorage.removeItem('systemPrompt')
        console.log('System prompt migrated successfully')
      } catch (error) {
        console.error('Error migrating system prompt:', error)
      }
    }
  }
}

export const dbService = new DatabaseService() 