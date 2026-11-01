import { useState, useEffect, useMemo } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { Save, X, Wand2, Brain, Trash2, Plus, Smile, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dbService } from '../services/database'

import type { Character, CharacterMemory } from '../types/chat'
import { CharacterAvatar } from './CharacterAvatar'
import { isEmoji } from '@/lib/character'

const EMOJI_CHOICES = [
  '🧙', '🧝', '🧛', '🧟', '🧚', '🥷', '🕵️', '👨‍🔬', '👩‍💻', '🤖',
  '🐉', '🦊', '🐺', '🦉', '🐙', '🦄', '🐱', '🐶', '🐼', '🦁',
  '👑', '🎭', '💀', '👻', '🧠', '⚡', '🌙', '🔮', '⚔️', '🚀',
  '🌟', '🎨', '📚', '🎮', '🎵', '☕', '🍕', '🌵', '🌊', '🔥',
]

interface CharacterEditorProps {
  character?: Character
  onSave: (character: Character) => void
  onCancel: () => void
  isLoading?: boolean
}

function composeSystemPrompt(name: string, tagline: string, description: string): string {
  const lines = [`You are ${name}.`]
  if (tagline) lines.push('', tagline)
  if (description) lines.push('', 'Personality & background:', description.trim())
  lines.push(
    '',
    'Roleplay guidelines:',
    '- Always stay fully in character',
    "- Speak, think, and react the way this character would",
    '- Never break character or mention being an AI or language model',
    '- Keep responses conversational, engaging and true to the character\'s voice'
  )
  return lines.join('\n')
}

