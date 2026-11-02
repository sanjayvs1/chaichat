import crypto from 'crypto'
import { LLMError, embed, listModels, networkScope, normalizeBaseUrl, streamChat } from './client.js'

// Adding a provider means adding a row here, as long as it speaks the OpenAI format.
export const PRESETS = [
  {
    id: 'local',
    name: 'Local server',
    description: 'An LLM server running on this computer or your network',
    baseUrl: 'http://127.0.0.1:11434/v1',
    needsKey: false,
    editableUrl: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.claude.com/settings/keys',
    maxTokens: 8192,
    modelsQuery: 'limit=1000'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'xai',
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    needsKey: true,
    keyUrl: 'https://console.x.ai'
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    description: 'Any other service with an OpenAI-compatible API',
    baseUrl: '',
    needsKey: false,
    editableUrl: true
  }
]

// Default ports of popular local servers, probed only on this machine
const LOCAL_PORTS = [11434, 1234, 8080, 8000]
const LOCAL_PROBE_TIMEOUT_MS = 1500
const MIGRATED_SETTING = 'llmConnectionsMigrated'

// Connection ids older versions stored on sessions, kept so old chats still resolve
const LEGACY_LOCAL = [
  { id: 'ollama', port: 11434, urlField: 'localUrl' },
  { id: 'lmstudio', port: 1234, urlField: 'secondaryLocalUrl' }
]
const LEGACY_CLOUD_ID = 'groq'
const LEGACY_CLOUD_URL = 'https://api.groq.com/openai/v1'

const presetFor = (presetId) => PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[PRESETS.length - 1]
const originOf = (baseUrl) => new URL(baseUrl).origin
const failureMessage = (error) => (error instanceof Error ? error.message : 'Something went wrong')

function keyHint(apiKey) {
  return apiKey.length >= 12 ? apiKey.slice(-4) : ''
}

export class ConnectionManager {
  constructor({ db, safeStorage, fetchImpl }) {
    this.db = db
    this.safeStorage = safeStorage
    this.fetchImpl = fetchImpl
    // Keys the user chose not to save, or that can't be encrypted on this machine
    this.sessionKeys = new Map()
    this.activeChats = new Map()
  }

  get encryptionAvailable() {
    return this.safeStorage.isEncryptionAvailable()
  }

  readKey(row) {
    if (this.sessionKeys.has(row.id)) return this.sessionKeys.get(row.id)
    if (!row.apiKeyEncrypted) return ''
    try {
      return this.safeStorage.decryptString(Buffer.from(row.apiKeyEncrypted))
    } catch {
      return null // Saved under another OS account or profile
    }
  }

  // The only shape that leaves the main process. It must never carry a key.
  toPublic(row) {
    const key = this.readKey(row)
    const inSession = this.sessionKeys.has(row.id)
    return {
      id: row.id,
      presetId: row.presetId,
      name: row.name,
      baseUrl: row.baseUrl,
      defaultModel: row.defaultModel ?? '',
      lastUsedAt: row.lastUsedAt ?? null,
      scope: networkScope(row.baseUrl),
      keyState: key === null ? 'unreadable' : !key ? 'none' : inSession ? 'session' : 'saved',
      keyHint: row.keyHint ?? ''
    }
  }

  list() {
    return this.db.getLlmConnections().map((row) => this.toPublic(row))
  }

  toClientConnection(row, apiKey) {
    const preset = presetFor(row.presetId)
    return {
      baseUrl: row.baseUrl,
      apiKey,
      label: row.name,
      defaultModel: row.defaultModel,
      maxTokens: preset.maxTokens,
      modelsQuery: preset.modelsQuery
    }
  }

  requireConnection(id) {
    const row = this.db.getLlmConnection(id)
    if (!row) throw new LLMError('That connection no longer exists.')

    const apiKey = this.readKey(row)
    if (apiKey === null) throw new LLMError(`The saved key for ${row.name} can't be read here. Enter it again.`)
    if (!apiKey && presetFor(row.presetId).needsKey) throw new LLMError(`${row.name} needs an API key.`)
    return this.toClientConnection(row, apiKey)
  }

  storeKey(row, apiKey, remember) {
    this.sessionKeys.delete(row.id)
    row.keyHint = keyHint(apiKey)
    if (remember && this.encryptionAvailable) {
      row.apiKeyEncrypted = this.safeStorage.encryptString(apiKey)
    } else {
      row.apiKeyEncrypted = null
      this.sessionKeys.set(row.id, apiKey)
    }
  }

