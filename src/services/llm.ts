import type {
  AIModel,
  AIProvider,
  ChatMessage,
  ConnectionInput,
  GenerationParams,
  LLMChatEvent,
  LLMConnection,
  LLMResult,
  LLMState,
  LegacyLLMSettings,
} from '../types/chat'

// Settings older versions kept in localStorage, including a plaintext API key
const LEGACY_STORAGE_KEYS: Record<keyof LegacyLLMSettings, string> = {
  localUrl: 'ollama_base_url',
  secondaryLocalUrl: 'lmstudio_base_url',
  cloudKey: 'groq_api_key',
}

const getApi = () => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('Electron LLM API not available')
  }
  return window.electronAPI.llm
}

export class LLMService {
  static async init(): Promise<LLMState> {
    const legacy: LegacyLLMSettings = {}
    for (const [field, storageKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
      const value = localStorage.getItem(storageKey)
      if (value) legacy[field as keyof LegacyLLMSettings] = value
    }

    const state = await getApi().init(legacy)
    Object.values(LEGACY_STORAGE_KEYS).forEach((storageKey) => localStorage.removeItem(storageKey))
    return state
  }

  static listConnections(): Promise<LLMConnection[]> {
    return getApi().listConnections()
  }

  static saveConnection(input: ConnectionInput) {
    return getApi().saveConnection(input)
  }

  static deleteConnection(id: AIProvider): Promise<boolean> {
    return getApi().deleteConnection(id)
  }

  static forgetAllKeys(): Promise<void> {
    return getApi().forgetAllKeys()
  }

  static testConnection(draft: ConnectionInput) {
    return getApi().testConnection(draft)
  }

  static detectLocalServers() {
    return getApi().detectLocalServers()
  }

  static async listModels(id: AIProvider): Promise<LLMResult<{ models: AIModel[] }>> {
    const result = await getApi().listModels(id)
    if (!result.ok) return result
    return { ok: true, models: result.models.map((model) => ({ ...model, provider: id })) }
  }

  static async listEmbeddingModels(id: AIProvider): Promise<LLMResult<{ models: AIModel[] }>> {
    const result = await getApi().listEmbeddingModels(id)
    if (!result.ok) return result
    return { ok: true, models: result.models.map((model) => ({ ...model, provider: id })) }
  }

  static async *chatStream(
    connectionId: AIProvider,
    model: string,
    messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
    signal: AbortSignal,
    params?: Partial<GenerationParams>
  ): AsyncGenerator<string, void, unknown> {
    const api = getApi()
    const requestId = crypto.randomUUID()
    const queue: LLMChatEvent[] = []
    let wake: (() => void) | null = null

    const unsubscribe = api.onChatEvent(requestId, (event) => {
      queue.push(event)
      wake?.()
      wake = null
    })
    const onAbort = () => {
      api.abortChat(requestId)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      await api.startChat(requestId, { connectionId, model, messages, params })
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
        const event = queue.shift()
        if (!event) continue

        if (event.type === 'delta') yield event.text
        else if (event.type === 'done') return
        else if (event.type === 'aborted') throw new DOMException('Aborted', 'AbortError')
        else throw new Error(event.message)
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      unsubscribe()
    }
  }
}

// Collects a whole reply, for background jobs like summaries
export async function completeChat(
  connectionId: AIProvider,
  model: string,
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>,
  params?: Partial<GenerationParams>
): Promise<string> {
  let text = ''
  for await (const chunk of LLMService.chatStream(connectionId, model, messages, new AbortController().signal, params)) {
    text += chunk
  }
  return text
}
