export type AIProvider = 'ollama' | 'groq' | 'lmstudio'

export interface BaseModel {
  name: string
  provider: AIProvider
}

export interface OllamaModel extends BaseModel {
  provider: 'ollama'
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface GroqModel extends BaseModel {
  provider: 'groq'
  id: string
  object: string
  created: number
  owned_by: string
  active: boolean
  context_window: number
}

export interface OpenAICompatibleModel extends BaseModel {
  provider: 'lmstudio'
  id: string
  object?: string
  owned_by?: string
}

export type AIModel = OllamaModel | GroqModel | OpenAICompatibleModel

export interface OllamaModelsResponse {
  models: OllamaModel[]
}

export interface OpenAIModelsResponse {
  data: Array<{
    id: string
    object: string
    owned_by?: string
  }>
}

export interface ProviderStatus {
  ollama: boolean
  groq: boolean
  lmstudio: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  characterId?: string // Author character for assistant messages
  targetId?: string // Character a user message is addressed to (multi-character chats)
}

export interface OllamaChatRequest {
  model: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  stream?: boolean
  options?: {
    num_ctx?: number
    temperature?: number
    top_p?: number
    top_k?: number
    repeat_penalty?: number
    num_predict?: number
    tfs_z?: number
    typical_p?: number
    mirostat?: number
    mirostat_tau?: number
    mirostat_eta?: number
  }
}

export interface OllamaChatResponse {
  model: string
  created_at: string
  message: {
    role: 'assistant'
    content: string
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaStreamResponse {
  model: string
  created_at: string
  message: {
    role: 'assistant'
    content: string
  }
  done: boolean
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
}

// Represents a roleplay character defined by a system prompt
export interface Character {
  id: string
  name: string
  tagline?: string // Short one-liner shown in lists
  description: string // Personality/background blurb, folded into the prompt if no systemPrompt
  systemPrompt?: string // Full character definition sent as the system message
  greeting?: string // Optional opening message the character starts chats with
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

// For character search and filtering
export interface CharacterSearchResult {
  character: Character
  relevanceScore?: number
}

// For character import/export
export interface CharacterExportData {
  version: string
  exportDate: string
  characters: Character[]
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