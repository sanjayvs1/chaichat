export interface ElectronAPI {
  db: {
    createSession: (session: ChatSession) => Promise<string>
    getAllSessions: () => Promise<ChatSession[]>
    getSession: (sessionId: string) => Promise<ChatSession | null>
    updateSession: (sessionId: string, updates: Partial<ChatSession>) => Promise<boolean>
    deleteSession: (sessionId: string) => Promise<boolean>
    duplicateSession: (sessionId: string, newSessionId: string, newTitle: string) => Promise<ChatSession | null>
    
    addMessages: (sessionId: string, messages: ChatMessage[]) => Promise<void>
    searchMessages: (query: string) => Promise<SearchResult[]>
    
    getSetting: (key: string) => Promise<string | null>
    setSetting: (key: string, value: string) => Promise<void>
    
    exportSessions: () => Promise<ExportData>
    importSessions: (data: ExportData) => Promise<number>
  }
  
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>
  writeFile: (filePath: string, data: string) => Promise<boolean>
  readFile: (filePath: string) => Promise<string>
}

export interface SearchResult {
  sessionId: string
  message: ChatMessage
  sessionTitle: string
}

export interface ExportData {
  version: string
  exportDate: string
  sessions: ChatSession[]
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