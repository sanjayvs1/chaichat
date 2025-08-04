import { useState, useRef, useMemo, memo } from 'react'
import { ChevronDown, ChevronRight, Clock, MessageSquare, SortAsc, Download, Upload, MoreHorizontal, ChevronLeft } from 'lucide-react'
import type { ChatSession, Character } from '../types/ollama'
import { ChatSessionItem } from './ChatSessionItem'
import { Button } from './ui/button'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ChatSessionListProps {
  sessions: ChatSession[]
  currentSessionId?: string | null
  characters?: Character[]
  getSessionsByDateGroup: () => {
    today: ChatSession[]
    yesterday: ChatSession[]
    thisWeek: ChatSession[]
    thisMonth: ChatSession[]
    older: ChatSession[]
  }
  sortedSessions: (sortBy: 'date' | 'name' | 'length') => ChatSession[]
  onLoadSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newTitle: string) => void
  onDeleteSession: (sessionId: string) => void
  onDuplicateSession: (sessionId: string) => void
  onExportSessions?: () => void
  onImportSessions?: (file: File) => Promise<boolean>
  onExportSession?: (sessionId: string) => void
}

type ViewMode = 'grouped' | 'list'
type SortBy = 'date' | 'name' | 'length'

const ITEMS_PER_PAGE = 20

// Session group configuration
const GROUP_CONFIG = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'thisWeek', title: 'This Week' },
  { key: 'thisMonth', title: 'This Month' },
  { key: 'older', title: 'Older' }
] as const