  clearKey(row) {
    this.sessionKeys.delete(row.id)
    row.apiKeyEncrypted = null
    row.keyHint = null
  }

  save(input) {
    const existing = input.id ? this.db.getLlmConnection(input.id) : null
    const preset = presetFor(existing?.presetId ?? input.presetId)
    const baseUrl = normalizeBaseUrl(preset.editableUrl ? input.baseUrl : preset.baseUrl)
    const now = new Date().toISOString()

    const row = existing ?? {
      id: crypto.randomUUID(),
      presetId: preset.id,
      createdAt: now,
      lastUsedAt: null,
      apiKeyEncrypted: null,
      keyHint: null
    }
    row.name = String(input.name ?? '').trim() || preset.name
    row.defaultModel = String(input.defaultModel ?? '').trim() || null

    // A key belongs to the server it was entered for, so it never follows a URL change
    const movedOrigin = !!existing && originOf(existing.baseUrl) !== originOf(baseUrl)
    row.baseUrl = baseUrl

    const apiKey = String(input.apiKey ?? '').trim()
    let keyCleared = false
    if (apiKey) {
      this.storeKey(row, apiKey, input.rememberKey !== false)
    } else if (input.clearKey || movedOrigin) {
      keyCleared = !!(row.apiKeyEncrypted || this.sessionKeys.has(row.id))
      this.clearKey(row)
    }

    this.db.saveLlmConnection(row)
    return { connection: this.toPublic(row), keyCleared }
  }

  delete(id) {
    this.sessionKeys.delete(id)
    return this.db.deleteLlmConnection(id)
  }

  forgetAllKeys() {
    this.sessionKeys.clear()
    this.db.clearLlmConnectionKeys()
  }

  async models(id) {
    try {
      const connection = this.requireConnection(id)
      return { ok: true, models: await listModels(connection, { fetchImpl: this.fetchImpl }) }
    } catch (error) {
      return { ok: false, error: failureMessage(error) }
    }
  }

  async embeddingModels(id) {
    try {
      const connection = this.requireConnection(id)
      return { ok: true, models: await listModels(connection, { fetchImpl: this.fetchImpl, embeddings: true }) }
    } catch (error) {
      return { ok: false, error: failureMessage(error) }
    }
  }

  embed(id, model, input) {
    return embed(this.requireConnection(id), { model, input }, { fetchImpl: this.fetchImpl })
  }

  // Checks unsaved form values, falling back to the stored key for the same server
  async test(draft) {
    try {
      const existing = draft.id ? this.db.getLlmConnection(draft.id) : null
      const preset = presetFor(existing?.presetId ?? draft.presetId)
      const baseUrl = normalizeBaseUrl(preset.editableUrl ? draft.baseUrl : preset.baseUrl)

      let apiKey = String(draft.apiKey ?? '').trim()
      if (!apiKey && existing && !draft.clearKey && originOf(existing.baseUrl) === originOf(baseUrl)) {
        apiKey = this.readKey(existing) ?? ''
      }
      if (!apiKey && preset.needsKey) return { ok: false, error: 'Enter an API key first.' }

      const models = await listModels(
        this.toClientConnection(
          { presetId: preset.id, baseUrl, name: draft.name || preset.name, defaultModel: draft.defaultModel },
          apiKey
        ),
        { fetchImpl: this.fetchImpl }
      )
      return { ok: true, modelCount: models.length }
    } catch (error) {
      return { ok: false, error: failureMessage(error) }
    }
  }

  async detectLocalServers() {
    const probes = LOCAL_PORTS.map(async (port) => {
      const baseUrl = `http://127.0.0.1:${port}/v1`
      try {
        const models = await listModels(
          { baseUrl, label: 'Local server' },
          { fetchImpl: this.fetchImpl, timeoutMs: LOCAL_PROBE_TIMEOUT_MS }
        )
        return models.length > 0 ? { baseUrl, modelCount: models.length } : null
      } catch {
        return null
      }
    })
    return (await Promise.all(probes)).filter(Boolean)
  }

  nextLocalName(url) {
    const taken = this.db.getLlmConnections().some((row) => row.presetId === 'local')
    return taken ? `Local server (port ${new URL(url).port || 80})` : 'Local server'
  }

  addMigrated(row) {
    const now = new Date().toISOString()
    this.db.saveLlmConnection({
      defaultModel: null,
      apiKeyEncrypted: null,
      keyHint: null,
      lastUsedAt: null,
      createdAt: now,
      ...row
    })
  }

