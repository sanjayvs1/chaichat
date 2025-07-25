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

  const toggleGroup = (groupName: string) => {
    const newCollapsed = new Set(collapsedGroups)
    if (newCollapsed.has(groupName)) {
      newCollapsed.delete(groupName)
    } else {
      newCollapsed.add(groupName)
    }
    setCollapsedGroups(newCollapsed)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onImportSessions) return

    setIsImporting(true)
    try {
      await onImportSessions(file)
    } catch (error) {
      console.error('Import failed:', error)
      // You could add a toast notification here
    } finally {
      setIsImporting(false)
      // Reset file input
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

  // Reset page when changing sort or view mode
  const handleSortChange = (newSortBy: SortBy) => {
    setSortBy(newSortBy)
    setCurrentPage(1)
  }

  const handleViewModeChange = () => {
    setViewMode(viewMode === 'grouped' ? 'list' : 'grouped')
    setCurrentPage(1)
  }

  const SessionGroup = ({ 
    title, 
    sessions: groupSessions, 
    groupKey 
  }: { 
    title: string
    sessions: ChatSession[]
    groupKey: string 
  }) => {
    if (groupSessions.length === 0) return null
    
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
          <span className="ml-auto text-xs">({groupSessions.length})</span>
        </Button>
        
        {!isCollapsed && (
          <div className="space-y-1 ml-1">
            {groupSessions.map((session) => (
              <ChatSessionItem
                key={session.id}
                session={session}
                isActive={currentSessionId === session.id}
                onLoad={onLoadSession}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onDuplicate={onDuplicateSession}
                onExport={onExportSession}
                characters={characters}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const PaginationControls = () => {
    if (viewMode !== 'list' || paginatedListSessions.totalPages <= 1) return null

    return (
      <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
        <span>
          {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, paginatedListSessions.totalSessions)} of {paginatedListSessions.totalSessions}
        </span>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          
          <span className="px-2">
            {currentPage} / {paginatedListSessions.totalPages}
          </span>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCurrentPage(p => Math.min(paginatedListSessions.totalPages, p + 1))}
            disabled={currentPage === paginatedListSessions.totalPages}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No chat history yet</p>
        <p className="text-xs">Start a conversation to see it here</p>
      </div>
    )
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
          {/* Import/Export Menu */}
          {(onImportSessions || onExportSessions) && (
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
          )}

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
                <DropdownMenuItem 
                  onClick={() => handleSortChange('date')}
                  className={cn(sortBy === 'date' && "bg-accent")}
                >
                  By Date
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSortChange('name')}
                  className={cn(sortBy === 'name' && "bg-accent")}
                >
                  By Name
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSortChange('length')}
                  className={cn(sortBy === 'length' && "bg-accent")}
                >
                  By Length
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Session Display */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-1">
          {viewMode === 'grouped' ? (
            <>
              <SessionGroup 
                title="Today" 
                sessions={groupedSessions.today} 
                groupKey="today" 
              />
              <SessionGroup 
                title="Yesterday" 
                sessions={groupedSessions.yesterday} 
                groupKey="yesterday" 
              />
              <SessionGroup 
                title="This Week" 
                sessions={groupedSessions.thisWeek} 
                groupKey="thisWeek" 
              />
              <SessionGroup 
                title="This Month" 
                sessions={groupedSessions.thisMonth} 
                groupKey="thisMonth" 
              />
              <SessionGroup 
                title="Older" 
                sessions={groupedSessions.older} 
                groupKey="older" 
              />
            </>
          ) : (
            <div className="space-y-1">
              {paginatedListSessions.sessions.map((session) => (
                <ChatSessionItem
                  key={session.id}
                  session={session}
                  isActive={currentSessionId === session.id}
                  onLoad={onLoadSession}
                  onRename={onRenameSession}
                  onDelete={onDeleteSession}
                  onDuplicate={onDuplicateSession}
                  onExport={onExportSession}
                  characters={characters}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      <PaginationControls />
    </div>
  )
}) 