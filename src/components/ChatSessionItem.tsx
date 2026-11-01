import { useState, memo } from 'react'
import { Edit3, Trash2, Copy, Download, MessageSquare } from 'lucide-react'
import type { ChatSession, Character } from '../types/chat'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { CharacterAvatar } from './CharacterAvatar'

interface ChatSessionItemProps {
  session: ChatSession
  isActive?: boolean
  characters?: Character[]
  onLoad: (sessionId: string) => void
  onRename: (sessionId: string, newTitle: string) => void
  onDelete: (sessionId: string) => void
  onDuplicate: (sessionId: string) => void
  onExport?: (sessionId: string) => void
  disabled?: boolean
}

function relativeTime(isoString: string): string {
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Resolve the cast of a session, handling legacy single-character sessions. */
function getCast(session: ChatSession, characters: Character[]): Character[] {
  const ids = session.participantIds && session.participantIds.length > 0
    ? session.participantIds
    : session.characterId
      ? [session.characterId]
      : []
  return ids
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
}

export const ChatSessionItem = memo(function ChatSessionItem({ 
  session, 
  isActive, 
  characters = [],
  onLoad, 
  onRename, 
  onDelete, 
  onDuplicate,
  onExport,
  disabled = false
}: ChatSessionItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(session.title)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })

  const cast = getCast(session, characters)
  const shownCast = cast.slice(0, 3)
  const extraCount = cast.length - shownCast.length

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle.trim() !== session.title) {
      onRename(session.id, editTitle.trim())
    }
    setIsEditing(false)
    setEditTitle(session.title)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditTitle(session.title)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleLoad = () => {
    if (!isEditing && !isActive && !disabled) onLoad(session.id)
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        isActive ? "bg-accent/70 text-foreground" : "hover:bg-muted/60",
        disabled && "opacity-60 cursor-not-allowed"
      )}
      onClick={handleLoad}
      onContextMenu={(e) => {
        if (disabled) return;
        e.preventDefault();
        setMenuPosition({ x: e.clientX, y: e.clientY });
        setShowMenu(true);
      }}
    >
      {/* Participant avatars */}
      <div className="shrink-0 flex items-center">
        {shownCast.length > 0 ? (
          <div className="flex -space-x-1.5">
            {shownCast.map((character) => (
              <CharacterAvatar
                key={character.id}
                avatar={character.avatar}
                name={character.name}
                className="h-6 w-6 ring-1 ring-background text-[9px]"
              />
            ))}
            {extraCount > 0 && (
              <div className="h-6 w-6 rounded-full bg-muted ring-1 ring-background flex items-center justify-center text-[9px] text-muted-foreground">
                +{extraCount}
              </div>
            )}
          </div>
        ) : (
          <div
            className="h-6 w-6 rounded-full bg-muted flex items-center justify-center"
            title="No character"
          >
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 cursor-pointer">
        {isEditing ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            className="h-6 text-sm py-0 px-1 -mx-1"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="space-y-0.5">
            <span className="block truncate font-medium leading-tight">{session.title}</span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {cast.length > 0 && (
                <span className="truncate max-w-[110px]">
                  {cast.map((c) => c.name).join(', ')}
                </span>
              )}
              {cast.length > 0 && session.messages.length > 0 && <span>·</span>}
              {session.messages.length > 0 && (
                <span>{session.messages.length} msg{session.messages.length === 1 ? '' : 's'}</span>
              )}
              {(cast.length > 0 || session.messages.length > 0) && <span>·</span>}
              <span>{relativeTime(session.updatedAt || session.createdAt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Right-click context menu */}
      <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
        <DropdownMenuTrigger asChild>
          <div style={{ display: 'none' }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          sideOffset={4}
          style={{ position: 'fixed', left: menuPosition.x, top: menuPosition.y, zIndex: 9999 }}
        >
          <DropdownMenuItem onClick={() => setIsEditing(true)}>
            <Edit3 className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(session.id)}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          {onExport && (
            <DropdownMenuItem onClick={() => onExport(session.id)}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => onDelete(session.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})