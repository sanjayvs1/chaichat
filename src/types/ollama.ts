export interface OllamaModel {
  name: string
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

export interface OllamaModelsResponse {
  models: OllamaModel[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  characterId?: string // Optional character ID for assistant messages
}

export interface OllamaChatRequest {
  model: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  stream?: boolean
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
  characterId?: string // Optional character ID for character-based sessions
} 

// Represents a character with name and description
export interface Character {
  id: string
  name: string
  description: string // Character description
  avatar?: string // Optional avatar image URL or emoji
  isDefault?: boolean // Whether this is a default character
  createdAt: string // ISO string
  updatedAt: string // ISO string
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