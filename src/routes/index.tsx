import { AlertCircle, ArrowDown, BookOpenText, Coffee, Moon, PanelLeft, Plug, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Sun, UserRound, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { CharacterAvatar } from '../components/CharacterAvatar'
import { CharacterGallery } from '../components/CharacterGallery'
import { ChatInput } from '../components/ChatInput'
import { ChatMessage } from '../components/ChatMessage'
import { ChatSessionList } from '../components/ChatSessionList'
import { CommandPalette, type PaletteAction } from '../components/CommandPalette'
import { ConnectionManager } from '../components/ConnectionManager'
import { MemoryPanel } from '../components/MemoryPanel'
import { ModelSelector } from '../components/ModelSelector'
import { ParticipantsBar } from '../components/ParticipantsBar'
import { ProviderSelector } from '../components/ProviderSelector'
import { SettingsDialog, type SettingsSection } from '../components/SettingsDialog'
import { Button } from '../components/ui/button'
import { useChat } from '../hooks/useChat'
import { dbService } from '../services/database'
import { nameHue } from '@/lib/cards'
import { formatTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { Character, SavedScript } from '../types/chat'

export default Index

const PAGE_SIZE = 50
// How close to the bottom still counts as following along
const STICK_THRESHOLD_PX = 120

function Index() {
  const chat = useChat()
  const {
    messages,
    sessions,
    models,
    selectedModel,
    setSelectedModel,
    selectedProvider,
    handleProviderChange,
    isLoading,
    isModelsLoading,
    error,
    providerStatus,
    connections,
    presets,
    encryptionAvailable,
    connectionError,
    connectionNotice,
    dismissConnectionNotice,
    refreshConnections,
    autoConnect,
    setAutoConnect,
    sendMessage,
    continueResponse,
    regenerate,
    impersonate,
    impersonation,
    clearImpersonation,
    swipeMessage,
    deleteMessage,
    editMessage,
    resendFromMessage,
    branchFromMessage,
    clearChat,
    loadSession,
    stopGeneration,
    reconnect,
    systemPrompt,
    setSystemPrompt,
    searchChats,
    renameSession,
    deleteSession,
    duplicateSession,
    getCurrentSessionId,
    getSessionsByDateGroup,
    exportSessions,
    importSessions,
    exportSession,
    characters,
    charactersError,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    duplicateCharacter,
    selectCharacter,
    startChatWith,
    importCharacters,
    participants,
    activeTarget,
    activeTargetId,
    removeParticipant,
    isLoadingSession,
    settings,
    updateSettings,
    personas,
    persona,
    savePersona,
    deletePersona,
    currentSession,
    updateCurrentSession,
    summarizeNow,
    isSummarizing,
    memoryError,
    unsummarized,
    lastPrompt,
    previewPrompt,
    replyAll,
    setReplyAll,
  } = chat

  const [view, setView] = useState<'chat' | 'characters'>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [noteFocus, setNoteFocus] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('persona')
  const [isDraggingCard, setIsDraggingCard] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  const currentSessionId = useMemo(() => getCurrentSessionId(), [getCurrentSessionId])
  const selectedConnection = connections.find(c => c.id === selectedProvider)
  const isConnected = !!providerStatus[selectedProvider]
  const canGenerate = !!selectedModel && isConnected
  const lastMessage = messages[messages.length - 1]
  const canRewrite = lastMessage?.role === 'assistant' && !!lastMessage.content.trim()
  const hue = activeTarget ? nameHue(activeTarget.name) : undefined

  // Theme, accent and message font live on <html> so dialogs pick them up too
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    root.dataset.accent = settings.accent
    root.dataset.chatFont = settings.chatFont
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark, settings.accent, settings.chatFont])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior })
  }, [])

  const handleScroll = () => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_THRESHOLD_PX
    followRef.current = atBottom
    setIsAtBottom(atBottom)
  }

  // Follow the conversation unless the reader scrolled up to look at something
  useEffect(() => {
    if (followRef.current) scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    followRef.current = true
    setIsAtBottom(true)
    setVisibleCount(PAGE_SIZE)
    requestAnimationFrame(() => scrollToBottom())
  }, [currentSessionId, view, scrollToBottom])

  // Keeps the panel about the chat on screen. Waits for the switch to land, the report
  // cleared by loading a session would otherwise be rebuilt for the previous character.
  const previewRef = useRef(previewPrompt)
  previewRef.current = previewPrompt
  useEffect(() => {
    if (memoryOpen && view === 'chat' && !isLoading && !isLoadingSession) previewRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isLoading isn't a reason to rebuild, generating sets its own report
  }, [memoryOpen, view, currentSessionId, activeTargetId, isLoadingSession])

  const openSettings = useCallback((section: SettingsSection) => {
    setSettingsSection(section)
    setSettingsOpen(true)
  }, [])

  const openNote = useCallback(() => {
    setMemoryOpen(true)
    setNoteFocus((n) => n + 1)
  }, [])

  const startNewChat = useCallback(() => {
    setView('chat')
    clearChat()
  }, [clearChat])

  const openSession = useCallback((sessionId: string) => {
    setView('chat')
    loadSession(sessionId)
  }, [loadSession])

  const beginChat = useCallback((character: Character) => {
    setView('chat')
    startChatWith(character)
  }, [startChatWith])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'n') {
        e.preventDefault()
        startNewChat()
      } else if (e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((isOpen) => !isOpen)
      } else if (e.key === ',') {
        e.preventDefault()
        openSettings('persona')
      } else if (e.key === 'b') {
        e.preventDefault()
        setSidebarOpen((isOpen) => !isOpen)
      } else if (e.key === 'm') {
        e.preventDefault()
        setMemoryOpen((isOpen) => !isOpen)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [startNewChat, openSettings])

  const handleImport = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    const imported = await importCharacters(files)
    if (imported.length > 0) {
      setToast(imported.length === 1 ? `${imported[0].name} joined your shelf.` : `${imported.length} characters added.`)
      setView('characters')
    }
  }, [importCharacters])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingCard(false)
    const cards = Array.from(e.dataTransfer.files).filter((file) => /\.(png|json)$/i.test(file.name))
    handleImport(cards)
  }

  // Stable handlers for the memoized message list, so streaming only re-renders the last one
  const handlers = useRef({ sendMessage, editMessage, resendFromMessage, branchFromMessage, deleteMessage, swipeMessage })
  handlers.current = { sendMessage, editMessage, resendFromMessage, branchFromMessage, deleteMessage, swipeMessage }
  const handleSend = useCallback((text: string) => {
    followRef.current = true
    handlers.current.sendMessage(text)
  }, [])
  const handleEdit = useCallback((id: string, content: string, resend: boolean) => {
    handlers.current.editMessage(id, content, resend)
  }, [])
  const handleResend = useCallback((id: string) => handlers.current.resendFromMessage(id), [])
  const handleBranch = useCallback((id: string) => handlers.current.branchFromMessage(id), [])
  const handleDelete = useCallback((id: string) => handlers.current.deleteMessage(id), [])
  const handleSwipe = useCallback((id: string, direction: -1 | 1) => {
    followRef.current = true
    handlers.current.swipeMessage(id, direction)
  }, [])

  const lastMessageRef = useRef(lastMessage)
  lastMessageRef.current = lastMessage
  const handleSwipeLast = useCallback((direction: -1 | 1) => {
    const last = lastMessageRef.current
    if (last?.role === 'assistant') handleSwipe(last.id, direction)
  }, [handleSwipe])

  const handleSaveScript = useCallback((code: string, language: string) => {
    const now = new Date().toISOString()
    const firstLine = code.split('\n')[0]?.trim() || ''
    const autoName = firstLine.startsWith('#')
      ? firstLine.replace(/^#+\s*/, '').slice(0, 60)
      : `Script ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`

    const script: SavedScript = {
      id: crypto.randomUUID(),
      name: autoName,
      code,
      language: language || 'python',
      createdAt: now,
      updatedAt: now,
      sessionId: getCurrentSessionId() || null,
    }
    dbService.createSavedScript(script).catch(err => console.error('Failed to save script:', err))
  }, [getCurrentSessionId])

  const paletteActions = useMemo<PaletteAction[]>(() => [
    { id: 'new', label: 'New chat', hint: 'Ctrl+N', icon: Plus, run: startNewChat },
    { id: 'characters', label: 'Browse characters', icon: Users, run: () => setView('characters') },
    { id: 'memory', label: 'Open memory panel', hint: 'Ctrl+M', icon: BookOpenText, run: () => setMemoryOpen(true) },
    { id: 'persona', label: 'Change persona', icon: UserRound, run: () => openSettings('persona') },
    { id: 'generation', label: 'Generation settings', icon: SlidersHorizontal, run: () => openSettings('generation') },
    { id: 'connections', label: 'Connections', icon: Plug, run: () => openSettings('connections') },
  ], [startNewChat, openSettings])

  const visibleMessages = messages.length > visibleCount ? messages.slice(-visibleCount) : messages

  const placeholder = !isConnected
    ? selectedConnection ? `${selectedConnection.name} isn't connected` : 'Add a connection to start chatting'
    : !selectedModel
      ? 'Pick a model first'
      : replyAll
        ? 'Message everyone'
        : activeTarget
          ? `Message ${activeTarget.name}`
          : 'Message'

  const usage = lastPrompt ? Math.min(lastPrompt.totalTokens / lastPrompt.budget, 1) : 0

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      style={hue !== undefined ? ({ '--char-hue': hue } as React.CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setIsDraggingCard(true)
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setIsDraggingCard(false)
      }}
      onDrop={handleDrop}
    >
      {sidebarOpen && (
        <aside className="flex h-screen w-72 flex-shrink-0 flex-col border-r bg-sidebar" aria-label="Chats">
          <div className="flex h-14 flex-shrink-0 items-center gap-2.5 px-4">
            <Coffee className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-display text-xl font-medium tracking-tight">ChaiChat</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 text-muted-foreground"
              aria-label="Hide sidebar"
              title="Hide sidebar (Ctrl+B)"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-1 px-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 font-sans text-[10px]">Ctrl K</kbd>
            </button>
            <button
              onClick={startNewChat}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-accent/50"
            >
              <Plus className="h-4 w-4" /> New chat
            </button>
            <button
              onClick={() => setView('characters')}
              aria-current={view === 'characters' ? 'page' : undefined}
              className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-accent/50', view === 'characters' && 'bg-accent')}
            >
              <Users className="h-4 w-4" /> Characters
              <span className="ml-auto text-xs text-muted-foreground">{characters.length}</span>
            </button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <ChatSessionList
              currentSessionId={view === 'chat' ? currentSessionId : null}
              characters={characters}
              getSessionsByDateGroup={getSessionsByDateGroup}
              onLoadSession={openSession}
              onRenameSession={renameSession}
              onDeleteSession={deleteSession}
              onDuplicateSession={duplicateSession}
              onExportSession={exportSession}
              isLoadingSession={isLoadingSession}
            />
          </div>

          <div className="flex flex-shrink-0 items-center gap-1 border-t p-2">
            <button
              onClick={() => openSettings('persona')}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-accent/50"
              title="Change persona"
            >
              <CharacterAvatar avatar={persona?.avatar} name={persona?.name ?? 'You'} className="h-7 w-7 text-[10px]" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{persona?.name ?? 'You'}</span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setIsDark(!isDark)}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Settings"
              title="Settings (Ctrl+,)"
              onClick={() => openSettings('generation')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </aside>
      )}

      <main className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', settings.ambience && view === 'chat' && 'ambience')}>
        <header className="flex h-14 flex-shrink-0 items-center gap-2 px-3">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Show sidebar" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}

          {view === 'chat' && (
            <div className="flex min-w-0 items-center gap-2.5">
              {participants.length > 0 && (
                <div className="flex shrink-0 -space-x-2">
                  {participants.slice(0, 3).map((c) => (
                    <CharacterAvatar key={c.id} avatar={c.avatar} name={c.name} className="h-8 w-8 text-xs ring-2 ring-background" />
                  ))}
                </div>
              )}
              <h1 className="min-w-0 truncate font-display text-lg font-medium">
                {participants.length > 0 ? participants.map((p) => p.name).join(', ') : currentSession?.title ?? 'Chat'}
              </h1>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ProviderSelector
              connections={connections}
              selectedProvider={selectedProvider}
              onProviderChange={handleProviderChange}
              onManage={() => openSettings('connections')}
              disabled={isLoading}
            />
            <ModelSelector
              models={models.filter(m => m.provider === selectedProvider)}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              loading={isModelsLoading}
            />
            <span
              className={cn('mx-1 h-2 w-2 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-destructive')}
              role="status"
              title={isConnected ? `Connected to ${selectedConnection?.name}` : connectionError ?? 'Not connected'}
              aria-label={isConnected ? 'Connected' : 'Not connected'}
            />
            {!isConnected && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={isModelsLoading} aria-label="Try connecting again" onClick={reconnect}>
                <RefreshCw className={cn('h-4 w-4', isModelsLoading && 'animate-spin')} />
              </Button>
            )}
            {view === 'chat' && (
              <button
                onClick={() => setMemoryOpen(!memoryOpen)}
                aria-pressed={memoryOpen}
                title="Memory and context (Ctrl+M)"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
                  memoryOpen && 'bg-accent text-foreground'
                )}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90" aria-hidden="true">
                  <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <circle cx="10" cy="10" r="7.5" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${usage * 47.1} 47.1`} />
                </svg>
                {lastPrompt ? formatTokens(lastPrompt.totalTokens) : 'Memory'}
              </button>
            )}
          </div>
        </header>

        {view === 'characters' ? (
          <div className="min-h-0 flex-1">
            <CharacterGallery
              characters={characters}
              error={charactersError}
              onStartChat={beginChat}
              onAddToChat={(character) => {
                setView('chat')
                selectCharacter(character)
              }}
              onCreate={createCharacter}
              onUpdate={updateCharacter}
              onDelete={deleteCharacter}
              onDuplicate={duplicateCharacter}
              onImport={handleImport}
            />
          </div>
        ) : (
          <>
            {connectionNotice && (
              <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 pb-2 text-xs text-muted-foreground">
                <span className="flex-1">{connectionNotice}</span>
                <button onClick={dismissConnectionNotice} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto"
                id="main-content"
                tabIndex={-1}
                aria-label="Chat messages"
              >
                {messages.length === 0 ? (
                  <EmptyChat
                    participants={participants}
                    activeTarget={activeTarget}
                    characters={characters}
                    isConnected={isConnected}
                    isConnecting={isModelsLoading}
                    connectionName={selectedConnection?.name}
                    connectionError={connectionError}
                    onConnect={() => openSettings('connections')}
                    onPick={beginChat}
                    onBrowse={() => setView('characters')}
                  />
                ) : (
                  <div className={cn('mx-auto w-full max-w-3xl px-5 pt-2 pb-6 transition-opacity', isLoadingSession && 'opacity-50')}>
                    {messages.length > visibleCount && (
                      <div className="mb-2 text-center">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                          Show earlier messages
                        </Button>
                      </div>
                    )}
                    {visibleMessages.map((message, index) => {
                      const isLast = index === visibleMessages.length - 1
                      return (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          characters={characters}
                          persona={persona}
                          isStreaming={isLoading && message.role === 'assistant' && (isLast || !message.content)}
                          isLast={isLast}
                          onSaveScript={handleSaveScript}
                          onEditMessage={handleEdit}
                          onResendMessage={handleResend}
                          onBranchFromMessage={handleBranch}
                          onDeleteMessage={handleDelete}
                          onSwipe={handleSwipe}
                        />
                      )
                    })}
                  </div>
                )}
              </div>

              {!isAtBottom && messages.length > 0 && (
                <button
                  onClick={() => {
                    followRef.current = true
                    scrollToBottom('smooth')
                  }}
                  className="rise absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-popover px-3 text-xs shadow-md"
                >
                  <ArrowDown className="h-3.5 w-3.5" /> Latest
                </button>
              )}
            </div>

            <div className="mx-auto w-full max-w-3xl flex-shrink-0 space-y-1.5 px-5 pb-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">{error}</span>
                </div>
              )}
              <ParticipantsBar
                participants={participants}
                activeTargetId={activeTargetId}
                replyAll={replyAll}
                onReplyAllChange={setReplyAll}
                onSelectTarget={selectCharacter}
                onRemoveParticipant={removeParticipant}
                onAddParticipant={() => setView('characters')}
                disabled={isLoading}
              />
              <ChatInput
                onSendMessage={handleSend}
                onStop={stopGeneration}
                onContinue={continueResponse}
                onRegenerate={regenerate}
                onImpersonate={impersonate}
                onOpenNote={openNote}
                onSwipeLast={handleSwipeLast}
                disabled={isLoading || !canGenerate}
                generating={isLoading}
                placeholder={placeholder}
                canNudge={messages.length > 0}
                canRewrite={canRewrite}
                draft={impersonation}
                onDraftTaken={clearImpersonation}
              />
            </div>
          </>
        )}

        {isDraggingCard && (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
            <p className="font-display text-2xl">Drop a character card</p>
          </div>
        )}

        {toast && (
          <div className="rise absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-full border bg-popover px-4 py-1.5 text-sm shadow-lg" role="status">
            {toast}
          </div>
        )}
      </main>

      {memoryOpen && view === 'chat' && (
        <MemoryPanel
          session={currentSession}
          report={lastPrompt}
          settings={settings}
          unsummarized={unsummarized}
          isSummarizing={isSummarizing}
          error={memoryError}
          canUseModel={canGenerate && !isLoading}
          focusNote={noteFocus}
          onClose={() => setMemoryOpen(false)}
          onSummarize={() => summarizeNow()}
          onSessionChange={updateCurrentSession}
          onSettingsChange={updateSettings}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        actions={paletteActions}
        characters={characters}
        sessions={sessions}
        onOpenCharacter={beginChat}
        onOpenSession={openSession}
        search={searchChats}
      />

      <SettingsDialog
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={updateSettings}
        personas={personas}
        onSavePersona={savePersona}
        onDeletePersona={deletePersona}
        connections={connections}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        isDark={isDark}
        onDarkChange={setIsDark}
        onExportAll={exportSessions}
        onImportAll={() => importSessions()}
        connectionsPane={
          <ConnectionManager
            connections={connections}
            presets={presets}
            selectedProvider={selectedProvider}
            providerStatus={providerStatus}
            encryptionAvailable={encryptionAvailable}
            autoConnect={autoConnect}
            onAutoConnectChange={setAutoConnect}
            onChanged={refreshConnections}
          />
        }
      />
    </div>
  )
}

function EmptyChat({
  participants,
  activeTarget,
  characters,
  isConnected,
  isConnecting,
  connectionName,
  connectionError,
  onConnect,
  onPick,
  onBrowse,
}: {
  participants: Character[]
  activeTarget?: Character
  characters: Character[]
  isConnected: boolean
  isConnecting: boolean
  connectionName?: string
  connectionError: string | null
  onConnect: () => void
  onPick: (character: Character) => void
  onBrowse: () => void
}) {
  if (!isConnected && !isConnecting) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rise max-w-sm text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight">
            {connectionName ? `${connectionName} is offline` : 'Connect a model'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {connectionName ? connectionError ?? 'Check that it is running.' : 'Point ChaiChat at a local server or a cloud provider to start chatting.'}
          </p>
          <Button className="mt-5" onClick={onConnect}>
            <Plug className="h-4 w-4" /> Manage connections
          </Button>
        </div>
      </div>
    )
  }

  if (participants.length > 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="rise max-w-md text-center">
          <div className="flex justify-center -space-x-4">
            {participants.slice(0, 4).map((c) => (
              <CharacterAvatar key={c.id} avatar={c.avatar} name={c.name} className="h-32 w-24 rounded-2xl text-4xl shadow-lg ring-4 ring-background" />
            ))}
          </div>
          <h2 className="mt-5 font-display text-3xl font-medium tracking-tight">{activeTarget?.name ?? participants[0].name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeTarget?.tagline || 'Say something to begin.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="rise w-full max-w-2xl">
        <h2 className="text-center font-display text-4xl font-medium tracking-tight">Who's it going to be?</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">Pick someone to talk to, or just start typing.</p>
        <div className="mt-6 grid grid-cols-4 gap-3">
          {characters.slice(0, 4).map((character) => (
            <button
              key={character.id}
              onClick={() => onPick(character)}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <CharacterAvatar avatar={character.avatar} name={character.name} className="h-full w-full rounded-none text-5xl" />
              <span className="portrait-fade absolute inset-0" />
              <span className="absolute inset-x-0 bottom-0 p-2.5 text-left font-display text-base leading-tight text-white">{character.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onBrowse}>See everyone</Button>
        </div>
      </div>
    </div>
  )
}
