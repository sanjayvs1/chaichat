import { memo, useMemo, useState } from 'react'
import { Download, Copy, MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { ChatSession, Character } from '../types/chat'
import { CharacterAvatar } from './CharacterAvatar'
import { Input } from './ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ChatSessionListProps {
  currentSessionId?: string | null
  characters: Character[]
  getSessionsByDateGroup: () => Record<'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older', ChatSession[]>
  onLoadSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newTitle: string) => void
  onDeleteSession: (sessionId: string) => void
  onDuplicateSession: (sessionId: string) => void
  onExportSession: (sessionId: string) => void
  isLoadingSession?: boolean
}

const GROUPS = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'thisWeek', title: 'This week' },
  { key: 'thisMonth', title: 'This month' },
  { key: 'older', title: 'Older' },
] as const

function relativeTime(isoString: string): string {
  const date = new Date(isoString)
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
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
  const ids = session.participantIds?.length ? session.participantIds : session.characterId ? [session.characterId] : []
  return ids.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c)
}

function lastLine(session: ChatSession): string {
  const last = session.messages[session.messages.length - 1]
  return last?.content.replace(/<[^>]+>/g, '').replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) ?? ''
}

const SessionRow = memo(function SessionRow({
  session,
  isActive,
  characters,
  disabled,
  onLoad,
  onRename,
  onDelete,
  onDuplicate,
  onExport,
}: {
  session: ChatSession
  isActive: boolean
  characters: Character[]
  disabled: boolean
  onLoad: (sessionId: string) => void
  onRename: (sessionId: string, newTitle: string) => void
  onDelete: (sessionId: string) => void
  onDuplicate: (sessionId: string) => void
  onExport: (sessionId: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const cast = getCast(session, characters)
  const shownCast = cast.slice(0, 2)

  const saveTitle = () => {
    if (title.trim() && title.trim() !== session.title) onRename(session.id, title.trim())
    setIsEditing(false)
  }

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
        isActive ? 'bg-accent' : 'hover:bg-accent/50'
      )}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-lg"
        aria-label={`Open ${session.title}`}
        aria-current={isActive ? 'true' : undefined}
        disabled={disabled || isEditing}
        onClick={() => !isActive && onLoad(session.id)}
      />

      <div className="pointer-events-none flex shrink-0 -space-x-3">
        {shownCast.length > 0 ? (
          shownCast.map((character) => (
            <CharacterAvatar
              key={character.id}
              avatar={character.avatar}
              name={character.name}
              className="h-8 w-8 text-xs ring-2 ring-sidebar"
            />
          ))
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        )}
      </div>

      <div className="pointer-events-none min-w-0 flex-1">
        {isEditing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              else if (e.key === 'Escape') {
                setTitle(session.title)
                setIsEditing(false)
              }
            }}
            className="pointer-events-auto relative h-6 px-1 text-sm"
            autoFocus
          />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{session.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground group-hover:invisible">
                {relativeTime(session.updatedAt || session.createdAt)}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {lastLine(session) || cast.map((c) => c.name).join(', ') || 'No messages yet'}
            </p>
          </>
        )}
      </div>

      {!isEditing && (
        <DropdownMenu onOpenChange={() => setConfirmDelete(false)}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Options for ${session.title}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(session.id)}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport(session.id)}>
              <Download className="mr-2 h-4 w-4" /> Export
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                if (!confirmDelete) {
                  e.preventDefault()
                  setConfirmDelete(true)
                } else {
                  onDelete(session.id)
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> {confirmDelete ? 'Really delete?' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})

export const ChatSessionList = memo(function ChatSessionList({
  currentSessionId,
  characters,
  getSessionsByDateGroup,
  onLoadSession,
  onRenameSession,
  onDeleteSession,
  onDuplicateSession,
  onExportSession,
  isLoadingSession = false,
}: ChatSessionListProps) {
  const groups = useMemo(() => getSessionsByDateGroup(), [getSessionsByDateGroup])

  if (GROUPS.every(({ key }) => groups[key].length === 0)) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground">Your chats will show up here.</p>
  }

  return (
    <div className="space-y-4">
      {GROUPS.map(({ key, title }) =>
        groups[key].length === 0 ? null : (
          <section key={key} aria-label={title}>
            <h3 className="eyebrow mb-1 px-2">{title}</h3>
            <div className="space-y-0.5">
              {groups[key].map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isActive={currentSessionId === session.id}
                  characters={characters}
                  disabled={isLoadingSession}
                  onLoad={onLoadSession}
                  onRename={onRenameSession}
                  onDelete={onDeleteSession}
                  onDuplicate={onDuplicateSession}
                  onExport={onExportSession}
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  )
})
