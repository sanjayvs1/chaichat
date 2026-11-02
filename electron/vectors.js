import crypto from 'crypto'

// Semantic recall over chat history. Messages are embedded once, keyed by a hash of their
// text so edits re-embed, and searched with a plain cosine scan: a chat holds thousands of
// messages at most, which needs no index.

const BUILTIN_DIMENSIONS = 512
const BATCH_SIZE = 32
// Long messages are embedded by their opening, which is what most models keep anyway
const MAX_EMBED_CHARS = 2000
// Scores of the two kinds of vector aren't comparable, the hashed ones run much lower
const MIN_SCORE = { builtin: 0.12, model: 0.3 }

const STOP_WORDS = new Set(
  `a an and are as at be but by for from had has have he her his i if in into is it its me my
  no not of on or our she so that the their them then there they this to us was we were what
  when which who will with you your`.split(/\s+/)
)

const isBuiltin = (source) => !source?.connectionId || !source?.model
const modelKeyOf = (source) => (isBuiltin(source) ? 'builtin:hash-v1' : `${source.connectionId}:${source.model}`)
const hashContent = (text) => crypto.createHash('sha1').update(text).digest('hex')

function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, (suffix) => (word.length - suffix.length >= 3 ? '' : suffix))
}

/**
 * Hashed bag of words and word pairs. It finds matching vocabulary rather than matching
 * meaning, but it needs no server or model download, so recall works out of the box.
 */
export function hashEmbedding(text) {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem)

  const weights = new Map()
  const add = (token, weight) => weights.set(token, (weights.get(token) ?? 0) + weight)
  words.forEach((word, i) => {
    add(word, 1)
    if (i > 0) add(`${words[i - 1]} ${word}`, 0.5)
  })

  const vector = new Float32Array(BUILTIN_DIMENSIONS)
  for (const [token, weight] of weights) {
    const hash = fnv1a(token)
    // Logarithmic, so a phrase repeated all through a message can't outweigh a rare word
    const damped = 1 + Math.log(1 + weight)
    vector[hash % BUILTIN_DIMENSIONS] += hash & 0x80000000 ? -damped : damped
  }
  return Array.from(vector)
}

function normalize(values) {
  const vector = Float32Array.from(values)
  let length = 0
  for (const value of vector) length += value * value
  length = Math.sqrt(length)
  if (length > 0) for (let i = 0; i < vector.length; i++) vector[i] /= length
  return vector
}

function dotProduct(a, b) {
  let total = 0
  for (let i = 0; i < a.length; i++) total += a[i] * b[i]
  return total
}

const toBlob = (vector) => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
const fromBlob = (blob) =>
  new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))

const textOf = (content) => content.slice(0, MAX_EMBED_CHARS)

export class VectorStore {
  constructor({ db, connections }) {
    this.db = db
    this.connections = connections
  }

  async embedAll(source, texts) {
    if (isBuiltin(source)) return texts.map(hashEmbedding)

    const vectors = []
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.connections.embed(source.connectionId, source.model, texts.slice(start, start + BATCH_SIZE))))
    }
    return vectors
  }

  /** Embeds whatever is new or changed. Messages not yet saved are picked up on the next sync. */
  async sync({ sessionId, messages, source }) {
    const modelKey = modelKeyOf(source)
    const known = new Map(
      this.db
        .prepare('SELECT message_id as id, content_hash as hash FROM message_embeddings WHERE session_id = ? AND model_key = ?')
        .all(sessionId, modelKey)
        .map((row) => [row.id, row.hash])
    )
    const exists = this.db.prepare('SELECT 1 FROM messages WHERE id = ?')

    const pending = messages
      .filter((message) => message.content.trim())
      .map((message) => ({ id: message.id, text: textOf(message.content) }))
      .map((message) => ({ ...message, hash: hashContent(message.text) }))
      .filter((message) => known.get(message.id) !== message.hash && exists.get(message.id))

    if (pending.length > 0) {
      const vectors = await this.embedAll(source, pending.map((message) => message.text))
      const upsert = this.db.prepare(`
        INSERT OR REPLACE INTO message_embeddings (message_id, model_key, session_id, content_hash, vector)
        VALUES (?, ?, ?, ?, ?)
      `)
      this.db.transaction(() => {
        pending.forEach((message, i) => {
          upsert.run(message.id, modelKey, sessionId, message.hash, toBlob(normalize(vectors[i])))
        })
      })()
    }
    return { embedded: pending.length }
  }

  /**
   * @param scope 'chat' searches this chat, 'character' every chat with characterId
   * @param excludeIds messages already in the prompt
   */
  async query({ sessionId, characterId, scope, text, topK, excludeIds = [], source }) {
    const modelKey = modelKeyOf(source)
    const [queryVector] = await this.embedAll(source, [textOf(text)])
    const needle = normalize(queryVector)

    const rows =
      scope === 'character' && characterId
        ? this.db
            .prepare(`
              SELECT e.message_id as id, e.vector, e.session_id as sessionId
              FROM message_embeddings e
              JOIN sessions s ON s.id = e.session_id
              WHERE e.model_key = ? AND (e.session_id = ? OR s.character_id = ? OR s.participant_ids LIKE ?)
            `)
            .all(modelKey, sessionId, characterId, `%${characterId}%`)
        : this.db
            .prepare('SELECT message_id as id, vector, session_id as sessionId FROM message_embeddings WHERE model_key = ? AND session_id = ?')
            .all(modelKey, sessionId)

    const excluded = new Set(excludeIds)
    const minScore = isBuiltin(source) ? MIN_SCORE.builtin : MIN_SCORE.model
    const matches = rows
      .filter((row) => !excluded.has(row.id))
      .map((row) => {
        const vector = fromBlob(row.vector)
        // A model swap under the same name can change the dimensions
        return { ...row, score: vector.length === needle.length ? dotProduct(vector, needle) : -1 }
      })
      .filter((row) => row.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    const lookup = this.db.prepare(`
      SELECT id, role, content, timestamp, character_id as characterId
      FROM messages
      WHERE id = ?
    `)
    return matches
      .map((match) => {
        const message = lookup.get(match.id)
        return message && { ...message, score: match.score, sessionId: match.sessionId }
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  stats(sessionId, source) {
    return this.db
      .prepare('SELECT COUNT(*) as count FROM message_embeddings WHERE session_id = ? AND model_key = ?')
      .get(sessionId, modelKeyOf(source)).count
  }

  purge(sessionId) {
    return this.db.prepare('DELETE FROM message_embeddings WHERE session_id = ?').run(sessionId).changes
  }
}

export function registerVectorIpc(ipcMain, store) {
  const guarded = (work) => async (event, ...args) => {
    try {
      return { ok: true, ...(await work(...args)) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong' }
    }
  }

  ipcMain.handle('vectors:sync', guarded((request) => store.sync(request)))
  ipcMain.handle('vectors:query', guarded(async (request) => ({ matches: await store.query(request) })))
  ipcMain.handle('vectors:stats', guarded((sessionId, source) => ({ count: store.stats(sessionId, source) })))
  ipcMain.handle('vectors:purge', guarded((sessionId) => ({ removed: store.purge(sessionId) })))
}
