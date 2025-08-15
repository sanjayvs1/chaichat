import { useState, memo } from 'react'
import { Edit3, Trash2, Copy, Download, User } from 'lucide-react'
import type { ChatSession, Character } from '../types/ollama'

// Avatar imports kept for potential future use; currently not rendered
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from './ui/dropdown-menu'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'

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

  const sessionCharacter = session.characterId 
    ? characters.find(c => c.id === session.characterId)
    : undefined

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
      <div className="shrink-0">
        <Avatar className="h-6 w-6">
          {sessionCharacter?.avatar ? (
            <AvatarImage src={sessionCharacter.avatar} alt={sessionCharacter.name} />
          ) : sessionCharacter ? (
            <AvatarFallback className="text-[10px]">
              {sessionCharacter.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
            </AvatarFallback>
          ) : (
            <AvatarFallback className="text-[10px]"><User className="h-3 w-3" /></AvatarFallback>
          )}
        </Avatar>
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
            <span className="block truncate font-medium">{session.title}</span>
            {sessionCharacter && (
              <span className="text-[11px] text-muted-foreground truncate">{sessionCharacter.name}</span>
            )}
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