// Memoized SessionGroup component to prevent unnecessary re-renders
const SessionGroup = memo(({ 
  title, 
  sessions, 
  groupKey,
  collapsedGroups,
  toggleGroup,
  currentSessionId,
  sessionHandlers,
  characters
}: { 
  title: string
  sessions: ChatSession[]
  groupKey: string 
  collapsedGroups: Set<string>
  toggleGroup: (groupName: string) => void
  currentSessionId: string | null
  sessionHandlers: {
    onLoad: (sessionId: string) => void
    onRename: (sessionId: string, newTitle: string) => void
    onDelete: (sessionId: string) => void
    onDuplicate: (sessionId: string) => void
    onExport: (sessionId: string) => void
  }
  characters: Character[]
}) => {
  if (sessions.length === 0) return null
  
  const isCollapsed = collapsedGroups.has(groupKey)
  
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start h-6 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => toggleGroup(groupKey)}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3 mr-1" />
        ) : (
          <ChevronDown className="h-3 w-3 mr-1" />
        )}
        {title}
        <span className="ml-auto text-xs">({sessions.length})</span>
      </Button>
      
      {!isCollapsed && (
        <div className="space-y-1 ml-1">
          {sessions.map((session) => (
            <ChatSessionItem
              key={session.id}
              session={session}
              isActive={currentSessionId === session.id}
              onLoad={sessionHandlers.onLoad}
              onRename={sessionHandlers.onRename}
              onDelete={sessionHandlers.onDelete}
              onDuplicate={sessionHandlers.onDuplicate}
              onExport={sessionHandlers.onExport}
              characters={characters}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// Import/Export controls component
const ImportExportControls = memo(({ 
  onImportSessions, 
  onExportSessions, 
  isImporting, 
  fileInputRef 
}: {
  onImportSessions?: (file: File) => Promise<boolean>
  onExportSessions?: () => void
  isImporting: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) => {
  if (!onImportSessions && !onExportSessions) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Import/Export options"
        >
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {onImportSessions && (
          <DropdownMenuItem 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isImporting ? 'Importing...' : 'Import'}
          </DropdownMenuItem>
        )}
        {onExportSessions && (
          <DropdownMenuItem onClick={onExportSessions}>
            <Download className="h-4 w-4 mr-2" />
            Export All
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

// Sort controls component
const SortControls = memo(({ 
  sortBy, 
  onSortChange 
}: {
  sortBy: SortBy
  onSortChange: (sortBy: SortBy) => void
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Sort options"
        >
          <SortAsc className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {[
          { value: 'date', label: 'By Date' },
          { value: 'name', label: 'By Name' },
          { value: 'length', label: 'By Length' }
        ].map(({ value, label }) => (
          <DropdownMenuItem 
            key={value}
            onClick={() => onSortChange(value as SortBy)}
            className={cn(sortBy === value && "bg-accent")}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

// Pagination controls component
const PaginationControls = memo(({ 
  currentPage, 
  totalPages, 
  totalSessions, 
  onPageChange 
}: {
  currentPage: number
  totalPages: number
  totalSessions: number
  onPageChange: (page: number) => void
}) => {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
      <span>
        {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalSessions)} of {totalSessions}
      </span>
      
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        
        <span className="px-2">
          {currentPage} / {totalPages}
        </span>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
})

// Empty state component
const EmptyState = memo(() => (
  <div className="text-center py-8 text-muted-foreground">
    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
    <p className="text-sm">No chat history yet</p>
    <p className="text-xs">Start a conversation to see it here</p>
  </div>
))

export const ChatSessionList = memo(function ChatSessionList({
  sessions,
  currentSessionId,
  characters = [],
  getSessionsByDateGroup,
  sortedSessions,
  onLoadSession,
  onRenameSession,
  onDeleteSession,
  onDuplicateSession,
  onExportSessions,
  onImportSessions,
  onExportSession
}: ChatSessionListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Memoized session handlers to prevent unnecessary re-renders
  const sessionHandlers = useMemo(() => ({
    onLoad: onLoadSession,
    onRename: onRenameSession,
    onDelete: onDeleteSession,
    onDuplicate: onDuplicateSession,
    onExport: onExportSession || (() => {})
  }), [onLoadSession, onRenameSession, onDeleteSession, onDuplicateSession, onExportSession])

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newCollapsed = new Set(prev)
      if (newCollapsed.has(groupName)) {
        newCollapsed.delete(groupName)
      } else {
        newCollapsed.add(groupName)
      }
      return newCollapsed
    })
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onImportSessions) return

    setIsImporting(true)
    try {
      await onImportSessions(file)
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Pagination for list view
  const paginatedListSessions = useMemo(() => {
    if (viewMode !== 'list') return { sessions: [], totalPages: 0, totalSessions: 0 }
    
    const sorted = sortedSessions(sortBy)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    
    return {
      sessions: sorted.slice(startIndex, endIndex),
      totalPages: Math.ceil(sorted.length / ITEMS_PER_PAGE),
      totalSessions: sorted.length
    }
  }, [sortedSessions, sortBy, currentPage, viewMode])

  const handleSortChange = (newSortBy: SortBy) => {
    setSortBy(newSortBy)
    setCurrentPage(1)
  }

  const handleViewModeChange = () => {
    setViewMode(prev => prev === 'grouped' ? 'list' : 'grouped')
    setCurrentPage(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  if (sessions.length === 0) {
    return <EmptyState />
  }

  const groupedSessions = getSessionsByDateGroup()

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input for importing */}
      {onImportSessions && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />
      )}

      {/* Header with controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Chat History {sessions.length > ITEMS_PER_PAGE && `(${sessions.length})`}
        </h3>
        
        <div className="flex items-center gap-1">
          <ImportExportControls
            onImportSessions={onImportSessions}
            onExportSessions={onExportSessions}
            isImporting={isImporting}
            fileInputRef={fileInputRef}
          />

          {/* View Mode Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleViewModeChange}
            title={`Switch to ${viewMode === 'grouped' ? 'list' : 'grouped'} view`}
          >
            {viewMode === 'grouped' ? (
              <MessageSquare className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
          </Button>
          
          {/* Sort Options */}
          {viewMode === 'list' && (
            <SortControls sortBy={sortBy} onSortChange={handleSortChange} />
          )}
        </div>
      </div>

      {/* Session Display */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-1">
          {viewMode === 'grouped' ? (
            GROUP_CONFIG.map(({ key, title }) => (
              <SessionGroup 
                key={key}
                title={title}
                sessions={groupedSessions[key]}
                groupKey={key}
                collapsedGroups={collapsedGroups}
                toggleGroup={toggleGroup}
                currentSessionId={currentSessionId || null}
                sessionHandlers={sessionHandlers}
                characters={characters}
              />
            ))
          ) : (
            <div className="space-y-1">
              {paginatedListSessions.sessions.map((session) => (
                <ChatSessionItem
                  key={session.id}
                  session={session}
                  isActive={currentSessionId === session.id}
                  onLoad={sessionHandlers.onLoad}
                  onRename={sessionHandlers.onRename}
                  onDelete={sessionHandlers.onDelete}
                  onDuplicate={sessionHandlers.onDuplicate}
                  onExport={sessionHandlers.onExport}
                  characters={characters}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      <PaginationControls
        currentPage={currentPage}
        totalPages={paginatedListSessions.totalPages}
        totalSessions={paginatedListSessions.totalSessions}
        onPageChange={handlePageChange}
      />
    </div>
  )
}) 