  // A reload or a strict-mode double mount must not run the migration twice in parallel
  initialize(legacy = {}) {
    this.initializing ??= this.migrate(legacy).finally(() => {
      this.initializing = null
    })
    return this.initializing
  }

  // Runs once per install: moves old settings over and sets up any running local servers
  async migrate(legacy) {
    if (this.db.getSetting(MIGRATED_SETTING)) {
      return
    }

    const referenced = new Set(this.db.getSessionProviders())
    const lastActive = this.db.getSetting('lastActiveProvider')
    if (lastActive) referenced.add(lastActive)

    const detected = await this.detectLocalServers()
    const unclaimed = new Set(detected.map((server) => server.baseUrl))

    for (const { id, port, urlField } of LEGACY_LOCAL) {
      const defaultUrl = `http://127.0.0.1:${port}/v1`
      if (!legacy[urlField] && !referenced.has(id) && !unclaimed.has(defaultUrl)) continue

      let baseUrl = defaultUrl
      try {
        if (legacy[urlField]) baseUrl = normalizeBaseUrl(legacy[urlField])
      } catch {
        // Keep the default for an old URL that no longer parses
      }
      unclaimed.delete(baseUrl)
      this.addMigrated({ id, presetId: 'local', name: this.nextLocalName(baseUrl), baseUrl })
    }

    for (const baseUrl of unclaimed) {
      this.addMigrated({ id: crypto.randomUUID(), presetId: 'local', name: this.nextLocalName(baseUrl), baseUrl })
    }

    if (legacy.cloudKey) {
      const row = {
        id: LEGACY_CLOUD_ID,
        presetId: 'custom',
        name: 'Custom endpoint',
        baseUrl: LEGACY_CLOUD_URL,
        apiKeyEncrypted: null,
        keyHint: null
      }
      this.storeKey(row, legacy.cloudKey, true)
      this.addMigrated(row)
    }

    this.db.setSetting(MIGRATED_SETTING, 'true')
  }

  async chat(sender, requestId, { connectionId, model, messages, params }) {
    const controller = new AbortController()
    this.activeChats.set(requestId, controller)
    const send = (event) => {
      if (!sender.isDestroyed()) sender.send('llm:chat-event', { requestId, ...event })
    }

    try {
      const connection = this.requireConnection(connectionId)
      const stream = streamChat(
        connection,
        { model, messages, params, signal: controller.signal },
        { fetchImpl: this.fetchImpl }
      )
      for await (const text of stream) send({ type: 'delta', text })
      this.db.touchLlmConnection(connectionId, new Date().toISOString())
      send({ type: 'done' })
    } catch (error) {
      if (error?.name === 'AbortError') send({ type: 'aborted' })
      else send({ type: 'error', message: failureMessage(error) })
    } finally {
      this.activeChats.delete(requestId)
    }
  }

  abortChat(requestId) {
    this.activeChats.get(requestId)?.abort()
  }
}

export function registerLlmIpc(ipcMain, manager) {
  const state = () => ({
    presets: PRESETS,
    connections: manager.list(),
    encryptionAvailable: manager.encryptionAvailable
  })

  ipcMain.handle('llm:init', async (event, legacy) => {
    await manager.initialize(legacy)
    return state()
  })
  ipcMain.handle('llm:listConnections', async () => manager.list())
  ipcMain.handle('llm:saveConnection', async (event, input) => {
    try {
      return { ok: true, ...manager.save(input) }
    } catch (error) {
      return { ok: false, error: failureMessage(error) }
    }
  })
  ipcMain.handle('llm:deleteConnection', async (event, id) => manager.delete(id))
  ipcMain.handle('llm:forgetAllKeys', async () => manager.forgetAllKeys())
  ipcMain.handle('llm:testConnection', async (event, draft) => manager.test(draft))
  ipcMain.handle('llm:detectLocalServers', async () => manager.detectLocalServers())
  ipcMain.handle('llm:listModels', async (event, id) => manager.models(id))
  ipcMain.handle('llm:listEmbeddingModels', async (event, id) => manager.embeddingModels(id))
  ipcMain.handle('llm:startChat', (event, requestId, request) => {
    manager.chat(event.sender, requestId, request)
  })
  ipcMain.handle('llm:abortChat', (event, requestId) => manager.abortChat(requestId))
}
