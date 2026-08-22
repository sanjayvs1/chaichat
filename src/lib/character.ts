const EMOJI_PATTERN = /^(?:[\u2190-\u2BFF\u2600-\u27BF\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]\uFE0F?\u200D?)+$/u

export function isEmoji(value: string | undefined | null): boolean {
  if (!value) return false
  const trimmed = value.trim()
  return trimmed.length <= 8 && EMOJI_PATTERN.test(trimmed)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
