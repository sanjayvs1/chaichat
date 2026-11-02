import { useEffect, useRef, useState } from 'react'
import { BookOpenText, Code2, Database, Download, ImagePlus, MessageSquareText, Palette, Plug, Plus, SlidersHorizontal, Trash2, Upload, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { CharacterAvatar } from './CharacterAvatar'
import { SavedScripts } from './SavedScripts'
import { LLMService } from '../services/llm'
import { DEFAULT_SUMMARY_PROMPT, SAMPLER_PRESETS } from '@/lib/settings'
import { fileToAvatar } from '@/lib/cards'
import { cn } from '@/lib/utils'
import type { AccentName, AppSettings, ChatFont, GenerationParams, LLMConnection, Persona, VectorSettings } from '../types/chat'

export type SettingsSection = 'persona' | 'generation' | 'memory' | 'appearance' | 'connections' | 'instructions' | 'scripts' | 'data'

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'persona', label: 'Persona', icon: UserRound },
  { id: 'generation', label: 'Generation', icon: SlidersHorizontal },
  { id: 'memory', label: 'Memory', icon: BookOpenText },
  { id: 'instructions', label: 'Instructions', icon: MessageSquareText },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'connections', label: 'Connections', icon: Plug },
  { id: 'scripts', label: 'Scripts', icon: Code2 },
  { id: 'data', label: 'Your data', icon: Database },
]

const ACCENTS: Array<{ id: AccentName; label: string; hue: number }> = [
  { id: 'chai', label: 'Chai', hue: 68 },
  { id: 'rose', label: 'Rose', hue: 12 },
  { id: 'jade', label: 'Jade', hue: 165 },
  { id: 'iris', label: 'Iris', hue: 285 },
]

