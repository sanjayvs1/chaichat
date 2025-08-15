import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { AlertCircle, Bot, Github, Menu, Moon, Plus, RefreshCw, Search, Settings, Square, Sun, Users, Wifi, WifiOff, X, Key } from 'lucide-react'
import { useEffect, useRef, useState, useMemo, useDeferredValue, useCallback } from 'react'
import { CharacterList } from '../components/CharacterList'
import { CharacterSelector } from '../components/CharacterSelector'
import { ChatInput } from '../components/ChatInput'
import { ChatMessage } from '../components/ChatMessage'
import { ChatSearch } from '../components/ChatSearch'
import { ChatSessionList } from '../components/ChatSessionList'
import { ModelSelector } from '../components/ModelSelector'
import { ProviderSelector } from '../components/ProviderSelector'
import { ApiKeyManager } from '../components/ApiKeyManager'
import { SystemPromptEditor } from '../components/SystemPromptEditor'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Sidebar, SidebarContent, SidebarHeader, SidebarItem } from '../components/ui/sidebar'
import { useChat } from '../hooks/useChat'

export default Index

function Index() {
  const {
    messages,
    sessions,
    models,
    selectedModel,
    setSelectedModel,
    selectedProvider,
    handleProviderChange: hookHandleProviderChange,
    isLoading,
    isModelsLoading,
    error,

    providerStatus,
    sendMessage,
    clearChat,
    loadSession,
    stopGeneration,
    loadModels,
    checkConnections,
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
    characters,
    selectedCharacter,
    isCharactersLoading,
    charactersError,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    duplicateCharacter,
    selectCharacter,
    isLoadingSession
  } = useChat()

  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showCharacters, setShowCharacters] = useState(false)
  const [showApiKeys, setShowApiKeys] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return true // Default to dark since we set it in main.tsx
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)
  const previousSessionId = useRef<string | null>(null)
  const lastAssistantMessageRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const lastAssistantIdRef = useRef<string | null>(null)

  // Force scroll to bottom when switching sessions
  useEffect(() => {
    const currentSessionId = getCurrentSessionId()
    if (currentSessionId !== previousSessionId.current && messagesEndRef.current) {
      // Session changed, force scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      }, 0)
      previousSessionId.current = currentSessionId
    }
  }, [messages, getCurrentSessionId])

  // Remove aggressive auto-scroll during streaming; we'll center on assistant start only

  // Auto-scroll when selecting text in chat area
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    let isSelecting = false
    let scrollAnimation: number | null = null

    function onMouseDown(e: MouseEvent) {
      if (e.target && (e.target as HTMLElement).closest('#main-content')) {
        isSelecting = true
      }
    }
    function onMouseMove(e: MouseEvent) {
      if (!isSelecting || !container) return
      const { clientY } = e
      const { top, bottom } = container.getBoundingClientRect()
      const scrollStep = 40
      // If dragging below the visible area, scroll down
      if (clientY > bottom - 20) {
        if (!scrollAnimation) {
          scrollAnimation = window.requestAnimationFrame(() => {
            if (container) container.scrollTop += scrollStep
            scrollAnimation = null
          })
        }
      } else if (clientY < top + 20) {
        if (!scrollAnimation) {
          scrollAnimation = window.requestAnimationFrame(() => {
            if (container) container.scrollTop -= scrollStep
            scrollAnimation = null
          })
        }
      }
    }
    function onMouseUp() {
      isSelecting = false
      if (scrollAnimation) {
        window.cancelAnimationFrame(scrollAnimation)
        scrollAnimation = null
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (scrollAnimation) window.cancelAnimationFrame(scrollAnimation)
    }
  }, [])

  // Defer large messages array to reduce render pressure during updates
  const deferredMessages = useDeferredValue(messages)
  
  // State for progressive message loading in large sessions
  const [visibleMessageCount, setVisibleMessageCount] = useState(50)
  
  // Memoize messages to prevent unnecessary re-renders
  const messagesForRender = useMemo(() => {
    // For sessions with many messages, show only a subset initially
    if (deferredMessages.length > visibleMessageCount) {
      return deferredMessages.slice(-visibleMessageCount)
    }
    return deferredMessages
  }, [deferredMessages, visibleMessageCount])
  
  const loadMoreMessages = useCallback(() => {
    setVisibleMessageCount(prev => Math.min(prev + 50, messages.length))
  }, [messages.length])

  // Handle scrolling for new messages when they are appended.
  // For LLM responses, position them at the top of the viewport for better readability.
  // For user messages, center them in the viewport.
  useEffect(() => {
    if (messagesForRender.length === 0) return
    const lastMessage = messagesForRender[messagesForRender.length - 1]
    if (lastMessage.id === lastMessageIdRef.current) return

    const container = messagesContainerRef.current
    const target = lastMessage.role === 'assistant' ? lastAssistantMessageRef.current : lastMessageRef.current
    if (container && target) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const currentScrollTop = container.scrollTop
      const targetTopRelativeToContainer = targetRect.top - containerRect.top + currentScrollTop
      
      let desiredTop: number
      if (lastMessage.role === 'assistant') {
        // For LLM responses, position at the top of the viewport with a small offset
        const topOffset = 20 // Small padding from the top
        desiredTop = Math.max(0, targetTopRelativeToContainer - topOffset)
      } else {
        // For user messages, center them in the viewport (existing behavior)
        desiredTop = Math.max(0, targetTopRelativeToContainer - container.clientHeight / 2)
      }
      
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: desiredTop, behavior: 'smooth' })
      } else {
        container.scrollTop = desiredTop
      }
    }

    lastMessageIdRef.current = lastMessage.id
    if (lastMessage.role === 'assistant') {
      lastAssistantIdRef.current = lastMessage.id
    }
  }, [messagesForRender])

  // During streaming, keep the assistant response positioned at the top for readability
  useEffect(() => {
    if (!isLoading || messagesForRender.length === 0) return
    
    const lastMessage = messagesForRender[messagesForRender.length - 1]
    if (lastMessage.role !== 'assistant') return

    const container = messagesContainerRef.current
    const target = lastAssistantMessageRef.current
    
    if (container && target) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const currentScrollTop = container.scrollTop
      const targetTopRelativeToContainer = targetRect.top - containerRect.top + currentScrollTop
      
      // Position at the top with a small offset, but only if we're not already positioned well
      const topOffset = 20
      const desiredTop = Math.max(0, targetTopRelativeToContainer - topOffset)
      const currentOffset = Math.abs(currentScrollTop - desiredTop)
      
      // Only adjust if we're significantly off from the desired position (avoid constant micro-adjustments)
      if (currentOffset > 50) {
        if (typeof container.scrollTo === 'function') {
          container.scrollTo({ top: desiredTop, behavior: 'smooth' })
        } else {
          container.scrollTop = desiredTop
        }
      }
    }
  }, [isLoading, messagesForRender])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n':
            e.preventDefault()
            clearChat()
            break
          case 'k':
            e.preventDefault()
            setShowSearch(!showSearch)
            break
          case '/':
            e.preventDefault()
            setShowPromptEditor(!showPromptEditor)
            break
          case ',':
            e.preventDefault()
            setShowCharacters(!showCharacters)
            break
        }
      }
      
      // Escape key handling
      if (e.key === 'Escape') {
        if (showPromptEditor) setShowPromptEditor(false)
        else if (showSearch) setShowSearch(false)
        else if (showCharacters) setShowCharacters(false)
        else if (showApiKeys) setShowApiKeys(false)
        else if (sidebarOpen) setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showPromptEditor, showSearch, showCharacters, showApiKeys, sidebarOpen, clearChat])

  // Stable onSendMessage to avoid re-rendering ChatInput during streaming
  const sendMessageRef = useRef(sendMessage)
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])
  const handleSendMessage = useCallback((text: string) => {
    sendMessageRef.current(text)
  }, [])

  // Handle provider change - automatically select last used model for that provider
  // If there are existing messages, create a new session to preserve the current one
  const handleProviderChange = useCallback((provider: typeof selectedProvider) => {
    if (messages.length > 0 && provider !== selectedProvider) {
      // Create new session with the new provider
      clearChat().then(() => {
        hookHandleProviderChange(provider)
      })
    } else {
      hookHandleProviderChange(provider)
    }
  }, [hookHandleProviderChange, messages.length, selectedProvider, clearChat])

  // Memoize current session id string to avoid recomputing during renders
  const currentSessionId = useMemo(() => getCurrentSessionId(), [getCurrentSessionId])
  
  // Reset visible message count when switching sessions
  useEffect(() => {
    setVisibleMessageCount(50)
  }, [currentSessionId])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip Links for Accessibility */}
      <div className="sr-only">
        <a
          href="#main-content"
          className="absolute top-0 left-0 z-50 p-4 bg-primary text-primary-foreground focus:not-sr-only focus:fixed"
          onFocus={() => mainContentRef.current?.focus()}
        >
          Skip to main content
        </a>
        <a
          href="#chat-input"
          className="absolute top-0 left-0 z-50 p-4 bg-primary text-primary-foreground focus:not-sr-only focus:fixed"
        >
          Skip to chat input
        </a>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:flex h-screen`}>
        <Sidebar className="w-56 h-screen flex flex-col">
          <SidebarHeader className="h-12 flex-shrink-0">
            <Button 
              className="w-full justify-start gap-2 h-9" 
              variant="outline"
              onClick={clearChat}
            >
              <Plus className="h-4 w-4" />
              New chat
            </Button>
          </SidebarHeader>
          
          <SidebarContent className="flex-1 overflow-y-auto">
            <div className="space-y-1">
              <SidebarItem onClick={() => setShowSearch(!showSearch)}>
                <Search className="h-4 w-4" />
                Search chats
              </SidebarItem>
              
              <SidebarItem onClick={() => setShowPromptEditor(!showPromptEditor)}>
                <Settings className="h-4 w-4" />
                System prompt
              </SidebarItem>
              
              <SidebarItem onClick={() => setShowCharacters(true)}>
                <Users className="h-4 w-4" />
                Characters
              </SidebarItem>
              
              <SidebarItem onClick={() => setShowApiKeys(true)}>
                <Key className="h-4 w-4" />
                API Keys
              </SidebarItem>
            </div>
            
            <div className="mt-4">
              <ChatSessionList
                sessions={sessions}
                currentSessionId={currentSessionId}
                characters={characters}
                getSessionsByDateGroup={getSessionsByDateGroup}
                sortedSessions={sortedSessions}
                onLoadSession={loadSession}
                onRenameSession={renameSession}
                onDeleteSession={deleteSession}
                onDuplicateSession={duplicateSession}
                onExportSessions={exportSessions}
                onImportSessions={importSessions}
                onExportSession={exportSession}
                isLoadingSession={isLoadingSession}
              />
            </div>
          </SidebarContent>
        </Sidebar>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-h-0 max-h-screen">
        {/* Compact Header */}
        <header className="flex h-12 items-center justify-between px-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden h-10 w-10 p-0 touch-manipulation"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </Button>
            
            {/* Logo and Nav */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-semibold hidden sm:inline tracking-tight">ChaiChat</span>
              </div>
              
              <div className="hidden sm:flex items-center gap-2.5">
                <ProviderSelector
                  selectedProvider={selectedProvider}
                  onProviderChange={handleProviderChange}
                  disabled={isLoading}
                />
                
                <ModelSelector
                  models={models.filter(m => m.provider === selectedProvider)}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  loading={isModelsLoading}
                />
                
                <CharacterSelector
                  characters={characters}
                  selectedCharacter={selectedCharacter}
                  onSelectCharacter={selectCharacter}
                  onManageCharacters={() => setShowCharacters(true)}
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Connection status with better accessibility */}
            <div className="flex items-center gap-2 mr-2">
              {selectedProvider === 'ollama' ? (
                providerStatus.ollama ? (
                  <div className="flex items-center gap-1">
                    <Wifi className="h-4 w-4 text-emerald-600" />
                    <span className="sr-only">Connected to Ollama</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <WifiOff className="h-4 w-4 text-destructive" />
                    <span className="sr-only">Disconnected from Ollama</span>
                  </div>
                )
              ) : (
                providerStatus.groq ? (
                  <div className="flex items-center gap-1">
                    <Wifi className="h-4 w-4 text-purple-600" />
                    <span className="sr-only">Connected to Groq</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <WifiOff className="h-4 w-4 text-destructive" />
                    <span className="sr-only">Disconnected from Groq</span>
                  </div>
                )
              )}
            </div>
            
            <Button
              onClick={() => {
                loadModels()
                checkConnections()
              }}
              disabled={isModelsLoading}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 md:h-8 md:w-8 touch-manipulation"
              aria-label="Refresh models and connections"
            >
              <RefreshCw className={`h-4 w-4 ${isModelsLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 md:h-8 md:w-8 touch-manipulation"
              onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            
            {/* GitHub link */}
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 md:h-8 md:w-8 touch-manipulation" asChild>
              <a
                href="https://github.com/sanjayvs1/chaichat"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View ChaiChat on GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </Button>
            
            {isLoading && (
              <Button
                onClick={stopGeneration}
                variant="destructive"
                size="sm"
                className="h-8 px-3"
              >
                <Square className="h-3 w-3 mr-1" />
                Stop
              </Button>
            )}
          </div>
        </header>

        {/* Mobile Model/Character Selectors */}
        <div className="sm:hidden flex flex-col gap-2 p-3 border-b bg-muted/20">
          <ProviderSelector
            selectedProvider={selectedProvider}
            onProviderChange={handleProviderChange}
            disabled={isLoading}
          />
          <ModelSelector
            models={models.filter(m => m.provider === selectedProvider)}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            loading={isModelsLoading}
          />
          <CharacterSelector
            characters={characters}
            selectedCharacter={selectedCharacter}
            onSelectCharacter={selectCharacter}
            onManageCharacters={() => setShowCharacters(true)}
            disabled={isLoading}
          />
        </div>

        {/* Collapsible sections with better integration */}
        {showPromptEditor && (
          <div className="border-b bg-muted/30 p-3 flex-shrink-0">
            <div className="max-w-4xl mx-auto flex justify-between items-start gap-4">
              <SystemPromptEditor value={systemPrompt} onChange={setSystemPrompt} />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowPromptEditor(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close system prompt editor</span>
              </Button>
            </div>
          </div>
        )}

        {showSearch && (
          <div className="border-b bg-muted/30 p-3 flex-shrink-0">
            <div className="max-w-4xl mx-auto flex justify-between items-start gap-4">
              <ChatSearch search={searchChats} loadSession={loadSession} />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setShowSearch(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close search</span>
              </Button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="border-b bg-destructive/10 p-3 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          </div>
        )}

        {/* Messages Area */}
         <div 
          ref={messagesContainerRef} 
          className="flex-1 overflow-y-auto min-h-0 max-h-full bg-background relative"
          id="main-content"
          tabIndex={-1}
          aria-label="Chat messages"
        >
          {/* Session loading overlay */}
          {isLoadingSession && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading session...</span>
              </div>
            </div>
          )}
          {messagesForRender.length === 0 ? (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center space-y-4 max-w-2xl">
                <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-xl font-semibold">
                    {!providerStatus[selectedProvider]
                      ? `Connect to ${selectedProvider === 'groq' ? 'Groq' : 'Ollama'}`
                      : selectedCharacter
                        ? `Chat with ${selectedCharacter.name}`
                        : selectedModel 
                          ? `Chat with ${selectedModel}`
                          : 'Select a model to start'
                    }
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {!providerStatus[selectedProvider]
                      ? selectedProvider === 'groq' 
                        ? 'Set your Groq API key in settings'
                        : 'Make sure Ollama is running on 127.0.0.1:11434'
                      : selectedCharacter
                        ? selectedCharacter.description
                        : selectedModel 
                          ? 'Ask me anything!'
                          : 'Choose a model from the dropdown above'
                    }
                  </p>
                </div>
                {selectedModel && providerStatus[selectedProvider] && (
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
            <>
              {/* Compact Session Indicator */}
              {/* <SessionIndicator
                currentSession={getCurrentSession()}
                messageCount={messages.length}
                onSaveAsSession={saveCurrentAsSession}
                className="px-4 py-2"
              /> */}
              
              <div className={`max-w-3xl w-full mx-auto py-2 transition-opacity duration-200 ${isLoadingSession ? 'opacity-50' : 'opacity-100'}`}>
                {/* Load more messages button */}
                {messages.length > visibleMessageCount && (
                  <div className="text-center mb-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={loadMoreMessages}
                      className="text-xs"
                    >
                      Load {Math.min(50, messages.length - visibleMessageCount)} more messages
                    </Button>
                  </div>
                )}
                
                 {messagesForRender.map((message, idx) => {
                  const isLastAssistant =
                    message.role === 'assistant' &&
                    // Find the last assistant message in the list
                     messagesForRender.slice(idx + 1).findIndex(m => m.role === 'assistant') === -1
                   const isLast = idx === messagesForRender.length - 1
                   return (
                    <div
                      key={message.id}
                      ref={(el) => {
                        if (!el) return
                        if (isLastAssistant) lastAssistantMessageRef.current = el
                        if (isLast) lastMessageRef.current = el
                      }}
                    >
                      <ChatMessage 
                        message={message} 
                        characters={characters}
                      />
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>

        {/* Compact Input Area */}
        <div className="border-t bg-background p-3 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={isLoading || !selectedModel || !providerStatus[selectedProvider]}
              placeholder={
                !providerStatus[selectedProvider]
                  ? `${selectedProvider === 'groq' ? 'Groq API key required' : 'Ollama is not connected'}...`
                  : !selectedModel 
                    ? "Select a model first..."
                    : "Message..."
              }
            />
          </div>
        </div>
      </main>

      {/* Character Management Dialog */}
      <Dialog open={showCharacters} onOpenChange={setShowCharacters}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle asChild>
            <VisuallyHidden>Character Management</VisuallyHidden>
          </DialogTitle>
          <DialogDescription asChild>
            <VisuallyHidden>Manage, create, edit, or delete characters for chat roleplay.</VisuallyHidden>
          </DialogDescription>
          <CharacterList
            characters={characters}
            selectedCharacter={selectedCharacter}
            onSelectCharacter={selectCharacter}
            onCreateCharacter={createCharacter}
            onUpdateCharacter={updateCharacter}
            onDeleteCharacter={deleteCharacter}
            onDuplicateCharacter={duplicateCharacter}
            isLoading={isCharactersLoading}
            error={charactersError}
          />
        </DialogContent>
      </Dialog>

      {/* API Key Management Dialog */}
      <Dialog open={showApiKeys} onOpenChange={setShowApiKeys}>
        <DialogContent className="max-w-md">
          <DialogTitle asChild>
            <VisuallyHidden>API Key Management</VisuallyHidden>
          </DialogTitle>
          <DialogDescription asChild>
            <VisuallyHidden>Manage API keys for AI providers.</VisuallyHidden>
          </DialogDescription>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <h2 className="text-lg font-semibold">API Keys</h2>
            </div>
            
            <ApiKeyManager 
              onApiKeySet={() => {
                checkConnections()
                loadModels()
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 