import Groq from 'groq-sdk'
import type { ChatMessage } from '../types/ollama'

export interface GroqModel {
  id: string
  object: string
  created: number
  owned_by: string
  active: boolean
  context_window: number
  public_apps: null
}

export interface GroqModelsResponse {
  data: GroqModel[]
  object: string
}

export class GroqService {
  private static groq: Groq | null = null

  private static getClient(): Groq {
    if (!this.groq) {
      const apiKey = this.getApiKey()
      if (!apiKey) {
        throw new Error('Groq API key not found. Please set your API key in settings.')
      }
      this.groq = new Groq({
        apiKey,
        dangerouslyAllowBrowser: true
      })
    }
    return this.groq
  }

  // Reset client to prevent any potential context bleeding
  static resetClient(): void {
    this.groq = null
  }

  static getApiKey(): string | null {
    // Try localStorage first, then environment variable for development
    return localStorage.getItem('groq_api_key') || import.meta.env.VITE_GROQ_API_KEY || null
  }

  static setApiKey(apiKey: string): void {
    localStorage.setItem('groq_api_key', apiKey)
    // Reset client to use new API key
    this.groq = null
  }

  static hasApiKey(): boolean {
    return !!this.getApiKey()
  }

  static async getModels(): Promise<GroqModel[]> {
    try {
      const client = this.getClient()
      const response = await client.models.list()
      return (response.data as GroqModel[]).filter(model => model.active)
    } catch (error) {
      console.error('Error fetching Groq models:', error)
      throw new Error('Failed to fetch models from Groq. Please check your API key.')
    }
  }

  static async *chatStream(
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<string, void, unknown> {
    try {
      const client = this.getClient()
      
      const groqMessages = messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }))

      const stream = await client.chat.completions.create({
        model,
        messages: groqMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
        // Groq-specific optimizations for streaming
        top_p: 0.9,
        stop: null,
        frequency_penalty: 0,
        presence_penalty: 0,
        // Optimize for streaming performance
        stream_options: {
          include_usage: false // Reduce overhead by not including usage stats
        }
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          yield content
        }
      }
    } catch (error) {
      console.error('Error in Groq chat stream:', error)
      if (error instanceof Error && error.message.includes('401')) {
        throw new Error('Invalid Groq API key. Please check your API key in settings.')
      }
      throw new Error('Failed to stream chat response from Groq')
    }
  }

  static async checkHealth(): Promise<boolean> {
    try {
      if (!this.hasApiKey()) {
        return false
      }
      await this.getModels()
      return true
    } catch {
      return false
    }
  }
}
