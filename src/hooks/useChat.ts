import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChatMessage, OllamaModel, ChatSession } from '../types/ollama'
import { OllamaService } from '../services/ollama'
import { dbService } from '../services/database'

const LOCAL_STORAGE_KEY = 'chatMessages'
const SESSIONS_STORAGE_KEY = 'chatSessions'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('gemma2:1b')
  const [isLoading, setIsLoading] = useState(false)
  const [isModelsLoading, setIsModelsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // System prompt (prepended as first assistant message when chatting)
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [isOllamaConnected, setIsOllamaConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load chat history and past sessions from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Migrate from localStorage if in Electron
        await dbService.migrateFromLocalStorage()
        
        // Load sessions from database
        const dbSessions = await dbService.getAllSessions()
        setSessions(dbSessions)
        
        // Load system prompt from database
        const dbSystemPrompt = await dbService.getSetting('systemPrompt')
        if (dbSystemPrompt) {
          setSystemPrompt(dbSystemPrompt)
        }
        
        // Load current messages from localStorage for now (these will be saved to a session)
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (saved) {
          try {
            const parsed: ChatMessage[] = JSON.parse(saved)
            setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })))
          } catch (err) {
            console.error('Failed to parse chat history:', err)
          }
        }
      } catch (error) {
        console.error('Failed to load data from database:', error)
        // Fallback to localStorage if database fails
        const storedSessions = localStorage.getItem(SESSIONS_STORAGE_KEY)
        if (storedSessions) {
          try {
            const parsedSess: ChatSession[] = JSON.parse(storedSessions)
            const revived = parsedSess.map(s => ({
              ...s,
              messages: s.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
            }))
            setSessions(revived)
          } catch (err) {
            console.error('Failed to parse chat sessions:', err)
          }
        }
        
        const systemPromptFromLocal = localStorage.getItem('systemPrompt')
        if (systemPromptFromLocal) {
          setSystemPrompt(systemPromptFromLocal)
        }
      }
      
      setIsInitialized(true)
    }
    
    loadData()
  }, [])

  // Persist chat messages whenever they change (keep using localStorage for current session)
  useEffect(() => {
    if (messages.length) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messages))
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
    }
  }, [messages])

  // Persist system prompt when it changes (but not during initialization)
  useEffect(() => {
    if (isInitialized && systemPrompt !== undefined) {
      dbService.setSetting('systemPrompt', systemPrompt).catch(error => {
        console.error('Failed to save system prompt to database:', error)
        // Fallback to localStorage
        localStorage.setItem('systemPrompt', systemPrompt)
      })
    }
  }, [systemPrompt, isInitialized])

  // Load models on component mount
  useEffect(() => {
    loadModels()
    checkOllamaConnection()
  }, [])

  const checkOllamaConnection = async () => {
    const isConnected = await OllamaService.checkHealth()
    setIsOllamaConnected(isConnected)
  }

  const loadModels = async () => {
    setIsModelsLoading(true)
    setError(null)
    try {
      const response = await OllamaService.getModels()
      setModels(response.models)
      setIsOllamaConnected(true)
      
      // Auto-select gemma2:1b if available, otherwise select first model
      if (response.models.length > 0) {
        const gemmaModel = response.models.find(m => m.name === 'gemma2:1b')
        if (gemmaModel) {
          setSelectedModel('gemma2:1b')
        } else {
          setSelectedModel(response.models[0].name)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
      setIsOllamaConnected(false)
    } finally {
      setIsModelsLoading(false)
    }
  }

  const sendMessage = useCallback(async (content: string) => {
    if (!selectedModel || isLoading) return

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date()
    }

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }

    // Get current messages at the time of sending (not from dependency)
    setMessages(prev => {
      const currentMessages = prev
      setIsLoading(true)
      setError(null)

      // Start streaming in a separate async function to avoid dependency issues
      const startStreaming = async () => {
        try {
          abortControllerRef.current = new AbortController()
          const messageHistory = [
            // include system prompt as first message if provided
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt, id: 'system', timestamp: new Date() }] : []),
            ...currentMessages,
            userMessage,
          ]
          
          let fullResponse = ''
          let lastUpdate = Date.now()
          for await (const chunk of OllamaService.chatStream(selectedModel, messageHistory)) {
            fullResponse += chunk
            const now = Date.now()
            if (now - lastUpdate > 100) { // update at most every 100ms
              lastUpdate = now
              const contentSnapshot = fullResponse
              setMessages(prevMessages => 
                prevMessages.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: contentSnapshot }
                    : msg
                )
              )
            }
          }
          // final update with full content
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: fullResponse }
                : msg
            )
          )
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            // Request was cancelled, remove the incomplete assistant message
            setMessages(prevMessages => prevMessages.filter(msg => msg.id !== assistantMessage.id))
          } else {
            const errorMessage = err instanceof Error ? err.message : 'Failed to get response'
            setError(errorMessage)
            setMessages(prevMessages => 
              prevMessages.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, content: `Error: ${errorMessage}` }
                  : msg
              )
            )
          }
        } finally {
          setIsLoading(false)
          abortControllerRef.current = null
        }
      }

      // Start streaming
      startStreaming()

      // Return the updated messages with user and empty assistant message
      return [...currentMessages, userMessage, assistantMessage]
    })
  }, [selectedModel, isLoading, systemPrompt])

  /**
   * Search across all saved sessions and current messages.
   * Returns array of {sessionId?, message} where sessionId undefined means current session.
   */
  const searchChats = useCallback(
    async (query: string) => {
      if (!query.trim()) return []

      try {
        // Search in database
        const dbResults = await dbService.searchMessages(query)
        
        // Also search current messages (not yet saved to database)
        const lower = query.toLowerCase()
        const currentResults: Array<{ sessionId?: string; message: ChatMessage }> = []
        
        messages.forEach((m) => {
          if (m.content.toLowerCase().includes(lower)) {
            currentResults.push({ message: m })
          }
        })
        
        // Combine database results with current session results
        const combinedResults = [
          ...currentResults,
          ...dbResults.map(result => ({
            sessionId: result.sessionId,
            message: result.message
          }))
        ]
        
        return combinedResults
      } catch (error) {
        console.error('Failed to search in database:', error)
        // Fallback to local search
        const lower = query.toLowerCase()
        const results: Array<{ sessionId?: string; message: ChatMessage }> = []

        messages.forEach((m) => {
          if (m.content.toLowerCase().includes(lower)) {
            results.push({ message: m })
          }
        })

        sessions.forEach((s) => {
          s.messages.forEach((m) => {
            if (m.content.toLowerCase().includes(lower)) {
              results.push({ sessionId: s.id, message: m })
            }
          })
        })
        return results
      }
    },
    [messages, sessions]
  )

  const generateSessionTitle = useCallback((messages: ChatMessage[]) => {
    const firstUserMessage = messages.find(m => m.role === 'user')?.content
    
    if (!firstUserMessage) {
      return 'New Conversation'
    }

    // Clean up the message for better titles
    const title = firstUserMessage
      .replace(/[^\w\s.,?!-]/g, '') // Remove special chars except basic punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

    // If it's a question, keep it as is (up to 50 chars)
    if (title.endsWith('?') && title.length <= 50) {
      return title
    }

    // If it's too long, try to find a good break point
    if (title.length > 50) {
      // Try to break at punctuation
      const punctuationMatch = title.slice(0, 47).match(/^(.+[.!?])\s/)
      if (punctuationMatch) {
        return punctuationMatch[1]
      }
      
      // Try to break at a word boundary
      const wordMatch = title.slice(0, 47).match(/^(.+)\s\w+/)
      if (wordMatch) {
        return wordMatch[1] + '...'
      }
      
      // Last resort: hard truncate with ellipsis
      return title.slice(0, 47) + '...'
    }

    return title
  }, [])

  const clearChat = useCallback(async () => {
    if (messages.length > 0) {
      // Check if current messages are already part of an existing session
      // by comparing message content with existing sessions
      const currentMessagesStr = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })))
      
      let isExistingSession = false
      for (const session of sessions) {
        const sessionMessagesStr = JSON.stringify(session.messages.map(m => ({ role: m.role, content: m.content })))
        if (sessionMessagesStr === currentMessagesStr) {
          isExistingSession = true
          break
        }
      }
      
      // Only save as a new session if it's not already an existing session
      if (!isExistingSession) {
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: generateSessionTitle(messages),
          createdAt: new Date().toISOString(),
          messages
        }
        
        try {
          await dbService.createSession(session)
          setSessions(prev => [session, ...prev])
        } catch (error) {
          console.error('Failed to save session to database:', error)
          // Fallback to local state
          setSessions(prev => [session, ...prev])
        }
      }
    }

    setMessages([])
    setError(null)
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  }, [messages, sessions, generateSessionTitle])

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const session = await dbService.getSession(sessionId)
      if (session) {
        setMessages(session.messages)
        // ensure messages persisted under LOCAL_STORAGE_KEY for continued chatting
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(session.messages))
      }
    } catch (error) {
      console.error('Failed to load session from database:', error)
      // Fallback to local sessions state
      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        setMessages(session.messages)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(session.messages))
      }
    }
  }, [sessions])

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const renameSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      await dbService.updateSession(sessionId, { title: newTitle.trim() || 'Untitled' })
      setSessions(prev => prev.map(session => 
        session.id === sessionId 
          ? { ...session, title: newTitle.trim() || 'Untitled' }
          : session
      ))
    } catch (error) {
      console.error('Failed to rename session in database:', error)
      // Update local state anyway
      setSessions(prev => prev.map(session => 
        session.id === sessionId 
          ? { ...session, title: newTitle.trim() || 'Untitled' }
          : session
      ))
    }
  }, [])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await dbService.deleteSession(sessionId)
      setSessions(prev => prev.filter(session => session.id !== sessionId))
    } catch (error) {
      console.error('Failed to delete session from database:', error)
      // Update local state anyway
      setSessions(prev => prev.filter(session => session.id !== sessionId))
    }
  }, [])

  const duplicateSession = useCallback(async (sessionId: string) => {
    try {
      const newSessionId = crypto.randomUUID()
      const newTitle = sessions.find(s => s.id === sessionId)?.title + ' (Copy)' || 'Copy'
      
      const newSession = await dbService.duplicateSession(sessionId, newSessionId, newTitle)
      if (newSession) {
        setSessions(prev => [newSession, ...prev])
      }
    } catch (error) {
      console.error('Failed to duplicate session in database:', error)
      // Fallback to local duplication
      const session = sessions.find(s => s.id === sessionId)
      if (session) {
        const newSession: ChatSession = {
          ...session,
          id: crypto.randomUUID(),
          title: `${session.title} (Copy)`,
          createdAt: new Date().toISOString()
        }
        setSessions(prev => [newSession, ...prev])
      }
    }
  }, [sessions])

  const getCurrentSessionId = useCallback(() => {
    if (messages.length === 0) return null
    
    // Check if current messages match any existing session
    const currentMessagesStr = JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })))
    
    for (const session of sessions) {
      const sessionMessagesStr = JSON.stringify(session.messages.map(m => ({ role: m.role, content: m.content })))
      if (sessionMessagesStr === currentMessagesStr) {
        return session.id
      }
    }
    
    return null
  }, [messages, sessions])

  const getSessionsByDateGroup = useCallback(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    const groups = {
      today: [] as ChatSession[],
      yesterday: [] as ChatSession[],
      thisWeek: [] as ChatSession[],
      thisMonth: [] as ChatSession[],
      older: [] as ChatSession[]
    }

    sessions.forEach(session => {
      const sessionDate = new Date(session.createdAt)
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate())

      if (sessionDay.getTime() === today.getTime()) {
        groups.today.push(session)
      } else if (sessionDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(session)
      } else if (sessionDate >= thisWeek) {
        groups.thisWeek.push(session)
      } else if (sessionDate >= thisMonth) {
        groups.thisMonth.push(session)
      } else {
        groups.older.push(session)
      }
    })

    // Sort each group by creation time (newest first)
    Object.values(groups).forEach(group => {
      group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    })

    return groups
  }, [sessions])

  const sortedSessions = useCallback((sortBy: 'date' | 'name' | 'length' = 'date') => {
    const sorted = [...sessions]
    
    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case 'name':
        return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case 'length':
        return sorted.sort((a, b) => b.messages.length - a.messages.length)
      default:
        return sorted
    }
  }, [sessions])

  const exportSessions = useCallback(async () => {
    try {
      // Use database service for file operations if in Electron
      if (typeof window !== 'undefined' && window.electronAPI) {
        await dbService.exportToFile()
        return
      }
      
      // Fallback to browser download for development
      const exportData = await dbService.exportSessions()
      if (messages.length > 0) {
        (exportData as Record<string, unknown>).currentMessages = messages
      }
      
      const dataStr = JSON.stringify(exportData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      
      const link = document.createElement('a')
      link.href = URL.createObjectURL(dataBlob)
      link.download = `chaichat-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to export sessions:', error)
    }
  }, [messages])

  const importSessions = useCallback(async (file?: File) => {
    try {
      // Use database service for file operations if in Electron and no file provided
      if (!file && typeof window !== 'undefined' && window.electronAPI) {
        const importedCount = await dbService.importFromFile()
        if (importedCount > 0) {
          // Reload sessions from database
          const dbSessions = await dbService.getAllSessions()
          setSessions(dbSessions)
        }
        return importedCount > 0
      }
      
      // Handle file-based import (for development or when file is provided)
      if (!file) {
        throw new Error('No file provided for import')
      }
      
      return new Promise<boolean>((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string
            const importData = JSON.parse(content)
            
            // Use database service to import
            const importedCount = await dbService.importSessions(importData)
            
            if (importedCount > 0) {
              // Reload sessions from database
              const dbSessions = await dbService.getAllSessions()
              setSessions(dbSessions)
            }
            
            // Optionally restore current messages if they exist and current chat is empty
            if (importData.currentMessages && messages.length === 0) {
              const revivedMessages = (importData.currentMessages as ChatMessage[]).map((msg) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
              setMessages(revivedMessages)
            }
            
            resolve(importedCount > 0)
          } catch (err) {
            reject(new Error(`Failed to import sessions: ${err instanceof Error ? err.message : 'Unknown error'}`))
          }
        }
        
        reader.onerror = () => {
          reject(new Error('Failed to read import file'))
        }
        
        reader.readAsText(file)
      })
    } catch (error) {
      console.error('Import failed:', error)
      throw error
    }
  }, [messages, setMessages, setSessions])

  const exportSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      session: session
    }
    
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataBlob)
    link.download = `chaichat-session-${session.title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }, [sessions])

  const saveCurrentAsSession = useCallback(async () => {
    if (messages.length === 0) return null
    
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: generateSessionTitle(messages),
      createdAt: new Date().toISOString(),
      messages
    }
    
    try {
      await dbService.createSession(session)
      setSessions(prev => [session, ...prev])
      return session.id
    } catch (error) {
      console.error('Failed to save session to database:', error)
      // Fallback to local state
      setSessions(prev => [session, ...prev])
      return session.id
    }
  }, [messages, generateSessionTitle])

  const getCurrentSession = useCallback(() => {
    const sessionId = getCurrentSessionId()
    return sessionId ? sessions.find(s => s.id === sessionId) || null : null
  }, [getCurrentSessionId, sessions])

  return {
    messages,
    sessions,
    models,
    selectedModel,
    setSelectedModel,
    isLoading,
    isModelsLoading,
    error,
    isOllamaConnected,
    sendMessage,
    clearChat,
    loadSession,
    stopGeneration,
    loadModels,
    systemPrompt,
    setSystemPrompt,
    searchChats,
    renameSession,
    deleteSession,
    duplicateSession,
    getCurrentSessionId,
    getSessionsByDateGroup,
    sortedSessions,
    exportSessions,
    importSessions,
    exportSession,
    saveCurrentAsSession,
    getCurrentSession
  }
} 