export function CharacterEditor({ 
  character, 
  onSave, 
  onCancel, 
  isLoading = false 
}: CharacterEditorProps) {
  const [formData, setFormData] = useState({
    name: '',
    avatar: '',
    tagline: '',
    description: '',
    systemPrompt: '',
    greeting: '',
    memoryEnabled: true,
    promptTouched: false
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [avatarMode, setAvatarMode] = useState<'emoji' | 'url'>('emoji')

  // Memory state (only editable for existing characters)
  const [memories, setMemories] = useState<CharacterMemory[]>([])
  const [newMemory, setNewMemory] = useState('')

  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name,
        avatar: character.avatar || '',
        tagline: character.tagline || '',
        description: character.description,
        systemPrompt: character.systemPrompt || '',
        greeting: character.greeting || '',
        memoryEnabled: character.memoryEnabled !== false,
        promptTouched: !!character.systemPrompt
      })
      setAvatarMode(character.avatar && !isEmoji(character.avatar) ? 'url' : 'emoji')
      
      // Load memories for existing characters
      dbService.getMemoriesForCharacter(character.id)
        .then(setMemories)
        .catch(err => console.error('Failed to load memories:', err))
    }
  }, [character])

  const effectivePrompt = useMemo(
    () => formData.systemPrompt || composeSystemPrompt(formData.name, formData.tagline, formData.description),
    [formData.systemPrompt, formData.name, formData.tagline, formData.description]
  )

  // Rough token estimate (~4 chars per token) to help size the prompt
  const promptTokens = Math.ceil(effectivePrompt.length / 4)

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.description.trim() && !formData.systemPrompt.trim()) {
      newErrors.description = 'Describe the character or write a system prompt'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    const now = new Date().toISOString()
    const name = formData.name.trim()
    const tagline = formData.tagline.trim()
    const description = formData.description.trim()

    const characterData: Character = {
      id: character?.id || crypto.randomUUID(),
      name,
      tagline: tagline || undefined,
      description,
      // Persist an explicit prompt once composed/touched so it stays stable
      systemPrompt: formData.promptTouched || formData.systemPrompt
        ? formData.systemPrompt
        : composeSystemPrompt(name, tagline, description),
      greeting: formData.greeting.trim() || undefined,
      avatar: formData.avatar.trim() || undefined,
      memoryEnabled: formData.memoryEnabled,
      isDefault: character?.isDefault || false,
      createdAt: character?.createdAt || now,
      updatedAt: now
    }

    onSave(characterData)
  }

  const addMemoryManually = async () => {
    if (!newMemory.trim() || !character) return
    const now = new Date().toISOString()
    const memory: CharacterMemory = {
      id: crypto.randomUUID(),
      characterId: character.id,
      content: newMemory.trim(),
      createdAt: now,
      updatedAt: now
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 pr-8">
        <div>
          <h1 className="text-xl font-semibold">
            {character ? 'Edit Character' : 'Create Character'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define who they are — the app turns it into their system prompt automatically.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 pr-2">
        <form onSubmit={handleSubmit} className="space-y-5 pb-4">
          {/* Identity */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
            <div className="flex items-start gap-4">
              {/* Live preview avatar */}
              <CharacterAvatar
                avatar={formData.avatar}
                name={formData.name || '?'}
                className="h-16 w-16 flex-shrink-0 text-lg"
              />
              <div className="flex-1 min-w-0 space-y-3">
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Character name *"
                  className={cn('text-base font-medium', errors.name && 'border-destructive')}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                <Input
                  value={formData.tagline}
                  onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                  placeholder="Tagline — one line about them (optional)"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Avatar picker */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Avatar</span>
                <div className="flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAvatarMode('emoji')}
                    className={cn(
                      'px-2 py-1 text-xs flex items-center gap-1 transition-colors',
                      avatarMode === 'emoji' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    <Smile className="h-3 w-3" /> Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarMode('url')}
                    className={cn(
                      'px-2 py-1 text-xs flex items-center gap-1 transition-colors',
                      avatarMode === 'url' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    <Link2 className="h-3 w-3" /> Image
                  </button>
                </div>
              </div>

              {avatarMode === 'emoji' ? (
                <div className="grid grid-cols-10 gap-1">
                  {EMOJI_CHOICES.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, avatar: prev.avatar === emoji ? '' : emoji }))}
                      className={cn(
                        'h-8 rounded-md text-lg leading-none transition-all hover:bg-muted hover:scale-110',
                        formData.avatar === emoji && 'ring-2 ring-primary bg-primary/10'
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  value={isEmoji(formData.avatar) ? '' : formData.avatar}
                  onChange={(e) => setFormData(prev => ({ ...prev, avatar: e.target.value }))}
                  placeholder="https://example.com/avatar.png"
                  className="text-sm"
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Personality & background</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Who are they? Personality quirks, history, how they speak, what they love or hate..."
              rows={4}
              className={cn('resize-none text-sm', errors.description && !formData.systemPrompt && 'border-destructive')}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                System prompt
                <Badge variant="secondary" className="text-[10px]">advanced</Badge>
              </label>
              <span className="text-[11px] text-muted-foreground">~{promptTokens} tokens</span>
            </div>
            
            {!formData.promptTouched && !formData.systemPrompt && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md p-2.5">
                <Wand2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>Leave empty and we'll build the prompt from the fields above. Edit below to take full control.</span>
              </div>
            )}
            
            <Textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value, promptTouched: true }))}
              placeholder={composeSystemPrompt(formData.name || 'your character', formData.tagline, formData.description)}
              rows={7}
              className="resize-y text-xs font-mono leading-relaxed"
            />
          </div>

          {/* Greeting */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Opening greeting <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea
              value={formData.greeting}
              onChange={(e) => setFormData(prev => ({ ...prev, greeting: e.target.value }))}
              placeholder={`What would ${formData.name || 'this character'} say first when you start a chat?`}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Memory */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Brain className="h-4 w-4" />
                Long-term memory
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={formData.memoryEnabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, memoryEnabled: e.target.checked }))}
                />
                <span className="text-xs text-muted-foreground">Remember across chats</span>
              </label>
            </div>

            {formData.memoryEnabled && (
              <p className="text-xs text-muted-foreground">
                {character
                  ? `${character.name} will recall these whenever you talk to them. Facts are picked up automatically as you chat.`
                  : 'Once created, facts about you are remembered here automatically.'}
              </p>
            )}

            {character && formData.memoryEnabled && (
              <>
                <div className="flex gap-2">
                  <Input
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMemoryManually() } }}
                    placeholder="Add a fact manually..."
                    className="text-sm h-8"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={addMemoryManually}
                    disabled={!newMemory.trim()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {memories.length > 0 && (
                  <ScrollArea className="max-h-40">
                    <div className="space-y-1.5">
                      {memories.map(memory => (
                        <div
                          key={memory.id}
                          className="group flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5"
                        >
                          <span className="text-xs leading-relaxed">{memory.content}</span>
                          <button
                            type="button"
                            onClick={() => removeMemory(memory.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                            title="Forget this"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {memories.length === 0 && (
                  <p className="text-xs italic text-muted-foreground">No memories yet — chat with {character.name} and check back.</p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              <Save className="h-4 w-4 mr-1.5" />
              {isLoading ? 'Saving...' : character ? 'Save Changes' : 'Create Character'}
            </Button>
          </div>
        </form>
      </ScrollArea>
    </div>
  )
}
