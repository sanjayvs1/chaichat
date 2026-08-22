import type { OllamaModelsResponse, OllamaChatRequest, ChatMessage } from '../types/ollama'

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

export class OllamaService {
  static getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ollama_base_url')
      if (stored) return stored.replace(/\/+$/, '')
    }
    return DEFAULT_OLLAMA_BASE_URL
  }

  static setBaseUrl(url: string): void {
    const trimmed = url.trim().replace(/\/+$/, '')
    if (trimmed) {
      localStorage.setItem('ollama_base_url', trimmed)
    } else {
      localStorage.removeItem('ollama_base_url')
    }
  }

  private static async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  static async getModels(): Promise<OllamaModelsResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/tags`)
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching models:', error)
      throw new Error(`Failed to connect to Ollama. Make sure Ollama is running on ${this.getBaseUrl()}`)
    }
  }

  static async *chatStream(
    model: string, 
    messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    const requestBody: OllamaChatRequest = {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: true,
      // Performance optimizations for Ollama
      options: {
        num_ctx: 4096, // Context window size
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        // Optimize for streaming performance
        num_predict: -1, // Allow full generation
        tfs_z: 1.0,
        typical_p: 1.0,
        mirostat: 0,
        mirostat_tau: 5.0,
        mirostat_eta: 0.1
      }
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal
      })

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line)
                if (data.message?.content) {
                  yield data.message.content
                }
                if (data.done) {
                  return
                }
              } catch (parseError) {
                console.warn('Failed to parse streaming response:', parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      console.error('Error in chat stream:', error)
      throw new Error('Failed to stream chat response from Ollama')
    }
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.getBaseUrl()}/api/tags`, {}, 3000)
      return response.ok
    } catch {
      return false
    }
  }
} 