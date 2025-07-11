import type { ChatSession, ChatMessage } from '../types/ollama'

// Check if we're running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI
}

// Fallback storage for when not in Electron (during development with Vite)
class LocalStorageService {
  private getKey(key: string): string {
    return `chaichat_${key}`
  }

  async createSession(session: ChatSession): Promise<string> {
    const sessions = await this.getAllSessions()
    sessions.unshift(session)
    localStorage.setItem(this.getKey('sessions'), JSON.stringify(sessions))
    return session.id
  }

  async getAllSessions(): Promise<ChatSession[]> {
    const stored = localStorage.getItem(this.getKey('sessions'))
    if (!stored) return []
    
    try {
      const sessions = JSON.parse(stored)
      return sessions.map((s: any) => ({
        ...s,
        messages: s.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }))
      }))
    } catch {
      return []
    }
  }

  async getSession(sessionId: string): Promise<ChatSession | null> {
    const sessions = await this.getAllSessions()
    return sessions.find(s => s.id === sessionId) || null
  }

  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<boolean> {
    const sessions = await this.getAllSessions()
    const index = sessions.findIndex(s => s.id === sessionId)
    if (index === -1) return false

    sessions[index] = { ...sessions[index], ...updates }
    localStorage.setItem(this.getKey('sessions'), JSON.stringify(sessions))
    return true
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const sessions = await this.getAllSessions()
    const filtered = sessions.filter(s => s.id !== sessionId)
    localStorage.setItem(this.getKey('sessions'), JSON.stringify(filtered))
    return sessions.length !== filtered.length
  }

  async duplicateSession(sessionId: string, newSessionId: string, newTitle: string): Promise<ChatSession | null> {
    const session = await this.getSession(sessionId)
    if (!session) return null

    const newSession: ChatSession = {
      ...session,
      id: newSessionId,
      title: newTitle,
      createdAt: new Date().toISOString()
    }

    await this.createSession(newSession)
    return newSession
  }

  async addMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    // For localStorage, we don't need to do anything special
    // Messages are already part of the session
  }

  async searchMessages(query: string): Promise<Array<{ sessionId: string; message: ChatMessage; sessionTitle: string }>> {
    const sessions = await this.getAllSessions()
    const results: Array<{ sessionId: string; message: ChatMessage; sessionTitle: string }> = []
    
    const lowerQuery = query.toLowerCase()
    
    for (const session of sessions) {
      for (const message of session.messages) {
        if (message.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            sessionId: session.id,
            message,
            sessionTitle: session.title
          })
        }
      }
    }
    
    return results
  }

  async getSetting(key: string): Promise<string | null> {
    return localStorage.getItem(this.getKey(`setting_${key}`))
  }

  async setSetting(key: string, value: string): Promise<void> {
    localStorage.setItem(this.getKey(`setting_${key}`), value)
  }

  async exportSessions(): Promise<{ version: string; exportDate: string; sessions: ChatSession[] }> {
    const sessions = await this.getAllSessions()
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      sessions
    }
  }

  async importSessions(data: any): Promise<number> {
    if (!data.sessions || !Array.isArray(data.sessions)) {
      throw new Error('Invalid import data format')
    }

    const existingSessions = await this.getAllSessions()
    const existingIds = new Set(existingSessions.map(s => s.id))
    
    const newSessions = data.sessions.filter((session: ChatSession) => 
      !existingIds.has(session.id)
    )

    const allSessions = [...newSessions, ...existingSessions]
    localStorage.setItem(this.getKey('sessions'), JSON.stringify(allSessions))
    
    return newSessions.length
  }
}

// Database service that uses either Electron IPC or localStorage fallback
export class DatabaseService {
  private localStorageService = new LocalStorageService()

  private get api() {
    if (isElectron()) {
      return window.electronAPI.db
    }
    return this.localStorageService
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

  async searchMessages(query: string): Promise<Array<{ sessionId: string; message: ChatMessage; sessionTitle: string }>> {
    return this.api.searchMessages(query)
  }

  async getSetting(key: string): Promise<string | null> {
    return this.api.getSetting(key)
  }

  async setSetting(key: string, value: string): Promise<void> {
    return this.api.setSetting(key, value)
  }

  async exportSessions(): Promise<{ version: string; exportDate: string; sessions: ChatSession[] }> {
    return this.api.exportSessions()
  }

  async importSessions(data: any): Promise<number> {
    return this.api.importSessions(data)
  }

  // File operations (only available in Electron)
  async exportToFile(): Promise<void> {
    if (!isElectron()) {
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
    if (!isElectron()) {
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

  // Migration helper
  async migrateFromLocalStorage(): Promise<void> {
    if (!isElectron()) return

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
          session.messages = session.messages.map((msg: any) => ({
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