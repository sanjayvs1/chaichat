import { useEffect, useRef, useState } from 'react'
import { Brain, ImagePlus, Plus, Save, Smile, Trash2, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { CharacterAvatar } from './CharacterAvatar'
import { dbService } from '../services/database'
import { fileToAvatar } from '@/lib/cards'
import { estimateTokens } from '@/lib/tokens'
import { isEmoji } from '@/lib/character'
import { cn } from '@/lib/utils'
import type { Character, CharacterMemory } from '../types/chat'

const EMOJI_CHOICES = [
  '🧙', '🧝', '🧛', '🧚', '🥷', '🕵️', '🤖', '🐉', '🦊', '🐺',
  '🦉', '🐙', '🐱', '👑', '🎭', '💀', '👻', '🌙', '🔮', '⚔️',
]

type Tab = 'identity' | 'definition' | 'greetings' | 'advanced' | 'memory'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'definition', label: 'Definition' },
  { id: 'greetings', label: 'Greetings' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'memory', label: 'Memory' },
]

interface CharacterEditorProps {
  character?: Character
  onSave: (character: Character) => void
  onCancel: () => void
}

function Field({ label, hint, tokens, children }: { label: string; hint?: string; tokens?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {tokens !== undefined && <span className="text-[11px] text-muted-foreground">~{estimateTokens(tokens)} tokens</span>}
      </span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  )
}

