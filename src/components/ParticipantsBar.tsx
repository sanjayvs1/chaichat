import { X, Plus, UsersRound } from 'lucide-react'
import { CharacterAvatar } from './CharacterAvatar'
import { cn } from '@/lib/utils'
import type { Character } from '../types/chat'

interface ParticipantsBarProps {
  participants: Character[]
  activeTargetId?: string | null
  replyAll: boolean
  onReplyAllChange: (replyAll: boolean) => void
  onSelectTarget: (character: Character) => void
  onRemoveParticipant: (characterId: string) => void
  onAddParticipant: () => void
  disabled?: boolean
}

/**
 * Shows who you're talking to. Click a chip to aim your next message at that
 * character, or at everyone to have each of them answer in turn.
 */
export function ParticipantsBar({
  participants,
  activeTargetId,
  replyAll,
  onReplyAllChange,
  onSelectTarget,
  onRemoveParticipant,
  onAddParticipant,
  disabled = false,
}: ParticipantsBarProps) {
  const chip = (active: boolean) =>
    cn(
      'group flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs transition-colors',
      active ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      disabled && 'opacity-60'
    )

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="toolbar" aria-label="Chat participants">
      {participants.length > 1 && (
        <button
          onClick={() => onReplyAllChange(!replyAll)}
          disabled={disabled}
          aria-pressed={replyAll}
          title="Each character answers in turn"
          className={cn(chip(replyAll), 'py-1 pl-2')}
        >
          <UsersRound className="h-3.5 w-3.5" />
          Everyone
        </button>
      )}

      {participants.map((character) => {
        const isActive = !replyAll && activeTargetId === character.id
        return (
          <div key={character.id} className={chip(isActive)}>
            <button
              onClick={() => onSelectTarget(character)}
              disabled={disabled}
              className="flex min-w-0 items-center gap-1.5"
              title={isActive ? `Talking to ${character.name}` : `Talk to ${character.name}`}
              aria-pressed={isActive}
            >
              <CharacterAvatar avatar={character.avatar} name={character.name} className="h-5 w-5 text-[10px]" />
              <span className="max-w-28 truncate">{character.name}</span>
            </button>
            {!disabled && (
              <button
                onClick={() => onRemoveParticipant(character.id)}
                className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
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
        className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        title="Add a character to this chat"
      >
        <Plus className="h-3 w-3" />
        {participants.length === 0 ? 'Add a character' : 'Add'}
      </button>
    </div>
  )
}
