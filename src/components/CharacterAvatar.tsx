import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { cn } from '@/lib/utils'
import { getInitials, isEmoji } from '@/lib/character'

interface CharacterAvatarProps {
  avatar?: string // emoji or image URL
  name: string
  className?: string
  fallbackClassName?: string
  emojiClassName?: string
}

/**
 * Renders a character avatar that supports either an emoji or an image URL.
 * Emojis render as large text; URLs render as images; otherwise initials are shown.
 */
export function CharacterAvatar({ avatar, name, className, fallbackClassName, emojiClassName }: CharacterAvatarProps) {
  const value = avatar?.trim()

  if (value && !isEmoji(value)) {
    return (
      <Avatar className={className}>
        <AvatarImage src={value} alt={name} />
        <AvatarFallback className={fallbackClassName}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <Avatar className={className}>
      <AvatarImage src={undefined} alt={name} />
      <AvatarFallback className={cn('select-none', fallbackClassName)}>
        {value ? (
          <span className={cn('leading-none', emojiClassName)}>{value}</span>
        ) : (
          getInitials(name)
        )}
      </AvatarFallback>
    </Avatar>
  )
}
