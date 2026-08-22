import type { OpenAIModelsResponse, ChatMessage } from '../types/ollama'

const DEFAULT_LMSTUDIO_BASE_URL = 'http://127.0.0.1:1234'

export class LMStudioService {
  static getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('lmstudio_base_url')
      if (stored) return stored.replace(/\/+$/, '')
    }
    return DEFAULT_LMSTUDIO_BASE_URL
  }

  static setBaseUrl(url: string): void {
    const trimmed = url.trim().replace(/\/+$/, '')
    if (trimmed) {
      localStorage.setItem('lmstudio_base_url', trimmed)
    } else {
      localStorage.removeItem('lmstudio_base_url')
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

  static async getModels(): Promise<OpenAIModelsResponse> {
    try {
      const response = await this.fetchWithTimeout(`${this.getBaseUrl()}/v1/models`)
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching LM Studio models:', error)
      throw new Error(`Failed to connect to LM Studio at ${this.getBaseUrl()}. Make sure the LM Studio server is running (Developer tab -> Start Server).`)
    }
  }

  static async *chatStream(
    model: string,
    messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, unknown> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          stream: true,
          temperature: 0.7,
          max_tokens: -1
        }),
        signal
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`LM Studio chat request failed (${response.status}): ${detail.slice(0, 200) || response.statusText}`)
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
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue

            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') return

            try {
              const data = JSON.parse(payload)
              const content = data.choices?.[0]?.delta?.content
              if (content) yield content
            } catch (parseError) {
              // Ignore malformed keep-alive/comment lines
              console.warn('Failed to parse LM Studio streaming chunk:', parseError)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      console.error('Error in LM Studio chat stream:', error)
      throw error instanceof Error ? error : new Error('Failed to stream chat response from LM Studio')
    }
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.getBaseUrl()}/v1/models`, {}, 3000)
      return response.ok
    } catch {
      return false
    }
  }
}
