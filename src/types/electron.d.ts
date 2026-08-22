import { ChatMessage, ChatSession, Character, CharacterMemory, SavedScript, ScriptExecutionResult } from './ollama'

export interface ElectronAPI {
  db: {
    createSession: (session: ChatSession) => Promise<string>
    getAllSessions: () => Promise<ChatSession[]>
    getSession: (sessionId: string) => Promise<ChatSession | null>
    updateSession: (sessionId: string, updates: Partial<ChatSession>) => Promise<boolean>
    deleteSession: (sessionId: string) => Promise<boolean>
    duplicateSession: (sessionId: string, newSessionId: string, newTitle: string) => Promise<ChatSession | null>
    
    addMessages: (sessionId: string, messages: ChatMessage[]) => Promise<void>
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => Promise<boolean>
    searchMessages: (query: string) => Promise<SearchResult[]>
    
    getSetting: (key: string) => Promise<string | null>
    setSetting: (key: string, value: string) => Promise<void>
    
    // Character operations
    createCharacter: (character: Character) => Promise<string>
    getAllCharacters: () => Promise<Character[]>
    getCharacter: (characterId: string) => Promise<Character | null>
    updateCharacter: (characterId: string, updates: Partial<Character>) => Promise<boolean>
    deleteCharacter: (characterId: string) => Promise<boolean>
    searchCharacters: (query: string) => Promise<Character[]>

    // Character memory operations
    createMemory: (memory: CharacterMemory) => Promise<string>
    getMemoriesForCharacter: (characterId: string) => Promise<CharacterMemory[]>
    getAllMemories: () => Promise<CharacterMemory[]>
    updateMemory: (memoryId: string, updates: Partial<CharacterMemory>) => Promise<boolean>
    deleteMemory: (memoryId: string) => Promise<boolean>
    
    exportSessions: () => Promise<ExportData>
    importSessions: (data: ExportData) => Promise<number>
    exportToFile: () => Promise<void>
    importFromFile: () => Promise<number>

    // Saved script operations
    createSavedScript: (script: SavedScript) => Promise<string>
    getAllSavedScripts: () => Promise<SavedScript[]>
    updateSavedScript: (scriptId: string, updates: Partial<SavedScript>) => Promise<boolean>
    deleteSavedScript: (scriptId: string) => Promise<boolean>
  }
  
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
  writeFile: (filePath: string, data: string) => Promise<boolean>
  readFile: (filePath: string) => Promise<string>
  executeScript: (code: string, timeoutMs?: number) => Promise<ScriptExecutionResult>
}

export interface SearchResult {
  sessionId: string
  message: ChatMessage
  sessionTitle: string
}

export interface ExportData {
  version?: string
  exportDate?: string
  sessions: ChatSession[]
  characters?: Character[]
  memories?: CharacterMemory[]
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  messages: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 