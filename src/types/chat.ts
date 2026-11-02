// Id of a saved connection
export type AIProvider = string

export interface AIModel {
  name: string
  provider: AIProvider
  contextWindow?: number
}

export type ProviderStatus = Record<AIProvider, boolean>

export type ConnectionScope = 'device' | 'network' | 'cloud'
export type ConnectionKeyState = 'none' | 'saved' | 'session' | 'unreadable'

export interface ConnectionPreset {
  id: string
  name: string
  description?: string
  baseUrl: string
  needsKey: boolean
  editableUrl?: boolean
  keyUrl?: string
}

// A saved connection as the UI sees it. API keys stay in the main process.
export interface LLMConnection {
  id: AIProvider
  presetId: string
  name: string
  baseUrl: string
  defaultModel: string
  lastUsedAt: string | null
  scope: ConnectionScope
  keyState: ConnectionKeyState
  keyHint: string
}

export interface ConnectionInput {
  id?: AIProvider
  presetId: string
  name: string
  baseUrl: string
  defaultModel?: string
  apiKey?: string
  clearKey?: boolean
  rememberKey?: boolean
}

export interface LLMState {
  presets: ConnectionPreset[]
  connections: LLMConnection[]
  encryptionAvailable: boolean
}

export interface LegacyLLMSettings {
  localUrl?: string
  secondaryLocalUrl?: string
  cloudKey?: string
}

export type LLMResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export type LLMChatEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'aborted' }
  | { requestId: string; type: 'error'; message: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  characterId?: string // Author character for assistant messages
  targetId?: string // Character a user message is addressed to (multi-character chats)
  swipes?: string[] // Alternate versions of an assistant message, content is swipes[swipeIndex]
  swipeIndex?: number
}

// Represents a stored past conversation
export interface ChatSession {
  id: string
  title: string // short description derived from first user message
  createdAt: string // ISO string
  updatedAt: string // ISO string
  messages: ChatMessage[]
  characterId?: string // Primary character (legacy single-character sessions)
  participantIds?: string[] // All character IDs participating in this chat
  provider?: AIProvider // Optional provider saved with the session
  selectedModel?: string // Optional model saved with the session
  summary?: string // Rolling summary of the older part of the chat
  summaryThroughId?: string // Last message the summary covers
  authorNote?: string // Standing note kept near the end of every prompt
  personaId?: string // Overrides the active persona for this chat
}

// Represents a roleplay character defined by a system prompt
export interface Character {
  id: string
  name: string
  tagline?: string // Short one-liner shown in lists
  description: string // Personality/background blurb, folded into the prompt if no systemPrompt
  systemPrompt?: string // Full character definition sent as the system message
  greeting?: string // Optional opening message the character starts chats with
  alternateGreetings?: string[] // More openings to swipe through
  personality?: string // Short personality summary
  scenario?: string // Where the chat takes place
  messageExample?: string // Example dialogue, blocks separated by <START>
  postHistory?: string // Instructions placed after the chat history
  creator?: string
  creatorNotes?: string // For the reader, never sent to the model
  characterVersion?: string
  tags?: string[]
  favorite?: boolean
  cardExtras?: string // JSON of card data we don't use, kept so exports round-trip
  avatar?: string // Optional avatar image URL or emoji
  memoryEnabled?: boolean // Whether long-term memory is enabled for this character
  isDefault?: boolean // Whether this is a default character
  createdAt: string // ISO string
  updatedAt: string // ISO string
}

// A durable fact a character remembers about the user / past interactions
export interface CharacterMemory {
  id: string
  characterId: string
  content: string
  createdAt: string
  updatedAt: string
  sourceSessionId?: string | null
}

// Who the user plays as
export interface Persona {
  id: string
  name: string
  description: string
  avatar?: string
  createdAt: string
  updatedAt: string
}

// Sampling sent with each request
export interface GenerationParams {
  temperature: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  maxTokens: number // 0 leaves it to the server
  contextTokens: number // Prompt budget, oldest history is dropped to fit
  stop: string[]
  seed: number // -1 is random
}

export interface SummarySettings {
  enabled: boolean
  everyMessages: number
  maxWords: number
  prompt: string
}

export type VectorScope = 'chat' | 'character'

// Empty connectionId/model means the built-in embedding
export interface VectorSource {
  connectionId: string
  model: string
}

export interface VectorSettings extends VectorSource {
  enabled: boolean
  scope: VectorScope
  topK: number
}

export type GroupContext = 'separate' | 'shared'
export type ChatFont = 'serif' | 'sans'
export type AccentName = 'chai' | 'rose' | 'jade' | 'iris'

export interface AppSettings {
  generation: GenerationParams
  summary: SummarySettings
  vectors: VectorSettings
  groupContext: GroupContext
  personaId: string | null
  chatFont: ChatFont
  accent: AccentName
  ambience: boolean
}

export interface VectorMatch {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  characterId?: string | null
  sessionId: string
  score: number
}

// One labelled piece of the prompt, shown by the prompt inspector
export interface PromptSection {
  label: string
  tokens: number
}

export interface PromptReport {
  sections: PromptSection[]
  totalTokens: number
  budget: number
  historyIncluded: number
  historyTotal: number
  recalled: number
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
}

// Saved Python script from LLM responses
export interface SavedScript {
  id: string
  name: string
  code: string
  language: string
  createdAt: string
  updatedAt: string
  lastRunAt?: string | null
  sessionId?: string | null
}

export interface ScriptExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
} 