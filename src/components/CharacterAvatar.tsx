import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getInitials, isEmoji } from '@/lib/character'
import { nameHue } from '@/lib/cards'

interface CharacterAvatarProps {
  avatar?: string // emoji or image URL
  name: string
  className?: string
}

/**
 * Renders a character avatar that supports either an emoji or an image URL.
 * Without an image, the character's own hue fills the frame so nobody looks alike.
 */
export function CharacterAvatar({ avatar, name, className }: CharacterAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const value = avatar?.trim()
  const hue = nameHue(name)

  const showImage = value && !isEmoji(value) && failedSrc !== value

  return (
    <span
      className={cn(
        'relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display text-white',
        className
      )}
      style={{ background: `linear-gradient(150deg, oklch(0.55 0.1 ${hue}), oklch(0.34 0.08 ${(hue + 35) % 360}))` }}
    >
      {showImage ? (
        <img
          src={value}
          alt={name}
          draggable={false}
          onError={() => setFailedSrc(value)}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <span className="leading-none" aria-label={name}>{value && isEmoji(value) ? value : getInitials(name)}</span>
      )}
    </span>
  )
}
