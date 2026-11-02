import type {
  Character,
  CharacterMemory,
  ChatMessage,
  GroupContext,
  Persona,
  PromptReport,
  PromptSection,
  VectorMatch,
} from '../types/chat'
import { estimateTokens } from './tokens'

type PromptMessage = Pick<ChatMessage, 'role' | 'content'>

const DEFAULT_MAIN_PROMPT =
  "Write {{char}}'s next reply in a fictional chat with {{user}}. Stay in character, and write only for {{char}}."
const MAX_MEMORIES_IN_PROMPT = 30
const AUTHOR_NOTE_DEPTH = 4

export const CONTINUE_NUDGE =
  '[Continue your previous reply from exactly where it stopped. Do not repeat anything or add a preamble.]'
export const IMPERSONATE_NUDGE =
  "[Write {{user}}'s next message, in their voice and in first person. Write only that message, nothing from {{char}}.]"

export interface MacroContext {
  charName?: string
  userName: string
  groupNames?: string[]
}

function pickRandom(options: string): string {
  const parts = options.split(/::|,/).map((part) => part.trim())
  return parts[Math.floor(Math.random() * parts.length)] ?? ''
}

// The {{macros}} character cards are written with, plus the legacy <USER>/<BOT> forms
export function applyMacros(text: string, context: MacroContext): string {
  const char = context.charName ?? 'Assistant'
  const now = new Date()
  return text
    .replace(/\{\{user\}\}|<user>/gi, context.userName)
    .replace(/\{\{char\}\}|<bot>/gi, char)
    .replace(/\{\{group\}\}/gi, (context.groupNames ?? [char]).join(', '))
    .replace(/\{\{time\}\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{\{date\}\}/gi, now.toLocaleDateString([], { dateStyle: 'long' }))
    .replace(/\{\{weekday\}\}/gi, now.toLocaleDateString([], { weekday: 'long' }))
    .replace(/\{\{random:(.+?)\}\}/gi, (_match, options: string) => pickRandom(options))
    .replace(/\{\{roll:(?:1?d)?(\d+)\}\}/gi, (_match, sides: string) =>
      String(1 + Math.floor(Math.random() * Number(sides)))
    )
    .replace(/\{\{trim\}\}/gi, '')
}

// Example dialogue blocks are separated by <START>
export function parseExampleDialogue(text: string): string[] {
  return text
    .split(/<START>/i)
    .map((block) => block.trim())
    .filter(Boolean)
}

function characterSheet(character: Character): string {
  const sections: string[] = []
  const prompt = character.systemPrompt?.trim() ?? ''
  // Older characters had their description copied into the prompt when saved
  const add = (label: string, value?: string) => {
    const text = value?.trim()
    if (text && !prompt.includes(text)) sections.push(`${label}:\n${text}`)
  }
  add(`About {{char}}`, character.description)
  add(`{{char}}'s personality`, character.personality)
  add('Scenario', character.scenario)
  return sections.join('\n\n')
}

export function resolveUserName(persona: Persona | undefined): string {
  return persona?.name.trim() || 'User'
}

export function resolveGreeting(greeting: string, character: Character, persona?: Persona): string {
  return applyMacros(greeting, { charName: character.name, userName: resolveUserName(persona) })
}

/**
 * Each character only sees their own slice of the conversation in 'separate' mode:
 * what they wrote, and user messages addressed to them or to nobody in particular.
 * In 'shared' mode everyone sees everything, with other speakers attributed by name.
 */
export function visibleHistory(
  messages: ChatMessage[],
  target: Character | undefined,
  groupContext: GroupContext,
  characters: Character[]
): PromptMessage[] {
  const spoken = messages
    .filter((m) => m.content !== '' && m.role !== 'system')
    .map((m) => ({ ...m, content: stripThinking(m.content) }))
  if (!target) return spoken.map(({ role, content }) => ({ role, content }))

  if (groupContext === 'separate') {
    return spoken
      .filter((m) =>
        m.role === 'assistant' ? m.characterId === target.id : !m.targetId || m.targetId === target.id
      )
      .map(({ role, content }) => ({ role, content }))
  }

  return spoken.map((m) => {
    if (m.role === 'assistant' && m.characterId && m.characterId !== target.id) {
      const speaker = characters.find((c) => c.id === m.characterId)?.name ?? 'Someone'
      // Another character's line is something the target heard, not something it said
      return { role: 'user', content: `${speaker}: ${m.content}` }
    }
    return { role: m.role, content: m.content }
  })
}

// A model's reasoning is for the reader, sending it back only costs context
function stripThinking(text: string): string {
  return text.replace(/<(think|thinking|thought|reasoning)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '').trim()
}

// Strict chat templates reject two turns in a row from the same role
function mergeConsecutive(messages: PromptMessage[]): PromptMessage[] {
  const merged: PromptMessage[] = []
  for (const message of messages) {
    const last = merged[merged.length - 1]
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${message.content}`
    } else {
      merged.push({ ...message })
    }
  }
  return merged
}

export interface BuildPromptInput {
  target?: Character
  characters: Character[]
  groupNames?: string[]
  persona?: Persona
  globalInstructions: string
  memories: CharacterMemory[]
  summary?: string
  recalled: VectorMatch[]
  authorNote?: string
  messages: ChatMessage[]
  groupContext: GroupContext
  contextTokens: number
  // Reserved for the reply, so it isn't squeezed out of the model's window
  responseTokens: number
  // Sent last as a user turn, for continue and impersonate
  nudge?: string
}

/**
 * Assembles the prompt in SillyTavern's order: definition, persona, what's remembered,
 * examples, then as much recent history as fits. Everything but the history goes into one
 * leading system message, because some local chat templates reject a system turn later on.
 */
export function buildPrompt(input: BuildPromptInput): PromptReport {
  const { target, characters, persona, memories, summary, recalled, authorNote, messages } = input
  const macros: MacroContext = {
    charName: target?.name,
    userName: resolveUserName(persona),
    groupNames: input.groupNames,
  }
  const expand = (text: string) => applyMacros(text, macros)

  const sections: PromptSection[] = []
  const systemParts: string[] = []
  const addSystem = (label: string, text: string | undefined) => {
    const value = text?.trim()
    if (!value) return
    const expanded = expand(value)
    systemParts.push(expanded)
    sections.push({ label, tokens: estimateTokens(expanded) })
  }

  if (target) {
    addSystem(`${target.name}'s prompt`, target.systemPrompt || DEFAULT_MAIN_PROMPT)
    addSystem(`${target.name}'s definition`, characterSheet(target))
  }
  addSystem('Your instructions', input.globalInstructions)
  if (persona?.description.trim()) {
    addSystem('Your persona', `About {{user}}:\n${persona.description.trim()}`)
  }
  if (memories.length > 0) {
    const facts = memories.slice(0, MAX_MEMORIES_IN_PROMPT).map((m) => `- ${m.content}`).join('\n')
    addSystem('Character memory', `Things {{char}} remembers (bring these up naturally, never list them):\n${facts}`)
  }
  if (summary?.trim()) {
    addSystem('Chat summary', `The story so far:\n${summary.trim()}`)
  }
  if (recalled.length > 0) {
    const lines = recalled.map((match) => {
      const speaker =
        match.role === 'user'
          ? macros.userName
          : (characters.find((c) => c.id === match.characterId)?.name ?? macros.charName ?? 'Assistant')
      return `${speaker}: ${match.content}`
    })
    addSystem('Recalled messages', `Earlier moments that may be relevant:\n${lines.join('\n')}`)
  }
  if (target?.messageExample?.trim()) {
    const examples = parseExampleDialogue(target.messageExample)
      .map((block) => `<example>\n${block}\n</example>`)
      .join('\n')
    addSystem('Example dialogue', `How {{char}} talks:\n${examples}`)
  }

  const system = systemParts.join('\n\n')
  const trailing = [target?.postHistory ?? '', input.nudge ?? ''].map((text) => expand(text).trim()).filter(Boolean)
  const note = authorNote?.trim() ? expand(authorNote.trim()) : ''

  // Newest history first until the budget runs out
  const budget = Math.max(input.contextTokens - input.responseTokens, 256)
  const used =
    estimateTokens(system) +
    estimateTokens(note) +
    trailing.reduce((total, text) => total + estimateTokens(text), 0)

  const history = visibleHistory(messages, target, input.groupContext, characters)

  let remaining = budget - used
  let start = history.length
  while (start > 0) {
    const cost = estimateTokens(history[start - 1].content)
    if (cost > remaining) break
    remaining -= cost
    start--
  }
  // The latest message is what's being answered, so it's sent even over budget
  if (start === history.length && history.length > 0) start = history.length - 1

  const window = history.slice(start).map(({ role, content }) => ({ role, content: expand(content) }))

  if (note) {
    const depth = Math.min(AUTHOR_NOTE_DEPTH, window.length)
    window.splice(window.length - depth, 0, { role: 'user', content: `[Author's note: ${note}]` })
    sections.push({ label: "Author's note", tokens: estimateTokens(note) })
  }
  sections.push({
    label: `Chat history (${history.length - start} of ${history.length})`,
    tokens: window.reduce((total, m) => total + estimateTokens(m.content), 0),
  })
  if (trailing.length > 0) {
    window.push({ role: 'user', content: trailing.join('\n\n') })
    sections.push({ label: 'After-history instructions', tokens: estimateTokens(trailing.join('\n\n')) })
  }

  const wire: PromptMessage[] = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...mergeConsecutive(window),
  ]

  return {
    sections,
    totalTokens: wire.reduce((total, m) => total + estimateTokens(m.content), 0),
    budget,
    historyIncluded: history.length - start,
    historyTotal: history.length,
    recalled: recalled.length,
    messages: wire,
  }
}
