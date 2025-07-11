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
  messages: ChatMessage[]
} 