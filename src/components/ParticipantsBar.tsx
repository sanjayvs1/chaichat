import { X, Plus, Users } from 'lucide-react'
import { CharacterAvatar } from './CharacterAvatar'
import { cn } from '@/lib/utils'
import type { Character } from '../types/ollama'

interface ParticipantsBarProps {
  participants: Character[]
  activeTargetId?: string | null
  onSelectTarget: (character: Character) => void
  onRemoveParticipant: (characterId: string) => void
  onAddParticipant: () => void
  disabled?: boolean
}

/**
 * Shows who you're talking to. Click a chip to aim your next message at that
 * character; each character keeps their own separate conversation context.
 */
export function ParticipantsBar({
  participants,
  activeTargetId,
  onSelectTarget,
  onRemoveParticipant,
  onAddParticipant,
  disabled = false
}: ParticipantsBarProps) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin"
      role="toolbar"
      aria-label="Chat participants"
    >
      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />

      {participants.map((character) => {
        const isActive = activeTargetId === character.id
        return (
          <div
            key={character.id}
            className={cn(
              "group flex items-center gap-1.5 rounded-full border pl-1 pr-2 py-1 text-xs transition-all shrink-0",
              isActive
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-muted/40 hover:bg-muted",
              disabled && "opacity-60"
            )}
          >
            <button
              onClick={() => onSelectTarget(character)}
              disabled={disabled}
              className="flex items-center gap-1.5 min-w-0"
              title={isActive ? `Talking to ${character.name}` : `Talk to ${character.name}`}
              aria-pressed={isActive}
            >
              <CharacterAvatar
                avatar={character.avatar}
                name={character.name}
                className="h-5 w-5 text-[10px]"
              />
              <span className={cn("truncate max-w-28", isActive && "font-medium")}>
                {character.name}
              </span>
              {participants.length > 1 && (
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {isActive ? 'active' : ''}
                </span>
              )}
            </button>
            {!disabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveParticipant(character.id)
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                title={`Remove ${character.name} from this chat`}
                aria-label={`Remove ${character.name} from this chat`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )
      })}

      <button
        onClick={onAddParticipant}
        disabled={disabled}
        className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all shrink-0"
        title="Add a character to this chat"
        aria-label="Add a character to this chat"
      >
        <Plus className="h-3 w-3" />
        Character
      </button>
    </div>
  )
}