interface SettingsDialogProps {
  open: boolean
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onSettingsChange: (update: (previous: AppSettings) => AppSettings) => void
  personas: Persona[]
  onSavePersona: (persona: Persona) => void
  onDeletePersona: (personaId: string) => void
  connections: LLMConnection[]
  systemPrompt: string
  onSystemPromptChange: (value: string) => void
  isDark: boolean
  onDarkChange: (isDark: boolean) => void
  onExportAll: () => void
  onImportAll: () => void
  // Connections keep their own screen, it's stateful enough to stay separate
  connectionsPane: React.ReactNode
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format = String,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            'rounded-md px-3 py-1 text-sm transition-colors',
            value === option.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PersonaSection({ personas, activeId, onActivate, onSave, onDelete }: {
  personas: Persona[]
  activeId: string | null
  onActivate: (id: string | null) => void
  onSave: (persona: Persona) => void
  onDelete: (personaId: string) => void
}) {
  const [editing, setEditing] = useState<Persona | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const startNew = () => {
    const now = new Date().toISOString()
    setEditing({ id: crypto.randomUUID(), name: '', description: '', createdAt: now, updatedAt: now })
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Heading title={editing.name || 'New persona'} />
        <div className="flex items-center gap-3">
          <button type="button" className="group relative" aria-label="Choose an avatar" onClick={() => fileRef.current?.click()}>
            <CharacterAvatar avatar={editing.avatar} name={editing.name || '?'} className="h-16 w-16 text-lg" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="h-4 w-4" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) {
                const avatar = await fileToAvatar(file)
                setEditing((prev) => (prev ? { ...prev, avatar } : prev))
              }
            }}
          />
          <Input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Your name in the story"
            aria-label="Persona name"
          />
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">About you</span>
          <span className="block text-xs text-muted-foreground">Characters know this. Keep it short.</span>
          <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={6} className="resize-y" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!editing.name.trim()}
            onClick={() => {
              onSave(editing)
              setEditing(null)
            }}
          >
            Save persona
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Heading title="Persona" hint="Who you are in your chats. {{user}} becomes this name." />
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => onActivate(null)}
          className={cn('flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-accent/50', !activeId && 'border-primary/60 bg-primary/10')}
        >
          <CharacterAvatar name="You" className="h-10 w-10 text-sm" />
          <span className="text-sm">
            <span className="block font-medium">Just you</span>
            <span className="text-xs text-muted-foreground">No name or backstory</span>
          </span>
        </button>
        {personas.map((persona) => (
          <div
            key={persona.id}
            className={cn('group flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:bg-accent/50', activeId === persona.id && 'border-primary/60 bg-primary/10')}
          >
            <button type="button" onClick={() => onActivate(persona.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <CharacterAvatar avatar={persona.avatar} name={persona.name} className="h-10 w-10 text-sm" />
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{persona.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{persona.description || 'No description'}</span>
              </span>
            </button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(persona)}>Edit</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${persona.name}`} onClick={() => onDelete(persona.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={startNew}>
        <Plus className="h-3.5 w-3.5" /> New persona
      </Button>
    </div>
  )
}

function GenerationSection({ params, onChange }: { params: GenerationParams; onChange: (updates: Partial<GenerationParams>) => void }) {
  const [stop, setStop] = useState(params.stop.join(', '))
  const activePreset = SAMPLER_PRESETS.find((preset) =>
    Object.entries(preset.params).every(([key, value]) => params[key as keyof GenerationParams] === value)
  )

  return (
    <div className="space-y-5">
      <Heading title="Generation" hint="How the model writes. Providers ignore what they don't support." />

      <div className="grid grid-cols-3 gap-2">
        {SAMPLER_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => onChange(preset.params)}
            aria-pressed={activePreset === preset}
            className={cn('rounded-xl border p-3 text-left transition-colors hover:bg-accent/50', activePreset === preset && 'border-primary/60 bg-primary/10')}
          >
            <span className="block text-sm font-medium">{preset.name}</span>
            <span className="block text-xs text-muted-foreground">{preset.hint}</span>
          </button>
        ))}
      </div>

      <Slider label="Temperature" hint="Higher is more varied, lower is more predictable." value={params.temperature} min={0} max={2} step={0.05} onChange={(temperature) => onChange({ temperature })} format={(v) => v.toFixed(2)} />
      <Slider label="Top P" hint="Only consider the likeliest words. 1 turns this off." value={params.topP} min={0.05} max={1} step={0.05} onChange={(topP) => onChange({ topP })} format={(v) => v.toFixed(2)} />
      <Slider label="Frequency penalty" hint="Discourages repeating the same words." value={params.frequencyPenalty} min={-2} max={2} step={0.05} onChange={(frequencyPenalty) => onChange({ frequencyPenalty })} format={(v) => v.toFixed(2)} />
      <Slider label="Presence penalty" hint="Encourages moving on to new topics." value={params.presencePenalty} min={-2} max={2} step={0.05} onChange={(presencePenalty) => onChange({ presencePenalty })} format={(v) => v.toFixed(2)} />
      <Slider label="Reply length limit" value={params.maxTokens} min={0} max={4096} step={64} onChange={(maxTokens) => onChange({ maxTokens })} format={(v) => (v === 0 ? 'Server default' : `${v} tokens`)} />
      <Slider label="Context size" hint="How much the model is sent. Match this to your model's limit." value={params.contextTokens} min={1024} max={200000} step={1024} onChange={(contextTokens) => onChange({ contextTokens })} format={(v) => `${v.toLocaleString()} tokens`} />

      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Stop sequences</span>
          <Input
            value={stop}
            onChange={(e) => setStop(e.target.value)}
            onBlur={() => onChange({ stop: stop.split(',').map((text) => text.trim()).filter(Boolean) })}
            placeholder="Separate with commas"
            className="h-9"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Seed</span>
          <Input
            type="number"
            value={params.seed}
            min={-1}
            onChange={(e) => onChange({ seed: Number(e.target.value) })}
            className="h-9"
            title="-1 picks a new one each time"
          />
        </label>
      </div>
    </div>
  )
}

function MemorySection({ settings, connections, onChange }: {
  settings: AppSettings
  connections: LLMConnection[]
  onChange: (update: (previous: AppSettings) => AppSettings) => void
}) {
  const { summary, vectors } = settings
  const [models, setModels] = useState<string[]>([])
  const [modelError, setModelError] = useState('')

  const setSummary = (updates: Partial<AppSettings['summary']>) => onChange((p) => ({ ...p, summary: { ...p.summary, ...updates } }))
  const setVectors = (updates: Partial<VectorSettings>) => onChange((p) => ({ ...p, vectors: { ...p.vectors, ...updates } }))

  useEffect(() => {
    setModels([])
    setModelError('')
    if (!vectors.connectionId) return
    let stale = false
    LLMService.listEmbeddingModels(vectors.connectionId).then((result) => {
      if (stale) return
      if (result.ok) setModels(result.models.map((model) => model.name))
      else setModelError(result.error)
    })
    return () => {
      stale = true
    }
  }, [vectors.connectionId])

  return (
    <div className="space-y-6">
      <Heading title="Memory" hint="Three ways characters keep track of a long story." />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rolling summary</h3>
        <Slider label="Update every" value={summary.everyMessages} min={6} max={100} step={2} onChange={(everyMessages) => setSummary({ everyMessages })} format={(v) => `${v} messages`} />
        <Slider label="Length" value={summary.maxWords} min={50} max={600} step={25} onChange={(maxWords) => setSummary({ maxWords })} format={(v) => `${v} words`} />
        <label className="block space-y-1.5">
          <span className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Instructions</span>
            {summary.prompt !== DEFAULT_SUMMARY_PROMPT && (
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setSummary({ prompt: DEFAULT_SUMMARY_PROMPT })}>Reset</button>
            )}
          </span>
          <Textarea value={summary.prompt} onChange={(e) => setSummary({ prompt: e.target.value })} rows={3} className="resize-y text-sm" />
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Recall</h3>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Embeddings</span>
          <select
            value={vectors.connectionId}
            onChange={(e) => setVectors({ connectionId: e.target.value, model: '' })}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Built-in keyword matching (no setup)</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.name}</option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            A real embedding model finds messages by meaning. The built-in option only matches shared words, but needs nothing installed.
          </span>
        </label>
        {vectors.connectionId && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Embedding model</span>
            <Input
              list="embedding-models"
              value={vectors.model}
              onChange={(e) => setVectors({ model: e.target.value })}
              placeholder="nomic-embed-text"
              className="h-9"
            />
            <datalist id="embedding-models">
              {models.map((model) => <option key={model} value={model} />)}
            </datalist>
            {modelError && <span className="block text-xs text-destructive">{modelError}</span>}
            {!modelError && models.length === 0 && (
              <span className="block text-xs text-muted-foreground">No embedding models listed here. You can still type a name.</span>
            )}
          </label>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Search</span>
          <Choice
            label="Where to search"
            value={vectors.scope}
            options={[{ id: 'chat', label: 'This chat' }, { id: 'character', label: 'All chats with them' }]}
            onChange={(scope) => setVectors({ scope })}
          />
        </div>
        <Slider label="Messages to recall" value={vectors.topK} min={1} max={12} step={1} onChange={(topK) => setVectors({ topK })} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Group chats</h3>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">What each character can see</span>
          <Choice
            label="Group chat context"
            value={settings.groupContext}
            options={[{ id: 'separate', label: 'Only their own' }, { id: 'shared', label: 'The whole scene' }]}
            onChange={(groupContext) => onChange((p) => ({ ...p, groupContext }))}
          />
        </div>
      </section>
    </div>
  )
}

export function SettingsDialog({
  open,
  section,
  onSectionChange,
  onOpenChange,
  settings,
  onSettingsChange,
  personas,
  onSavePersona,
  onDeletePersona,
  connections,
  systemPrompt,
  onSystemPromptChange,
  isDark,
  onDarkChange,
  onExportAll,
  onImportAll,
  connectionsPane,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[84vh] max-w-4xl overflow-hidden p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Personas, generation, memory, appearance and connections.</DialogDescription>
        <div className="grid h-full min-h-0 grid-cols-[12rem_minmax(0,1fr)]">
          <nav className="space-y-0.5 border-r bg-sidebar p-3" aria-label="Settings sections">
            <div className="px-3 pt-1 pb-3 font-display text-xl">Settings</div>
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSectionChange(id)}
                aria-current={section === id ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  section === id ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto p-6 pr-8">
            {section === 'persona' && (
              <PersonaSection
                personas={personas}
                activeId={settings.personaId}
                onActivate={(personaId) => onSettingsChange((p) => ({ ...p, personaId }))}
                onSave={onSavePersona}
                onDelete={onDeletePersona}
              />
            )}
            {section === 'generation' && (
              <GenerationSection
                params={settings.generation}
                onChange={(updates) => onSettingsChange((p) => ({ ...p, generation: { ...p.generation, ...updates } }))}
              />
            )}
            {section === 'memory' && <MemorySection settings={settings} connections={connections} onChange={onSettingsChange} />}
            {section === 'instructions' && (
              <div className="space-y-4">
                <Heading title="Instructions" hint="Added to every prompt, for every character." />
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => onSystemPromptChange(e.target.value)}
                  rows={12}
                  placeholder="Write vivid, unhurried prose. Avoid repeating yourself."
                  className="resize-y"
                  aria-label="Global instructions"
                />
              </div>
            )}
            {section === 'appearance' && (
              <div className="space-y-6">
                <Heading title="Appearance" />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Theme</span>
                  <Choice
                    label="Theme"
                    value={isDark ? 'dark' : 'light'}
                    options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]}
                    onChange={(theme) => onDarkChange(theme === 'dark')}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Message text</span>
                  <Choice<ChatFont>
                    label="Message font"
                    value={settings.chatFont}
                    options={[{ id: 'serif', label: 'Book' }, { id: 'sans', label: 'Clean' }]}
                    onChange={(chatFont) => onSettingsChange((p) => ({ ...p, chatFont }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Accent</span>
                  <div className="flex gap-2">
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent.id}
                        type="button"
                        title={accent.label}
                        aria-label={accent.label}
                        aria-pressed={settings.accent === accent.id}
                        onClick={() => onSettingsChange((p) => ({ ...p, accent: accent.id }))}
                        className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110', settings.accent === accent.id && 'ring-2 ring-foreground')}
                        style={{ background: `oklch(0.72 0.13 ${accent.hue})` }}
                      />
                    ))}
                  </div>
                </div>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-medium">Ambient color</span>
                    <span className="block text-xs text-muted-foreground">Tints the chat with the character's own color.</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={settings.ambience}
                    onChange={(e) => onSettingsChange((p) => ({ ...p, ambience: e.target.checked }))}
                  />
                </label>
              </div>
            )}
            {section === 'connections' && connectionsPane}
            {section === 'scripts' && <SavedScripts />}
            {section === 'data' && (
              <div className="space-y-4">
                <Heading title="Your data" hint="Everything stays on this computer unless you export it." />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onExportAll}>
                    <Download className="h-3.5 w-3.5" /> Export everything
                  </Button>
                  <Button variant="outline" size="sm" onClick={onImportAll}>
                    <Upload className="h-3.5 w-3.5" /> Import a backup
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Exports hold chats, characters, memories and personas. API keys are never included.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
