import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, MessageSquare, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { CharacterAvatar } from './CharacterAvatar'
import { cn } from '@/lib/utils'
import type { Character, ChatMessage, ChatSession } from '../types/chat'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PaletteAction[]
  characters: Character[]
  sessions: ChatSession[]
  onOpenCharacter: (character: Character) => void
  onOpenSession: (sessionId: string) => void
  search: (query: string) => Promise<Array<{ sessionId?: string; message: ChatMessage }>>
}

interface Row {
  key: string
  group: string
  label: string
  detail?: string
  leading: React.ReactNode
  run: () => void
}

const MAX_MATCHES = 6

function excerpt(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ')
  const at = flat.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, at - 30)
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + 90)}`
}

/** Ctrl+K: jump to anything, or find a line from any chat. */
export function CommandPalette({ open, onOpenChange, actions, characters, sessions, onOpenCharacter, onOpenSession, search }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [hits, setHits] = useState<Array<{ sessionId?: string; message: ChatMessage }>>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHits([])
    }
  }, [open])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      search(text).then(setHits).catch(() => setHits([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, search])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle)
    const close = (run: () => void) => () => {
      onOpenChange(false)
      run()
    }

    const actionRows: Row[] = actions
      .filter((action) => matches(action.label))
      .map((action) => ({
        key: action.id,
        group: 'Actions',
        label: action.label,
        detail: action.hint,
        leading: <action.icon className="h-4 w-4 text-muted-foreground" />,
        run: close(action.run),
      }))

    const characterRows: Row[] = characters
      .filter((c) => matches(`${c.name} ${c.tagline ?? ''} ${c.tags?.join(' ') ?? ''}`))
      .slice(0, needle ? MAX_MATCHES : 4)
      .map((c) => ({
        key: `character-${c.id}`,
        group: 'Characters',
        label: c.name,
        detail: c.tagline,
        leading: <CharacterAvatar avatar={c.avatar} name={c.name} className="h-6 w-6 text-[10px]" />,
        run: close(() => onOpenCharacter(c)),
      }))

    const sessionRows: Row[] = sessions
      .filter((s) => matches(s.title))
      .slice(0, needle ? MAX_MATCHES : 4)
      .map((s) => ({
        key: `session-${s.id}`,
        group: 'Chats',
        label: s.title,
        leading: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
        run: close(() => onOpenSession(s.id)),
      }))

    const seen = new Set<string>()
    const messageRows: Row[] = hits
      .filter((hit) => {
        if (!hit.sessionId || seen.has(hit.message.id)) return false
        seen.add(hit.message.id)
        return true
      })
      .slice(0, MAX_MATCHES)
      .map((hit) => ({
        key: `message-${hit.message.id}`,
        group: 'In your chats',
        label: excerpt(hit.message.content, query.trim()),
        detail: sessions.find((s) => s.id === hit.sessionId)?.title,
        leading: <Search className="h-4 w-4 text-muted-foreground" />,
        run: close(() => onOpenSession(hit.sessionId!)),
      }))

    return needle
      ? [...characterRows, ...sessionRows, ...messageRows, ...actionRows]
      : [...actionRows, ...characterRows, ...sessionRows]
  }, [query, hits, actions, characters, sessions, onOpenChange, onOpenCharacter, onOpenSession])

  useEffect(() => setSelected(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      rows[selected]?.run()
    }
  }

  let lastGroup = ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[16%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Search characters, chats and actions.</DialogDescription>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search characters, chats, or anything anyone said"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches that.</p>}
          {rows.map((row, index) => {
            const heading = row.group !== lastGroup ? row.group : null
            lastGroup = row.group
            return (
              <div key={row.key}>
                {heading && <div className="eyebrow px-2 pt-2 pb-1">{heading}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  onMouseMove={() => setSelected(index)}
                  onClick={row.run}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm', index === selected && 'bg-accent')}
                >
                  <span className="flex w-6 shrink-0 justify-center">{row.leading}</span>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {row.detail && <span className="max-w-[40%] truncate text-xs text-muted-foreground">{row.detail}</span>}
                  {index === selected && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
