// Common helper for every LLM connection. Local servers and cloud providers all
// speak the OpenAI chat format, so this is the only place that talks to them.

const LIST_TIMEOUT_MS = 8000
const EMBEDDING_TIMEOUT_MS = 60000
const DEFAULT_TEMPERATURE = 0.7
const NON_CHAT_MODEL = /embed|whisper|tts|dall-?e|moderation|rerank|transcribe|realtime|image|audio/i
const EMBEDDING_MODEL = /embed|bge|minilm|mxbai/i

export class LLMError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'LLMError'
    this.status = status
  }
}

export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new LLMError('Enter a server URL.')

  let url
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`)
  } catch {
    throw new LLMError(`"${raw}" is not a valid URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LLMError('The server URL must start with http:// or https://.')
  }

  // Accept a pasted endpoint URL, and bare hosts that serve the API under /v1
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '')
  return `${url.origin}${pathname || '/v1'}`
}

// Where messages physically go, which is what the privacy labels are built on
export function networkScope(baseUrl) {
  const { hostname } = new URL(baseUrl)
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || /^127\./.test(host)) return 'device'
  if (
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return 'network'
  }
  return 'cloud'
}

function buildHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  }
}

function redact(text, apiKey) {
  return apiKey ? text.split(apiKey).join('[redacted]') : text
}

async function readErrorDetail(response, apiKey) {
  const body = await response.text().catch(() => '')
  let detail = body
  try {
    const parsed = JSON.parse(body)
    detail = parsed.error?.message ?? parsed.message ?? (typeof parsed.error === 'string' ? parsed.error : body)
  } catch {
    // Not JSON, keep the raw body
  }
  return redact(String(detail), apiKey).slice(0, 300)
}

function httpError(status, detail, label) {
  if (status === 401 || status === 403) {
    return new LLMError(`${label} rejected the API key. Check it under Connections.`, status)
  }
  if (status === 429) {
    return new LLMError(`${label} is rate limiting requests. ${detail}`.trim(), status)
  }
  return new LLMError(`${label} returned an error (${status}). ${detail}`.trim(), status)
}

function connectionError(error, connection) {
  if (error?.name === 'AbortError') return error
  if (error instanceof LLMError) return error
  const host = new URL(connection.baseUrl).host
  if (error?.name === 'TimeoutError') return new LLMError(`Timed out waiting for ${host}.`)
  return new LLMError(`Couldn't reach ${host}. Check that it's running and the URL is right.`)
}

/**
 * @param connection { baseUrl, apiKey, label, defaultModel?, modelsQuery? }
 */
export async function listModels(connection, { fetchImpl = fetch, timeoutMs = LIST_TIMEOUT_MS, embeddings = false } = {}) {
  const { baseUrl, apiKey, label, defaultModel, modelsQuery } = connection
  const manual = defaultModel ? [{ name: defaultModel }] : []

  let response
  try {
    response = await fetchImpl(`${baseUrl}/models${modelsQuery ? `?${modelsQuery}` : ''}`, {
      headers: buildHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    throw connectionError(error, connection)
  }

  // Reachable, but this server has no model listing
  if (response.status === 404 || response.status === 405) return manual
  if (!response.ok) throw httpError(response.status, await readErrorDetail(response, apiKey), label)

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new LLMError(`${label} didn't answer like an LLM API. Check the URL.`)
  }

  const raw = payload?.data ?? payload?.models
  if (!Array.isArray(raw)) throw new LLMError(`${label} didn't answer like an LLM API. Check the URL.`)

  const models = raw
    .filter((model) => model?.active !== false)
    .map((model) => ({
      name: String(model.id ?? model.name ?? '').replace(/^models\//, ''),
      contextWindow: model.context_window ?? model.context_length
    }))
    .filter((model) => model.name)

  if (embeddings) return models.filter((model) => EMBEDDING_MODEL.test(model.name))

  const chatModels = models.filter((model) => !NON_CHAT_MODEL.test(model.name))
  const listed = chatModels.length > 0 ? chatModels : models
  return [...manual.filter((m) => !listed.some((l) => l.name === m.name)), ...listed]
}

async function postChat(connection, body, signal, fetchImpl) {
  return fetchImpl(`${connection.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(connection.apiKey),
    body: JSON.stringify(body),
    signal
  })
}

// Only what the user moved off its neutral value goes on the wire
function samplingFields(params = {}) {
  return {
    temperature: params.temperature ?? DEFAULT_TEMPERATURE,
    ...(params.topP !== undefined && params.topP !== 1 ? { top_p: params.topP } : {}),
    ...(params.frequencyPenalty ? { frequency_penalty: params.frequencyPenalty } : {}),
    ...(params.presencePenalty ? { presence_penalty: params.presencePenalty } : {}),
    ...(params.stop?.length ? { stop: params.stop.slice(0, 4) } : {}),
    ...(params.seed !== undefined && params.seed >= 0 ? { seed: params.seed } : {})
  }
}

/**
 * Streams the reply as text chunks.
 * @param connection { baseUrl, apiKey, label, maxTokens? }
 * @param params { temperature?, topP?, frequencyPenalty?, presencePenalty?, maxTokens?, stop?, seed? }
 */
export async function* streamChat(connection, { model, messages, params, signal }, { fetchImpl = fetch } = {}) {
  const { apiKey, label } = connection
  const maxTokens = params?.maxTokens || connection.maxTokens
  const sampling = samplingFields(params)
  const body = {
    model,
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream: true,
    ...sampling,
    ...(maxTokens ? { max_tokens: maxTokens } : {})
  }

  let response
  try {
    response = await postChat(connection, body, signal, fetchImpl)
    // Some models refuse custom sampling; the provider defaults are fine for those
    if (response.status === 400) {
      await response.body?.cancel().catch(() => {})
      for (const field of Object.keys(sampling)) delete body[field]
      response = await postChat(connection, body, signal, fetchImpl)
    }
  } catch (error) {
    throw connectionError(error, connection)
  }

  if (!response.ok) throw httpError(response.status, await readErrorDetail(response, apiKey), label)
  if (!response.body) throw new LLMError(`${label} sent an empty response.`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') return

        let data
        try {
          data = JSON.parse(payload)
        } catch {
          continue // Keep-alive or comment line
        }

        if (data.error) {
          const detail = data.error.message ?? data.error
          throw new LLMError(`${label} stopped with an error. ${redact(String(detail), apiKey).slice(0, 300)}`)
        }
        const content = data.choices?.[0]?.delta?.content
        if (content) yield content
      }
    }
  } catch (error) {
    throw connectionError(error, connection)
  } finally {
    reader.cancel().catch(() => {})
  }
}

/**
 * @returns one vector per input, in input order
 */
export async function embed(connection, { model, input }, { fetchImpl = fetch } = {}) {
  const { apiKey, label } = connection

  let response
  try {
    response = await fetchImpl(`${connection.baseUrl}/embeddings`, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS)
    })
  } catch (error) {
    throw connectionError(error, connection)
  }

  if (response.status === 404 || response.status === 405) {
    throw new LLMError(`${label} doesn't offer an embeddings API.`, response.status)
  }
  if (!response.ok) throw httpError(response.status, await readErrorDetail(response, apiKey), label)

  const payload = await response.json().catch(() => null)
  if (!Array.isArray(payload?.data) || payload.data.length !== input.length) {
    throw new LLMError(`${label} returned an unexpected embeddings response.`)
  }
  return [...payload.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding)
}
