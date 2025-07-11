import type { OllamaModelsResponse, OllamaChatRequest, ChatMessage } from '../types/ollama'

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

export class OllamaService {
  static async getModels(): Promise<OllamaModelsResponse> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching models:', error)
      throw new Error('Failed to connect to Ollama. Make sure Ollama is running on 127.0.0.1:11434')
    }
  }

  static async *chatStream(
    model: string, 
    messages: ChatMessage[]
  ): AsyncGenerator<string, void, unknown> {
    const requestBody: OllamaChatRequest = {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: true
    }

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      console.error('Error in chat stream:', error)
      throw new Error('Failed to stream chat response from Ollama')
    }
  }

  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }
} 