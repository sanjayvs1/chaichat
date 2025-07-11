import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { RefreshCw, Square, Bot, AlertCircle, Plus, Search, Settings, Github, Moon, Sun, Wifi, WifiOff } from 'lucide-react'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { ModelSelector } from '../components/ModelSelector'
import { ChatSessionList } from '../components/ChatSessionList'
import { SessionIndicator } from '../components/SessionIndicator'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { SystemPromptEditor } from '../components/SystemPromptEditor'
import { ChatSearch } from '../components/ChatSearch'
import { Sidebar, SidebarHeader, SidebarContent, SidebarItem } from '../components/ui/sidebar'
import { useState } from 'react'
import { X } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const {
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
  } = useChat()

  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return true // Default to dark since we set it in main.tsx
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll to bottom when new messages arrive (throttled for streaming)
  useEffect(() => {
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    
    // Throttle scroll updates during streaming
    scrollTimeoutRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }, isLoading ? 100 : 0) // Throttle to 100ms during loading, immediate otherwise
    
    // Cleanup on unmount
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [messages, isLoading])

  // Theme toggle effect
  useEffect(() => {
    const root = window.document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar className="hidden md:flex">
        <SidebarHeader>
          <Button 
            className="w-full justify-start gap-2" 
            variant="outline"
            onClick={clearChat}
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </SidebarHeader>
        
        <SidebarContent>
          <div className="space-y-1">
            <SidebarItem onClick={() => setShowSearch(!showSearch)}>
              <Search className="h-4 w-4" />
              Search chats
            </SidebarItem>
            
            <SidebarItem onClick={() => setShowPromptEditor(!showPromptEditor)}>
              <Settings className="h-4 w-4" />
              System prompt
            </SidebarItem>
          </div>
          
          <div className="mt-4">
            <ChatSessionList
              sessions={sessions}
              currentSessionId={getCurrentSessionId()}
              getSessionsByDateGroup={getSessionsByDateGroup}
              sortedSessions={sortedSessions}
              onLoadSession={loadSession}
              onRenameSession={renameSession}
              onDeleteSession={deleteSession}
              onDuplicateSession={duplicateSession}
              onExportSessions={exportSessions}
              onImportSessions={importSessions}
              onExportSession={exportSession}
            />
          </div>
        </SidebarContent>
      </Sidebar>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
            >
              ☰
            </Button>
            
            {/* Logo and Nav */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <span className="font-semibold hidden sm:inline">ChaiChat</span>
              </div>
            </div>
            
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              loading={isModelsLoading}
            />
          </div>
          
          <div className="flex items-center gap-2">
            {/* Connection status */}
            {isOllamaConnected ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-destructive" />
            )}
            
            <Button
              onClick={loadModels}
              disabled={isModelsLoading}
              variant="ghost"
              size="icon"
            >
              <RefreshCw className={`h-4 w-4 ${isModelsLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
            
            {/* GitHub link */}
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/ollama/ollama"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </a>
            </Button>
            
            {isLoading && (
              <Button
                onClick={stopGeneration}
                variant="destructive"
                size="sm"
              >
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible sections */}
        {showPromptEditor && (
          <div className="border-b bg-muted/30 p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto flex justify-between items-start gap-4">
              <SystemPromptEditor value={systemPrompt} onChange={setSystemPrompt} />
              <Button variant="ghost" size="icon" onClick={() => setShowPromptEditor(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {showSearch && (
          <div className="border-b bg-muted/30 p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto flex justify-between items-start gap-4">
              <ChatSearch search={searchChats} loadSession={loadSession} />
              <Button variant="ghost" size="icon" onClick={() => setShowSearch(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="border-b bg-destructive/10 p-4 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          </div>
        )}

        {/* Session Indicator */}
        <SessionIndicator
          currentSession={getCurrentSession()}
          messageCount={messages.length}
          onSaveAsSession={saveCurrentAsSession}
        />

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center space-y-6 max-w-2xl">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold">
                    {!isOllamaConnected 
                      ? 'Connect to Ollama'
                      : selectedModel 
                        ? `Chat with ${selectedModel}`
                        : 'Select a model to start'
                    }
                  </h1>
                  <p className="text-muted-foreground">
                    {!isOllamaConnected 
                      ? 'Make sure Ollama is running on 127.0.0.1:11434'
                      : selectedModel 
                        ? 'Ask me anything!'
                        : 'Choose a model from the dropdown above'
                    }
                  </p>
                </div>
                {selectedModel && isOllamaConnected && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Try these examples:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <Badge 
                        variant="outline" 
                        className="cursor-pointer hover:bg-muted" 
                        onClick={() => sendMessage('Hello! How are you?')}
                      >
                        Hello! How are you?
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className="cursor-pointer hover:bg-muted" 
                        onClick={() => sendMessage('Explain quantum computing')}
                      >
                        Explain quantum computing
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className="cursor-pointer hover:bg-muted" 
                        onClick={() => sendMessage('Write a poem about coding')}
                      >
                        Write a poem about coding
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-background p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              onSendMessage={sendMessage}
              disabled={isLoading || !selectedModel || !isOllamaConnected}
              placeholder={
                !isOllamaConnected 
                  ? "Ollama is not connected..." 
                  : !selectedModel 
                    ? "Select a model first..."
                    : "Message..."
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
} 