export function CharacterEditor({ character, onSave, onCancel }: CharacterEditorProps) {
  const [tab, setTab] = useState<Tab>('identity')
  const [form, setForm] = useState({
    name: character?.name ?? '',
    avatar: character?.avatar ?? '',
    tagline: character?.tagline ?? '',
    tags: character?.tags?.join(', ') ?? '',
    creator: character?.creator ?? '',
    characterVersion: character?.characterVersion ?? '',
    creatorNotes: character?.creatorNotes ?? '',
    description: character?.description ?? '',
    personality: character?.personality ?? '',
    scenario: character?.scenario ?? '',
    messageExample: character?.messageExample ?? '',
    systemPrompt: character?.systemPrompt ?? '',
    postHistory: character?.postHistory ?? '',
    greeting: character?.greeting ?? '',
    memoryEnabled: character?.memoryEnabled !== false,
  })
  const [alternates, setAlternates] = useState<string[]>(character?.alternateGreetings ?? [])
  const [error, setError] = useState('')
  const [memories, setMemories] = useState<CharacterMemory[]>([])
  const [newMemory, setNewMemory] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!character) return
    dbService.getMemoriesForCharacter(character.id)
      .then(setMemories)
      .catch(err => console.error('Failed to load memories:', err))
  }, [character])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return
    try {
      set('avatar', await fileToAvatar(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image couldn't be read.")
    }
  }

  const handleSave = () => {
    const name = form.name.trim()
    if (!name) {
      setTab('identity')
      setError('Give them a name first.')
      return
    }
    if (!form.description.trim() && !form.systemPrompt.trim()) {
      setTab('definition')
      setError('Describe who they are, so the model has something to work with.')
      return
    }

    const now = new Date().toISOString()
    onSave({
      id: character?.id ?? crypto.randomUUID(),
      name,
      avatar: form.avatar.trim() || undefined,
      tagline: form.tagline.trim() || '',
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      creator: form.creator.trim(),
      characterVersion: form.characterVersion.trim(),
      creatorNotes: form.creatorNotes.trim(),
      description: form.description.trim(),
      personality: form.personality.trim(),
      scenario: form.scenario.trim(),
      messageExample: form.messageExample.trim(),
      systemPrompt: form.systemPrompt.trim(),
      postHistory: form.postHistory.trim(),
      greeting: form.greeting.trim(),
      alternateGreetings: alternates.map((text) => text.trim()).filter(Boolean),
      memoryEnabled: form.memoryEnabled,
      favorite: character?.favorite ?? false,
      cardExtras: character?.cardExtras,
      isDefault: character?.isDefault ?? false,
      createdAt: character?.createdAt ?? now,
      updatedAt: now,
    })
  }

  const addMemory = async () => {
    if (!newMemory.trim() || !character) return
    const now = new Date().toISOString()
    const memory: CharacterMemory = {
      id: crypto.randomUUID(),
      characterId: character.id,
      content: newMemory.trim(),
      createdAt: now,
      updatedAt: now,
    }
    try {
      await dbService.createMemory(memory)
      setMemories(prev => [memory, ...prev])
      setNewMemory('')
    } catch (err) {
      console.error('Failed to add memory:', err)
    }
  }

  const removeMemory = async (memoryId: string) => {
    try {
      await dbService.deleteMemory(memoryId)
      setMemories(prev => prev.filter(m => m.id !== memoryId))
    } catch (err) {
      console.error('Failed to delete memory:', err)
    }
  }

  const name = form.name.trim() || 'this character'

  return (
    <div className="grid h-full min-h-0 grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-sidebar p-4">
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          className="group relative aspect-[3/4] w-full overflow-hidden rounded-xl"
          aria-label="Choose a portrait"
        >
          <CharacterAvatar avatar={form.avatar} name={form.name || '?'} className="h-full w-full rounded-none text-5xl" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ImagePlus className="h-6 w-6" />
          </span>
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleAvatarFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <nav className="mt-4 space-y-0.5" aria-label="Character sections">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
                tab === id ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <h2 className="pr-8 font-display text-2xl font-medium tracking-tight">
            {character ? `Editing ${character.name}` : 'A new character'}
          </h2>

          {tab === 'identity' && (
            <>
              <Field label="Name">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Who are they?" />
              </Field>
              <Field label="Tagline" hint="One line, shown on their card.">
                <Input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Hard-boiled 1940s private eye" />
              </Field>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Smile className="h-3.5 w-3.5" /> Or an emoji for a portrait
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {EMOJI_CHOICES.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Use ${emoji}`}
                      aria-pressed={form.avatar === emoji}
                      onClick={() => set('avatar', form.avatar === emoji ? '' : emoji)}
                      className={cn(
                        'h-9 rounded-lg text-lg transition-all hover:scale-110 hover:bg-accent',
                        form.avatar === emoji && 'bg-primary/15 ring-2 ring-primary'
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {form.avatar && !isEmoji(form.avatar) && (
                  <button type="button" onClick={() => set('avatar', '')} className="mt-2 text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Remove portrait
                  </button>
                )}
              </div>
              <Field label="Tags" hint="Separate with commas.">
                <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="fantasy, mentor, slow burn" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Creator">
                  <Input value={form.creator} onChange={(e) => set('creator', e.target.value)} />
                </Field>
                <Field label="Version">
                  <Input value={form.characterVersion} onChange={(e) => set('characterVersion', e.target.value)} />
                </Field>
              </div>
              <Field label="Creator's notes" hint="For people reading the card. Never sent to the model.">
                <Textarea value={form.creatorNotes} onChange={(e) => set('creatorNotes', e.target.value)} rows={3} className="resize-y" />
              </Field>
            </>
          )}

          {tab === 'definition' && (
            <>
              <p className="text-xs text-muted-foreground">
                Write <code className="rounded bg-muted px-1">{'{{char}}'}</code> for their name and <code className="rounded bg-muted px-1">{'{{user}}'}</code> for yours.
              </p>
              <Field label="Description" hint="Who they are: looks, history, how they speak." tokens={form.description}>
                <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={9} className="resize-y" />
              </Field>
              <Field label="Personality" hint="A short summary of their temperament." tokens={form.personality}>
                <Textarea value={form.personality} onChange={(e) => set('personality', e.target.value)} rows={3} className="resize-y" />
              </Field>
              <Field label="Scenario" hint="Where things stand when the chat begins." tokens={form.scenario}>
                <Textarea value={form.scenario} onChange={(e) => set('scenario', e.target.value)} rows={3} className="resize-y" />
              </Field>
              <Field
                label="Example dialogue"
                hint="Teaches their voice. Put <START> before each example."
                tokens={form.messageExample}
              >
                <Textarea
                  value={form.messageExample}
                  onChange={(e) => set('messageExample', e.target.value)}
                  rows={7}
                  placeholder={'<START>\n{{user}}: Are you sure about this?\n{{char}}: *grins* Not even slightly.'}
                  className="resize-y font-mono text-xs"
                />
              </Field>
            </>
          )}

          {tab === 'greetings' && (
            <>
              <Field label="First message" hint={`What ${name} opens a chat with.`} tokens={form.greeting}>
                <Textarea value={form.greeting} onChange={(e) => set('greeting', e.target.value)} rows={6} className="resize-y" />
              </Field>
              {alternates.map((text, index) => (
                <div key={index} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Alternate {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setAlternates((prev) => prev.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove alternate ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Textarea
                    value={text}
                    onChange={(e) => setAlternates((prev) => prev.map((value, i) => (i === index ? e.target.value : value)))}
                    rows={4}
                    className="resize-y"
                    aria-label={`Alternate greeting ${index + 1}`}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setAlternates((prev) => [...prev, ''])}>
                <Plus className="h-3.5 w-3.5" /> Add an alternate opening
              </Button>
              <p className="text-xs text-muted-foreground">Alternates can be swiped through at the start of a chat.</p>
            </>
          )}

          {tab === 'advanced' && (
            <>
              <Field
                label="System prompt"
                hint="Replaces the default instructions. Leave it empty unless the character needs something specific."
                tokens={form.systemPrompt}
              >
                <Textarea value={form.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} rows={9} className="resize-y font-mono text-xs" />
              </Field>
              <Field
                label="After-history instructions"
                hint="Placed after the chat, right where the model is about to write. Good for rules it keeps forgetting."
                tokens={form.postHistory}
              >
                <Textarea value={form.postHistory} onChange={(e) => set('postHistory', e.target.value)} rows={4} className="resize-y font-mono text-xs" />
              </Field>
            </>
          )}

          {tab === 'memory' && (
            <>
              <label className="flex items-start gap-3 rounded-xl border p-3">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--primary)]"
                  checked={form.memoryEnabled}
                  onChange={(e) => set('memoryEnabled', e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Brain className="h-3.5 w-3.5" /> Remember across chats</span>
                  <span className="block text-xs text-muted-foreground">
                    Facts about you are picked up as you talk and carried into every chat with {name}.
                  </span>
                </span>
              </label>

              {character && form.memoryEnabled ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newMemory}
                      onChange={(e) => setNewMemory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addMemory()
                        }
                      }}
                      placeholder="Add a fact yourself"
                      className="h-9"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Add fact" disabled={!newMemory.trim()} onClick={addMemory}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {memories.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Nothing yet. Chat with {name} and check back.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {memories.map((memory) => (
                        <li key={memory.id} className="group flex items-start justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                          <span>{memory.content}</span>
                          <button
                            type="button"
                            onClick={() => removeMemory(memory.id)}
                            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                            aria-label={`Forget: ${memory.content}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                !character && <p className="text-xs text-muted-foreground">Save this character first, then facts can be added here.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-3">
          {error && <p className="mr-auto text-xs text-destructive" role="alert">{error}</p>}
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" /> {character ? 'Save changes' : 'Create character'}
          </Button>
        </div>
      </div>
    </div>
  )
}
