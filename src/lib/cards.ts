import type { Character } from '../types/chat'
import { isEmoji } from './character'

// Tavern character cards: JSON, on its own or base64 in a PNG's tEXt chunk. V1 is flat,
// V2 and V3 nest it under `data`. Fields we don't use (lorebooks, extensions) are kept
// in cardExtras so an import followed by an export loses nothing.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PORTRAIT_WIDTH = 512
const PORTRAIT_HEIGHT = 768
const MAX_AVATAR_SIDE = 768

const CARD_FIELDS = new Set([
  'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'alternate_greetings',
  'system_prompt', 'post_history_instructions', 'creator', 'creator_notes', 'character_version', 'tags',
  // V1 leftovers some exporters still write
  'avatar', 'chat', 'create_date', 'fav', 'talkativeness',
])

interface CardData {
  name?: string
  description?: string
  personality?: string
  scenario?: string
  first_mes?: string
  mes_example?: string
  alternate_greetings?: unknown
  system_prompt?: string
  post_history_instructions?: string
  creator?: string
  creator_notes?: string
  character_version?: string
  tags?: unknown
  [key: string]: unknown
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, i) => bytes[i] === value)
}

function base64ToText(value: string): string {
  const binary = atob(value.trim())
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

function textToBase64(value: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Returns the card JSON from a PNG's text chunks. V3 wins when a file carries both. */
export function readPngCard(bytes: Uint8Array): string | null {
  if (!isPng(bytes)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const latin1 = new TextDecoder('latin1')
  const found: Record<string, string> = {}

  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    if (type === 'tEXt') {
      const data = bytes.subarray(dataStart, dataStart + length)
      const separator = data.indexOf(0)
      if (separator > 0) {
        const keyword = latin1.decode(data.subarray(0, separator)).toLowerCase()
        if (keyword === 'ccv3' || keyword === 'chara') found[keyword] = latin1.decode(data.subarray(separator + 1))
      }
    }
    if (type === 'IEND') break
    offset = dataStart + length + 4
  }

  const encoded = found.ccv3 ?? found.chara
  return encoded ? base64ToText(encoded) : null
}

/** Inserts a tEXt chunk just before IEND. */
export function writePngCard(png: Uint8Array, keyword: string, cardJson: string): Uint8Array {
  const encoder = new TextEncoder()
  const body = new Uint8Array([...encoder.encode(keyword), 0, ...encoder.encode(textToBase64(cardJson))])

  const chunk = new Uint8Array(12 + body.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, body.length)
  chunk.set(encoder.encode('tEXt'), 4)
  chunk.set(body, 8)
  view.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)))

  // IEND is always the last 12 bytes
  const iend = png.length - 12
  const output = new Uint8Array(png.length + chunk.length)
  output.set(png.subarray(0, iend), 0)
  output.set(chunk, iend)
  output.set(png.subarray(iend), iend + chunk.length)
  return output
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []

