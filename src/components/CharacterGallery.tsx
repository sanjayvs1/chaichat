import { useMemo, useRef, useState } from 'react'
import {
  Copy, Download, FileJson, Heart, ImageDown, MessageCircle, Pencil, Plus, Search, Trash2, Upload, UserPlus,
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { CharacterAvatar } from './CharacterAvatar'
import { CharacterEditor } from './CharacterEditor'
import { exportCharacterJson, exportCharacterPng, nameHue } from '@/lib/cards'
import { applyMacros } from '@/lib/prompt'
import { estimateTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { Character } from '../types/chat'

interface CharacterGalleryProps {
  characters: Character[]
  error?: string | null
  onStartChat: (character: Character) => void
  onAddToChat: (character: Character) => void
  onCreate: (character: Character) => void
  onUpdate: (characterId: string, updates: Partial<Character>) => void
  onDelete: (characterId: string) => void
  onDuplicate: (character: Character) => void
  onImport: (files: File[]) => void
}

type SortBy = 'recent' | 'name'

function definitionTokens(character: Character) {
  return estimateTokens(
    [character.systemPrompt, character.description, character.personality, character.scenario, character.messageExample]
      .filter(Boolean)
      .join('')
  )
}

export function CharacterGallery({
  characters,
  error,
  onStartChat,
  onAddToChat,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
  onImport,
}: CharacterGalleryProps) {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Character | 'new' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const open = characters.find((c) => c.id === openId)

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    characters.forEach((c) => c.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tag]) => tag)
  }, [characters])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = characters.filter(
      (c) =>
        (!favoritesOnly || c.favorite) &&
        (!activeTag || c.tags?.includes(activeTag)) &&
        (!needle ||
          [c.name, c.tagline, c.description, c.creator, ...(c.tags ?? [])].some((text) => text?.toLowerCase().includes(needle)))
    )
    return matches.sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
    })
  }, [characters, query, activeTag, favoritesOnly, sortBy])

  const saveEdit = (character: Character) => {
    if (editing === 'new') onCreate(character)
    else onUpdate(character.id, character)
    setEditing(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-6xl flex-shrink-0 px-6 pt-8 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl font-medium tracking-tight">Characters</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {characters.length} on your shelf. Drop a character card anywhere to add it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.json,image/png,application/json"
              className="hidden"
              onChange={(e) => {
                onImport(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-3.5 w-3.5" /> Create
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, tag or creator"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 rounded-full pl-9"
              aria-label="Search characters"
            />
          </div>
          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            aria-pressed={favoritesOnly}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
              favoritesOnly ? 'border-primary/60 bg-primary/10' : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <Heart className={cn('h-3.5 w-3.5', favoritesOnly && 'fill-primary text-primary')} /> Favorites
          </button>
          <button
            onClick={() => setSortBy(sortBy === 'recent' ? 'name' : 'recent')}
            className="h-9 rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60"
          >
            {sortBy === 'recent' ? 'Recently updated' : 'A to Z'}
          </button>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                aria-pressed={activeTag === tag}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs transition-colors',
                  activeTag === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 px-6 pb-10">
          {shown.map((character, index) => (
            <article
              key={character.id}
              className="rise group relative aspect-[3/4] overflow-hidden rounded-2xl bg-muted shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
              style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
            >
              <button
                type="button"
                className="absolute inset-0 text-left"
                onClick={() => setOpenId(character.id)}
                aria-label={`Open ${character.name}`}
              >
                <CharacterAvatar
                  avatar={character.avatar}
                  name={character.name}
                  className="h-full w-full rounded-none text-6xl transition-transform duration-500 group-hover:scale-105"
                />
                <span className="portrait-fade absolute inset-0" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <span className="block truncate font-display text-xl leading-tight">{character.name}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-white/75">
                    {character.tagline || applyMacros(character.description, { charName: character.name, userName: 'you' })}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onUpdate(character.id, { favorite: !character.favorite })}
                aria-label={character.favorite ? `Remove ${character.name} from favorites` : `Add ${character.name} to favorites`}
                aria-pressed={!!character.favorite}
                className={cn(
                  'absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition-opacity hover:bg-black/50 focus-visible:opacity-100',
                  character.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <Heart className={cn('h-4 w-4', character.favorite && 'fill-current')} />
              </button>
            </article>
          ))}
        </div>
        {shown.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {characters.length === 0 ? 'Nobody here yet. Create someone, or import a card.' : 'Nobody matches that.'}
          </p>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(isOpen) => !isOpen && setOpenId(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-hidden p-0">
          {open && (
            <CharacterDetail
              character={open}
              onStartChat={() => {
                setOpenId(null)
                onStartChat(open)
              }}
              onAddToChat={() => {
                setOpenId(null)
                onAddToChat(open)
              }}
              onEdit={() => {
                setOpenId(null)
                setEditing(open)
              }}
              onDuplicate={() => onDuplicate(open)}
              onDelete={() => {
                setOpenId(null)
                onDelete(open.id)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent className="h-[88vh] max-w-4xl overflow-hidden p-0" onInteractOutside={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">{editing === 'new' ? 'Create character' : 'Edit character'}</DialogTitle>
          <DialogDescription className="sr-only">Everything that defines this character.</DialogDescription>
          {editing && (
            <CharacterEditor
              character={editing === 'new' ? undefined : editing}
              onSave={saveEdit}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CharacterDetail({
  character,
  onStartChat,
  onAddToChat,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  character: Character
  onStartChat: () => void
  onAddToChat: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const greetings = (character.greeting ? 1 : 0) + (character.alternateGreetings?.length ?? 0)

  return (
    <div
      className="grid max-h-[88vh] min-h-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
      style={{ '--char-hue': nameHue(character.name) } as React.CSSProperties}
    >
      <CharacterAvatar avatar={character.avatar} name={character.name} className="h-full min-h-96 w-full rounded-none text-7xl" />

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 pr-10">
          <div>
            <DialogTitle className="font-display text-3xl font-medium tracking-tight">{character.name}</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {character.tagline || (character.creator ? `by ${character.creator}` : 'A character on your shelf')}
            </DialogDescription>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{definitionTokens(character)} tokens</span>
            <span>{greetings} {greetings === 1 ? 'greeting' : 'greetings'}</span>
            {character.creator && character.tagline && <span>by {character.creator}</span>}
            {character.characterVersion && <span>v{character.characterVersion}</span>}
          </div>

          {!!character.tags?.length && (
            <div className="flex flex-wrap gap-1.5">
              {character.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
              ))}
            </div>
          )}

          {character.description && (
            <p className="prose-chat whitespace-pre-wrap text-[0.95rem]">
              {applyMacros(character.description, { charName: character.name, userName: 'you' })}
            </p>
          )}

          {character.creatorNotes && (
            <div>
              <h3 className="eyebrow mb-1">Creator's notes</h3>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{character.creatorNotes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t p-3">
          <Button size="sm" onClick={onStartChat}>
            <MessageCircle className="h-3.5 w-3.5" /> New chat
          </Button>
          <Button size="sm" variant="outline" onClick={onAddToChat}>
            <UserPlus className="h-3.5 w-3.5" /> Add to this chat
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Export">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportCharacterPng(character)}>
                  <ImageDown className="mr-2 h-4 w-4" /> Card image (PNG)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCharacterJson(character)}>
                  <FileJson className="mr-2 h-4 w-4" /> JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Duplicate" title="Duplicate" onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {!character.isDefault && (
              <Button
                size={confirmDelete ? 'sm' : 'icon'}
                variant={confirmDelete ? 'destructive' : 'ghost'}
                className={confirmDelete ? 'h-8' : 'h-8 w-8'}
                aria-label="Delete"
                title="Delete"
                onBlur={() => setConfirmDelete(false)}
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              >
                {confirmDelete ? 'Delete?' : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