export function cardToCharacter(raw: unknown, avatar?: string): Character {
  const root = (raw ?? {}) as { data?: CardData } & CardData
  const card: CardData = root.data && typeof root.data === 'object' ? root.data : root
  const name = String(card.name ?? '').trim()
  if (!name) throw new Error("This file isn't a character card.")

  const extras = Object.fromEntries(Object.entries(card).filter(([key]) => !CARD_FIELDS.has(key)))
  const now = new Date().toISOString()
  const extensions = extras.extensions as { chaichat?: { tagline?: string } } | undefined

  return {
    id: crypto.randomUUID(),
    name,
    tagline: extensions?.chaichat?.tagline,
    description: String(card.description ?? ''),
    personality: String(card.personality ?? '') || undefined,
    scenario: String(card.scenario ?? '') || undefined,
    greeting: String(card.first_mes ?? '') || undefined,
    messageExample: String(card.mes_example ?? '') || undefined,
    alternateGreetings: stringList(card.alternate_greetings),
    systemPrompt: String(card.system_prompt ?? '') || undefined,
    postHistory: String(card.post_history_instructions ?? '') || undefined,
    creator: String(card.creator ?? '') || undefined,
    creatorNotes: String(card.creator_notes ?? '') || undefined,
    characterVersion: String(card.character_version ?? '') || undefined,
    tags: stringList(card.tags),
    cardExtras: Object.keys(extras).length > 0 ? JSON.stringify(extras) : undefined,
    avatar,
    memoryEnabled: true,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function characterToCard(character: Character) {
  let extras: Record<string, unknown> = {}
  try {
    extras = character.cardExtras ? JSON.parse(character.cardExtras) : {}
  } catch {
    // Unreadable extras aren't worth failing an export over
  }

  const extensions = {
    ...(extras.extensions as Record<string, unknown> | undefined),
    ...(character.tagline ? { chaichat: { tagline: character.tagline } } : {}),
  }
  const data = {
    ...extras,
    name: character.name,
    description: character.description,
    personality: character.personality ?? '',
    scenario: character.scenario ?? '',
    first_mes: character.greeting ?? '',
    mes_example: character.messageExample ?? '',
    alternate_greetings: character.alternateGreetings ?? [],
    system_prompt: character.systemPrompt ?? '',
    post_history_instructions: character.postHistory ?? '',
    creator: character.creator ?? '',
    creator_notes: character.creatorNotes ?? '',
    character_version: character.characterVersion ?? '',
    tags: character.tags ?? [],
    extensions,
  }
  // The flat fields are for V1 readers
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    first_mes: data.first_mes,
    mes_example: data.mes_example,
    data,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("That image couldn't be read."))
    image.src = src
  })
}

/** Fits an uploaded image into a size that's reasonable to keep in the database. */
export async function fileToAvatar(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/webp', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function importCharacterFile(file: File): Promise<Character> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (isPng(bytes)) {
    const json = readPngCard(bytes)
    if (!json) throw new Error(`${file.name} is a plain image with no character card inside.`)
    return cardToCharacter(JSON.parse(json), await fileToAvatar(file))
  }

  try {
    return cardToCharacter(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${file.name} isn't a character card.`)
    throw error
  }
}

function drawPlaceholder(context: CanvasRenderingContext2D, character: Character) {
  const hue = nameHue(character.name)
  const gradient = context.createLinearGradient(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT)
  gradient.addColorStop(0, `hsl(${hue} 45% 32%)`)
  gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 50% 14%)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = 'white'
  context.font = '220px serif'
  const mark = isEmoji(character.avatar) ? character.avatar!.trim() : character.name.charAt(0).toUpperCase()
  context.fillText(mark, PORTRAIT_WIDTH / 2, PORTRAIT_HEIGHT / 2)
}

async function renderPortrait(character: Character): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = PORTRAIT_WIDTH
  canvas.height = PORTRAIT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw the card image.')

  drawPlaceholder(context, character)
  if (character.avatar && !isEmoji(character.avatar)) {
    try {
      const image = await loadImage(character.avatar)
      const scale = Math.max(PORTRAIT_WIDTH / image.width, PORTRAIT_HEIGHT / image.height)
      const width = image.width * scale
      const height = image.height * scale
      context.drawImage(image, (PORTRAIT_WIDTH - width) / 2, (PORTRAIT_HEIGHT - height) / 2, width, height)
    } catch {
      // A remote image that can't be read keeps the placeholder
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not draw the card image.')
  return new Uint8Array(await blob.arrayBuffer())
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const safeFilename = (name: string) => name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'character'

export async function exportCharacterPng(character: Character) {
  const json = JSON.stringify(characterToCard(character))
  const png = writePngCard(await renderPortrait(character), 'chara', json)
  downloadBlob(new Blob([png.slice()], { type: 'image/png' }), `${safeFilename(character.name)}.png`)
}

export function exportCharacterJson(character: Character) {
  const json = JSON.stringify(characterToCard(character), null, 2)
  downloadBlob(new Blob([json], { type: 'application/json' }), `${safeFilename(character.name)}.json`)
}

/** A stable hue per name, used to tint everything belonging to a character. */
export function nameHue(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360
  return hash
}
