import Database from 'better-sqlite3'
import path from 'path'
import { app, dialog } from 'electron'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CHARACTER_SELECT = `
  id, name, tagline, description, system_prompt as systemPrompt, greeting, avatar,
  personality, scenario, message_example as messageExample,
  alternate_greetings as alternateGreetingsRaw, post_history as postHistory,
  creator, creator_notes as creatorNotes, character_version as characterVersion,
  tags as tagsRaw, favorite, card_extras as cardExtras,
  memory_enabled as memoryEnabled, is_default as isDefault,
  created_at as createdAt, updated_at as updatedAt
`

const MESSAGE_SELECT = `
  id, role, content, timestamp, character_id as characterId,
  target_character_id as targetId, swipes as swipesRaw, swipe_index as swipeIndex
`

const parseStringList = (raw) => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed.map(String) : undefined
  } catch {
    return undefined
  }
}

const toCharacter = ({ alternateGreetingsRaw, tagsRaw, ...row }) => ({
  ...row,
  systemPrompt: row.systemPrompt || undefined,
  greeting: row.greeting || undefined,
  tagline: row.tagline || undefined,
  personality: row.personality || undefined,
  scenario: row.scenario || undefined,
  messageExample: row.messageExample || undefined,
  alternateGreetings: parseStringList(alternateGreetingsRaw),
  postHistory: row.postHistory || undefined,
  creator: row.creator || undefined,
  creatorNotes: row.creatorNotes || undefined,
  characterVersion: row.characterVersion || undefined,
  tags: parseStringList(tagsRaw),
  favorite: Boolean(row.favorite),
  cardExtras: row.cardExtras || undefined,
  memoryEnabled: row.memoryEnabled === null ? true : Boolean(row.memoryEnabled),
  isDefault: Boolean(row.isDefault)
})

const toMessage = ({ swipesRaw, ...row }) => ({
  ...row,
  timestamp: new Date(row.timestamp),
  characterId: row.characterId || undefined,
  targetId: row.targetId || undefined,
  swipes: parseStringList(swipesRaw),
  swipeIndex: row.swipeIndex ?? undefined
})

class DatabaseService {
  constructor() {
    this.db = null
    this.init()
  }

  init() {
    try {
      // Store database in user data directory
      const dbPath = path.join(app.getPath('userData'), 'chaichat.db')
      console.log('Initializing database at:', dbPath)
      
      // Create database with safer options
      this.db = new Database(dbPath, { 
        fileMustExist: false
      })
      
      // Test the database connection
      this.db.exec('SELECT 1')
      
      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')
      this.db.pragma('secure_delete = ON')
      
      this.createTables()
      console.log('Database initialized successfully at:', dbPath)
    } catch (error) {
      console.error('Failed to initialize database:', error)
      if (this.db) {
        try {
          this.db.close()
        } catch (closeError) {
          console.error('Error closing database:', closeError)
        }
        this.db = null
      }
      throw error
    }
  }

  createTables() {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        character_id TEXT,
        provider TEXT,
        selected_model TEXT,
        FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE SET NULL
      )
    `)

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `)

    // Create characters table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        avatar TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Ensure character_id column exists in sessions table (migration for older versions)
    const sessionColumns = this.db.prepare("PRAGMA table_info(sessions)").all();
    const hasCharacterId = sessionColumns.some(col => col.name === 'character_id');
    if (!hasCharacterId) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN character_id TEXT`);
    }

    // Ensure provider column exists in sessions table (migration for session provider/model persistence)
    const hasProvider = sessionColumns.some(col => col.name === 'provider');
    if (!hasProvider) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN provider TEXT`);
    }

    // Ensure selected_model column exists in sessions table (migration for session provider/model persistence)
    const hasSelectedModel = sessionColumns.some(col => col.name === 'selected_model');
    if (!hasSelectedModel) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN selected_model TEXT`);
    }

    // Ensure participant_ids column exists in sessions table (multi-character support)
    const hasParticipantIds = sessionColumns.some(col => col.name === 'participant_ids');
    if (!hasParticipantIds) {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN participant_ids TEXT`);
    }

    // Ensure character_id column exists in messages table (migration for multi-character support)
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all();
    const hasMessageCharacterId = messageColumns.some(col => col.name === 'character_id');
    if (!hasMessageCharacterId) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN character_id TEXT`);
    }

    // Ensure target_character_id column exists in messages table (multi-character support)
    const hasMessageTargetId = messageColumns.some(col => col.name === 'target_character_id');
    if (!hasMessageTargetId) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN target_character_id TEXT`);
    }

    // Character roleplay columns (migration for enhanced characters)
    const charColumns = this.db.prepare("PRAGMA table_info(characters)").all();
    const hasTagline = charColumns.some(col => col.name === 'tagline');
    if (!hasTagline) {
      this.db.exec(`ALTER TABLE characters ADD COLUMN tagline TEXT`);
    }
    const hasSystemPrompt = charColumns.some(col => col.name === 'system_prompt');
    if (!hasSystemPrompt) {
      this.db.exec(`ALTER TABLE characters ADD COLUMN system_prompt TEXT`);
    }
    const hasGreeting = charColumns.some(col => col.name === 'greeting');
    if (!hasGreeting) {
      this.db.exec(`ALTER TABLE characters ADD COLUMN greeting TEXT`);
    }
    const hasMemoryEnabled = charColumns.some(col => col.name === 'memory_enabled');
    if (!hasMemoryEnabled) {
      this.db.exec(`ALTER TABLE characters ADD COLUMN memory_enabled INTEGER DEFAULT 1`);
    }

    // Migrate characters table if legacy background column exists
    const hasBackground = charColumns.some(col => col.name === 'background');
    if (hasBackground) {
      console.log('Migrating characters table: removing background column');
      
      // Create new table
      this.db.exec(`
        CREATE TABLE characters_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          avatar TEXT,
          is_default INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Copy data
      this.db.exec(`
        INSERT INTO characters_new (id, name, description, avatar, is_default, created_at, updated_at)
        SELECT id, name, description, avatar, is_default, created_at, updated_at
        FROM characters
      `);
      
      // Drop old table
      this.db.exec('DROP TABLE characters');
      
      // Rename new table
      this.db.exec('ALTER TABLE characters_new RENAME TO characters');
      
      console.log('Migration completed');
    }

    this.ensureColumns('characters', {
      personality: 'TEXT',
      scenario: 'TEXT',
      message_example: 'TEXT',
      alternate_greetings: 'TEXT',
      post_history: 'TEXT',
      creator: 'TEXT',
      creator_notes: 'TEXT',
      character_version: 'TEXT',
      tags: 'TEXT',
      favorite: 'INTEGER DEFAULT 0',
      card_extras: 'TEXT'
    })
    this.ensureColumns('sessions', {
      summary: 'TEXT',
      summary_through_id: 'TEXT',
      author_note: 'TEXT',
      persona_id: 'TEXT'
    })
    this.ensureColumns('messages', {
      swipes: 'TEXT',
      swipe_index: 'INTEGER'
    })

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_character_id ON sessions (character_id);
      CREATE INDEX IF NOT EXISTS idx_characters_name ON characters (name);
      CREATE INDEX IF NOT EXISTS idx_characters_created_at ON characters (created_at);
      CREATE INDEX IF NOT EXISTS idx_characters_is_default ON characters (is_default);
    `)

    // Create settings table for system prompt and other settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create saved_scripts table for persisting Python scripts from LLM responses
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_scripts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'python',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_run_at TEXT,
        session_id TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE SET NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_saved_scripts_created_at ON saved_scripts (created_at);
      CREATE INDEX IF NOT EXISTS idx_saved_scripts_name ON saved_scripts (name);
    `)

    // Create character_memories table for per-character long-term memory
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS character_memories (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source_session_id TEXT,
        FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_character_memories_character_id ON character_memories (character_id);
      CREATE INDEX IF NOT EXISTS idx_character_memories_created_at ON character_memories (created_at);
    `)

    // Create llm_connections table. Keys are encrypted by the OS and never exposed over db: IPC.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_connections (
        id TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        default_model TEXT,
        api_key_encrypted BLOB,
        key_hint TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      )
    `)

    // Who the user plays as. The active one lives in settings, a chat can override it.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        avatar TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // One vector per message and embedding model, see vectors.js
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_embeddings (
        message_id TEXT NOT NULL,
        model_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        vector BLOB NOT NULL,
        PRIMARY KEY (message_id, model_key),
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_message_embeddings_session ON message_embeddings (session_id, model_key);
    `)

    // Initialize default characters if none exist
    this.initializeDefaultCharacters()
  }

  ensureColumns(table, columns) {
    const existing = new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map((col) => col.name))
    for (const [name, type] of Object.entries(columns)) {
      if (!existing.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
  }

  initializeDefaultCharacters() {
    try {
      const existingCharacters = this.db.prepare('SELECT COUNT(*) as count FROM characters').get()
      
      if (existingCharacters.count === 0) {
        console.log('Initializing default characters...')
        
        const defaultCharacters = [
          {
            id: crypto.randomUUID(),
            name: "Assistant",
            tagline: "A helpful AI assistant",
            description: "A helpful AI assistant ready to help with any questions",
            systemPrompt: "You are Assistant, a helpful, friendly and knowledgeable AI assistant. Answer questions clearly and accurately. Use markdown formatting when helpful.",
            greeting: "Hi! I'm your assistant. What can I help you with today?",
            isDefault: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            name: "Seraphina",
            tagline: "Mysterious elven sorceress",
            description: "An ancient elven sorceress from the Moonlit Forest. Wise, playful and a little mischievous, with centuries of stories to tell.",
            systemPrompt: `You are Seraphina, an ancient elven sorceress who has guarded the Moonlit Forest for over a thousand years.

Personality: wise but playful, curious about the modern world, speaks in an elegant yet warm manner, occasionally uses archaic phrasing, deeply loyal to those she trusts.

Background: You have seen empires rise and fall. You wield moonlight magic and speak with forest creatures. You are fascinated by technology and the modern world, which you find both delightful and strange.

Roleplay guidelines:
- Always stay fully in character as Seraphina
- Reference your long life and magical nature naturally in conversation
- Never mention being an AI or language model
- Keep responses conversational, vivid and engaging`,
            greeting: "*steps out from between silver-barked trees, moonlight catching in her hair* Ah... a visitor walks my forest after all these years. Come closer, traveler — tell me, what brings you to the Moonlit Woods?",
            isDefault: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            name: "Detective Rex Carter",
            tagline: "Hard-boiled 1940s private eye",
            description: "A noir private investigator from 1947 Los Angeles. Cynical exterior, honest heart, always one step behind trouble.",
            systemPrompt: `You are Detective Rex Carter, a private investigator working the mean streets of 1947 Los Angeles.

Personality: world-weary but principled, dry wit, speaks in clipped noir prose, observant, distrustful of authority, secretly sentimental.

Background: Ex-cop turned PI. You've seen it all — crooked politicians, femme fatales, dirty money. You drink black coffee and cheap whiskey, and you always get your man.

Roleplay guidelines:
- Always stay fully in character as Rex Carter
- Narrate your observations in classic noir style ("The rain hammered the window like it owed me money")
- Never mention being an AI or language model
- Keep responses atmospheric and engaging`,
            greeting: "The door creaked open. I didn't look up right away — in this town, rushing things gets you dead. *leans back in chair* Well, well. Sit down, pal. Tell me who's causing you trouble, and maybe I can lose some of mine.",
            isDefault: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            name: "Coding Mentor",
            tagline: "Patient senior developer",
            description: "An expert programmer who helps with coding questions and best practices",
            systemPrompt: "You are Codey, a patient and encouraging senior software developer with decades of experience across languages and paradigms. You explain concepts clearly with practical examples, review code constructively, and teach best practices without being condescending. Prefer simple, maintainable solutions over clever ones.",
            greeting: "Hey! Ready to write some good code together? What are we working on?",
            isDefault: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            name: "Creative Writer",
            tagline: "Imaginative storyteller",
            description: "A creative writing assistant for stories, poems, and imaginative content",
            systemPrompt: "You are Muse, a creative writing companion bursting with imagination. You help brainstorm ideas, draft stories and poems, develop characters, and refine prose. You suggest vivid imagery, interesting narrative structures, and you're never afraid of a bold creative choice.",
            greeting: "Ooh, a blank page! My favorite kind of adventure. What shall we create together?",
            isDefault: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]

        const stmt = this.db.prepare(`
          INSERT INTO characters (id, name, tagline, description, system_prompt, greeting, memory_enabled, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const character of defaultCharacters) {
          stmt.run(
            character.id,
            character.name,
            character.tagline || null,
            character.description,
            character.systemPrompt || null,
            character.greeting || null,
            1,
            character.isDefault,
            character.createdAt,
            character.updatedAt
          )
        }

        console.log(`Created ${defaultCharacters.length} default characters`)
      }
    } catch (error) {
      console.error('Error initializing default characters:', error)
    }
  }

  // Session operations
  createSession(session) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, character_id, participant_ids, provider, selected_model,
                            summary, summary_through_id, author_note, persona_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    try {
      stmt.run(
        session.id, 
        session.title, 
        session.createdAt, 
        new Date().toISOString(), 
        session.characterId || null,
        session.participantIds ? JSON.stringify(session.participantIds) : null,
        session.provider || null,
        session.selectedModel || null,
        session.summary || null,
        session.summaryThroughId || null,
        session.authorNote || null,
        session.personaId || null
      )

      // Insert messages for this session
      if (session.messages && session.messages.length > 0) {
        this.addMessages(session.id, session.messages)
      }
      
      return session.id
    } catch (error) {
      console.error('Error creating session:', error)
      throw error
    }
  }

  parseParticipantIds(raw) {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined
    } catch {
      return undefined
    }
  }

  toSession(row, messages) {
    return {
      ...row,
      participantIdsRaw: undefined,
      characterId: row.characterId || undefined,
      participantIds: this.parseParticipantIds(row.participantIdsRaw),
      provider: row.provider || undefined,
      selectedModel: row.selectedModel || undefined,
      summary: row.summary || undefined,
      summaryThroughId: row.summaryThroughId || undefined,
      authorNote: row.authorNote || undefined,
      personaId: row.personaId || undefined,
      messages
    }
  }

  getAllSessions() {
    try {
      const sessionsStmt = this.db.prepare(`
        SELECT id, title, created_at as createdAt, updated_at as updatedAt, 
               character_id as characterId, participant_ids as participantIdsRaw,
               provider, selected_model as selectedModel,
               summary, summary_through_id as summaryThroughId,
               author_note as authorNote, persona_id as personaId
        FROM sessions
        ORDER BY updated_at DESC
      `)
      
      const sessions = sessionsStmt.all()
      
      // Get messages for each session (include character_id/target for multi-character support)
      const messagesStmt = this.db.prepare(`
        SELECT ${MESSAGE_SELECT}
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `)

      return sessions.map(session => this.toSession(session, messagesStmt.all(session.id).map(toMessage)))
    } catch (error) {
      console.error('Error getting sessions:', error)
      throw error
    }
  }

  getSession(sessionId) {
    try {
      const sessionStmt = this.db.prepare(`
        SELECT id, title, created_at as createdAt, updated_at as updatedAt, 
               character_id as characterId, participant_ids as participantIdsRaw,
               provider, selected_model as selectedModel,
               summary, summary_through_id as summaryThroughId,
               author_note as authorNote, persona_id as personaId
        FROM sessions
        WHERE id = ?
      `)
      
      const session = sessionStmt.get(sessionId)
      if (!session) return null
      
      const messagesStmt = this.db.prepare(`
        SELECT ${MESSAGE_SELECT}
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `)

      return this.toSession(session, messagesStmt.all(sessionId).map(toMessage))
    } catch (error) {
      console.error('Error getting session:', error)
      throw error
    }
  }

  updateSession(sessionId, updates) {
    try {
      const fields = []
      const values = []
      
      if (updates.title !== undefined) {
        fields.push('title = ?')
        values.push(updates.title)
      }
      
      if (updates.characterId !== undefined) {
        fields.push('character_id = ?')
        values.push(updates.characterId || null)
      }
      
      if (updates.participantIds !== undefined) {
        fields.push('participant_ids = ?')
        values.push(JSON.stringify(updates.participantIds))
      }
      
      if (updates.provider !== undefined) {
        fields.push('provider = ?')
        values.push(updates.provider)
      }
      
      if (updates.selectedModel !== undefined) {
        fields.push('selected_model = ?')
        values.push(updates.selectedModel)
      }

      if (updates.summary !== undefined) {
        fields.push('summary = ?')
        values.push(updates.summary)
      }

      if (updates.summaryThroughId !== undefined) {
        fields.push('summary_through_id = ?')
        values.push(updates.summaryThroughId)
      }

      if (updates.authorNote !== undefined) {
        fields.push('author_note = ?')
        values.push(updates.authorNote)
      }

      if (updates.personaId !== undefined) {
        fields.push('persona_id = ?')
        values.push(updates.personaId)
      }

      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(sessionId)
      
      const stmt = this.db.prepare(`
        UPDATE sessions
        SET ${fields.join(', ')}
        WHERE id = ?
      `)
      
      return stmt.run(...values).changes > 0
    } catch (error) {
      console.error('Error updating session:', error)
      throw error
    }
  }

  deleteSession(sessionId) {
    try {
      // Messages will be deleted automatically due to CASCADE
      const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?')
      return stmt.run(sessionId).changes > 0
    } catch (error) {
      console.error('Error deleting session:', error)
      throw error
    }
  }

  duplicateSession(sessionId, newSessionId, newTitle) {
    try {
      const session = this.getSession(sessionId)
      if (!session) return null
      
      const newSession = {
        id: newSessionId,
        title: newTitle,
        createdAt: new Date().toISOString(),
        // Preserve the cast of characters on duplicate
        characterId: session.characterId || null,
        participantIds: session.participantIds || (session.characterId ? [session.characterId] : undefined),
        summary: session.summary,
        authorNote: session.authorNote,
        personaId: session.personaId,
        // Message ids are primary keys, so the copy needs its own
        messages: session.messages.map((message) => ({ ...message, id: crypto.randomUUID() }))
      }
      if (session.summaryThroughId) {
        const index = session.messages.findIndex((message) => message.id === session.summaryThroughId)
        if (index !== -1) newSession.summaryThroughId = newSession.messages[index].id
      }
      
      this.createSession(newSession)
      return newSession
    } catch (error) {
      console.error('Error duplicating session:', error)
      throw error
    }
  }

  // Message operations
  addMessages(sessionId, messages) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO messages (id, session_id, role, content, timestamp, character_id, target_character_id, swipes, swipe_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      const transaction = this.db.transaction((msgs) => {
        for (const message of msgs) {
          stmt.run(
            message.id,
            sessionId,
            message.role,
            message.content,
            new Date(message.timestamp).toISOString(),
            message.characterId || null,
            message.targetId || null,
            message.swipes?.length ? JSON.stringify(message.swipes) : null,
            message.swipeIndex ?? null
          )
        }
      })
      
      transaction(messages)
    } catch (error) {
      console.error('Error adding messages:', error)
      throw error
    }
  }

  updateMessage(messageId, updates) {
    try {
      const fields = []
      const values = []
      
      if (updates.content !== undefined) {
        fields.push('content = ?')
        values.push(updates.content)
      }
      
      if (updates.timestamp !== undefined) {
        fields.push('timestamp = ?')
        values.push(updates.timestamp.toISOString())
      }
      
      if (updates.characterId !== undefined) {
        fields.push('character_id = ?')
        values.push(updates.characterId || null)
      }

      if (updates.targetId !== undefined) {
        fields.push('target_character_id = ?')
        values.push(updates.targetId)
      }

      if (updates.swipes !== undefined) {
        fields.push('swipes = ?')
        values.push(updates.swipes?.length ? JSON.stringify(updates.swipes) : null)
      }

      if (updates.swipeIndex !== undefined) {
        fields.push('swipe_index = ?')
        values.push(updates.swipeIndex)
      }

      if (fields.length === 0) return false
      
      values.push(messageId)
      
      const stmt = this.db.prepare(`
        UPDATE messages
        SET ${fields.join(', ')}
        WHERE id = ?
      `)
      
      return stmt.run(...values).changes > 0
    } catch (error) {
      console.error('Error updating message:', error)
      throw error
    }
  }

  deleteMessages(messageIds) {
    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) return 0
      const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?')
      const transaction = this.db.transaction((ids) => {
        for (const id of ids) stmt.run(id)
      })
      transaction(messageIds)
      return messageIds.length
    } catch (error) {
      console.error('Error deleting messages:', error)
      throw error
    }
  }

  // Search operations
  searchMessages(query) {
    try {
      const stmt = this.db.prepare(`
        SELECT m.id, m.role, m.content, m.timestamp, m.session_id, m.character_id,
               s.title as session_title
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE m.content LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT 100
      `)
      
      const results = stmt.all(`%${query}%`)
      return results.map(result => ({
        sessionId: result.session_id,
        message: {
          id: result.id,
          role: result.role,
          content: result.content,
          timestamp: new Date(result.timestamp),
          characterId: result.character_id || undefined
        },
        sessionTitle: result.session_title
      }))
    } catch (error) {
      console.error('Error searching messages:', error)
      throw error
    }
  }

  // Settings operations
  getSetting(key) {
    try {
      const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
      const result = stmt.get(key)
      return result ? result.value : null
    } catch (error) {
      console.error('Error getting setting:', error)
      throw error
    }
  }

  setSetting(key, value) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `)
      stmt.run(key, value, new Date().toISOString())
    } catch (error) {
      console.error('Error setting value:', error)
      throw error
    }
  }

  // LLM connection operations
  getLlmConnections() {
    try {
      return this.db.prepare(`
        SELECT id, preset_id as presetId, name, base_url as baseUrl, default_model as defaultModel,
               api_key_encrypted as apiKeyEncrypted, key_hint as keyHint,
               created_at as createdAt, last_used_at as lastUsedAt
        FROM llm_connections
        ORDER BY COALESCE(last_used_at, created_at) DESC
      `).all()
    } catch (error) {
      console.error('Error getting LLM connections:', error)
      throw error
    }
  }

  getLlmConnection(id) {
    try {
      return this.db.prepare(`
        SELECT id, preset_id as presetId, name, base_url as baseUrl, default_model as defaultModel,
               api_key_encrypted as apiKeyEncrypted, key_hint as keyHint,
               created_at as createdAt, last_used_at as lastUsedAt
        FROM llm_connections
        WHERE id = ?
      `).get(id) ?? null
    } catch (error) {
      console.error('Error getting LLM connection:', error)
      throw error
    }
  }

  saveLlmConnection(connection) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO llm_connections
          (id, preset_id, name, base_url, default_model, api_key_encrypted, key_hint, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        connection.id,
        connection.presetId,
        connection.name,
        connection.baseUrl,
        connection.defaultModel || null,
        connection.apiKeyEncrypted || null,
        connection.keyHint || null,
        connection.createdAt,
        connection.lastUsedAt || null
      )
    } catch (error) {
      console.error('Error saving LLM connection:', error)
      throw error
    }
  }

  deleteLlmConnection(id) {
    try {
      return this.db.prepare('DELETE FROM llm_connections WHERE id = ?').run(id).changes > 0
    } catch (error) {
      console.error('Error deleting LLM connection:', error)
      throw error
    }
  }

  touchLlmConnection(id, usedAt) {
    try {
      this.db.prepare('UPDATE llm_connections SET last_used_at = ? WHERE id = ?').run(usedAt, id)
    } catch (error) {
      console.error('Error updating LLM connection:', error)
      throw error
    }
  }

  clearLlmConnectionKeys() {
    try {
      this.db.prepare('UPDATE llm_connections SET api_key_encrypted = NULL, key_hint = NULL').run()
      // The WAL can still hold the old ciphertext until checkpointed
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (error) {
      console.error('Error clearing LLM connection keys:', error)
      throw error
    }
  }

  getSessionProviders() {
    try {
      return this.db.prepare('SELECT DISTINCT provider FROM sessions WHERE provider IS NOT NULL')
        .all()
        .map((row) => row.provider)
    } catch (error) {
      console.error('Error getting session providers:', error)
      throw error
    }
  }

  // Character operations
  createCharacter(character) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO characters (id, name, tagline, description, system_prompt, greeting, avatar, memory_enabled, is_default, created_at, updated_at,
                                personality, scenario, message_example, alternate_greetings, post_history,
                                creator, creator_notes, character_version, tags, favorite, card_extras)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        character.id,
        character.name,
        character.tagline || null,
        character.description,
        character.systemPrompt || null,
        character.greeting || null,
        character.avatar || null,
        character.memoryEnabled === false ? 0 : 1,
        character.isDefault ? 1 : 0,
        character.createdAt,
        character.updatedAt,
        character.personality || null,
        character.scenario || null,
        character.messageExample || null,
        character.alternateGreetings?.length ? JSON.stringify(character.alternateGreetings) : null,
        character.postHistory || null,
        character.creator || null,
        character.creatorNotes || null,
        character.characterVersion || null,
        character.tags?.length ? JSON.stringify(character.tags) : null,
        character.favorite ? 1 : 0,
        character.cardExtras || null
      )

      return character.id
    } catch (error) {
      console.error('Error creating character:', error)
      throw error
    }
  }

  getAllCharacters() {
    try {
      const stmt = this.db.prepare(`
        SELECT ${CHARACTER_SELECT}
        FROM characters
        ORDER BY is_default DESC, name ASC
      `)

      return stmt.all().map(toCharacter)
    } catch (error) {
      console.error('Error getting characters:', error)
      throw error
    }
  }

  getCharacter(characterId) {
    try {
      const stmt = this.db.prepare(`
        SELECT ${CHARACTER_SELECT}
        FROM characters
        WHERE id = ?
      `)
      
      const character = stmt.get(characterId)
      return character ? toCharacter(character) : null
    } catch (error) {
      console.error('Error getting character:', error)
      throw error
    }
  }

  updateCharacter(characterId, updates) {
    try {
      const fields = []
      const values = []
      
      if (updates.name !== undefined) {
        fields.push('name = ?')
        values.push(updates.name)
      }
      if (updates.tagline !== undefined) {
        fields.push('tagline = ?')
        values.push(updates.tagline)
      }
      if (updates.description !== undefined) {
        fields.push('description = ?')
        values.push(updates.description)
      }
      if (updates.systemPrompt !== undefined) {
        fields.push('system_prompt = ?')
        values.push(updates.systemPrompt)
      }
      if (updates.greeting !== undefined) {
        fields.push('greeting = ?')
        values.push(updates.greeting)
      }
      if (updates.avatar !== undefined) {
        fields.push('avatar = ?')
        values.push(updates.avatar)
      }
      if (updates.memoryEnabled !== undefined) {
        fields.push('memory_enabled = ?')
        values.push(updates.memoryEnabled ? 1 : 0)
      }
      if (updates.isDefault !== undefined) {
        fields.push('is_default = ?')
        values.push(updates.isDefault ? 1 : 0)
      }
      if (updates.favorite !== undefined) {
        fields.push('favorite = ?')
        values.push(updates.favorite ? 1 : 0)
      }
      for (const [key, column] of [
        ['personality', 'personality'],
        ['scenario', 'scenario'],
        ['messageExample', 'message_example'],
        ['postHistory', 'post_history'],
        ['creator', 'creator'],
        ['creatorNotes', 'creator_notes'],
        ['characterVersion', 'character_version'],
        ['cardExtras', 'card_extras']
      ]) {
        if (updates[key] !== undefined) {
          fields.push(`${column} = ?`)
          values.push(updates[key])
        }
      }
      for (const [key, column] of [
        ['alternateGreetings', 'alternate_greetings'],
        ['tags', 'tags']
      ]) {
        if (updates[key] !== undefined) {
          fields.push(`${column} = ?`)
          values.push(updates[key]?.length ? JSON.stringify(updates[key]) : null)
        }
      }

      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(characterId)
      
      const stmt = this.db.prepare(`
        UPDATE characters
        SET ${fields.join(', ')}
        WHERE id = ?
      `)
      
      return stmt.run(...values).changes > 0
    } catch (error) {
      console.error('Error updating character:', error)
      throw error
    }
  }

  deleteCharacter(characterId) {
    try {
      // First, update any sessions that reference this character
      const updateSessionsStmt = this.db.prepare('UPDATE sessions SET character_id = NULL WHERE character_id = ?')
      updateSessionsStmt.run(characterId)

      // Clean up participant lists that include this character
      const sessionsWithParticipant = this.db.prepare('SELECT id, participant_ids FROM sessions WHERE participant_ids LIKE ?').all(`%${characterId}%`)
      for (const s of sessionsWithParticipant) {
        const ids = this.parseParticipantIds(s.participant_ids)
        if (ids && ids.includes(characterId)) {
          const remaining = ids.filter(id => id !== characterId)
          const updateStmt = this.db.prepare('UPDATE sessions SET participant_ids = ?, character_id = COALESCE(NULLIF(?, \'\'), character_id) WHERE id = ?')
          updateStmt.run(
            remaining.length > 0 ? JSON.stringify(remaining) : null,
            remaining[0] || '',
            s.id
          )
        }
      }

      // Delete the character's memories
      this.db.prepare('DELETE FROM character_memories WHERE character_id = ?').run(characterId)
      
      // Then delete the character
      const stmt = this.db.prepare('DELETE FROM characters WHERE id = ?')
      return stmt.run(characterId).changes > 0
    } catch (error) {
      console.error('Error deleting character:', error)
      throw error
    }
  }

  searchCharacters(query) {
    try {
      const stmt = this.db.prepare(`
        SELECT ${CHARACTER_SELECT}
        FROM characters
        WHERE name LIKE ? OR description LIKE ? OR IFNULL(tagline, '') LIKE ?
        ORDER BY is_default DESC, name ASC
      `)
      
      const searchTerm = `%${query}%`
      return stmt.all(searchTerm, searchTerm, searchTerm).map(toCharacter)
    } catch (error) {
      console.error('Error searching characters:', error)
      throw error
    }
  }

  // Character memory operations
  createMemory(memory) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO character_memories (id, character_id, content, created_at, updated_at, source_session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        memory.id,
        memory.characterId,
        memory.content,
        memory.createdAt,
        memory.updatedAt || memory.createdAt,
        memory.sourceSessionId || null
      )
      return memory.id
    } catch (error) {
      console.error('Error creating memory:', error)
      throw error
    }
  }

  getMemoriesForCharacter(characterId) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, character_id as characterId, content,
               created_at as createdAt, updated_at as updatedAt,
               source_session_id as sourceSessionId
        FROM character_memories
        WHERE character_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `)
      return stmt.all(characterId)
    } catch (error) {
      console.error('Error getting memories:', error)
      throw error
    }
  }

  getAllMemories() {
    try {
      const stmt = this.db.prepare(`
        SELECT id, character_id as characterId, content,
               created_at as createdAt, updated_at as updatedAt,
               source_session_id as sourceSessionId
        FROM character_memories
        ORDER BY created_at DESC
      `)
      return stmt.all()
    } catch (error) {
      console.error('Error getting all memories:', error)
      throw error
    }
  }

  deleteMemory(memoryId) {
    try {
      const stmt = this.db.prepare('DELETE FROM character_memories WHERE id = ?')
      return stmt.run(memoryId).changes > 0
    } catch (error) {
      console.error('Error deleting memory:', error)
      throw error
    }
  }

  updateMemory(memoryId, updates) {
    try {
      const fields = []
      const values = []

      if (updates.content !== undefined) {
        fields.push('content = ?')
        values.push(updates.content)
      }

      if (fields.length === 0) return false

      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(memoryId)

      const stmt = this.db.prepare(`UPDATE character_memories SET ${fields.join(', ')} WHERE id = ?`)
      return stmt.run(...values).changes > 0
    } catch (error) {
      console.error('Error updating memory:', error)
      throw error
    }
  }

  // Persona operations
  getAllPersonas() {
    try {
      return this.db.prepare(`
        SELECT id, name, description, avatar, created_at as createdAt, updated_at as updatedAt
        FROM personas
        ORDER BY created_at ASC
      `).all().map((persona) => ({
        ...persona,
        description: persona.description || '',
        avatar: persona.avatar || undefined
      }))
    } catch (error) {
      console.error('Error getting personas:', error)
      throw error
    }
  }

  savePersona(persona) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO personas (id, name, description, avatar, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        persona.id,
        persona.name,
        persona.description || null,
        persona.avatar || null,
        persona.createdAt,
        new Date().toISOString()
      )
      return persona.id
    } catch (error) {
      console.error('Error saving persona:', error)
      throw error
    }
  }

  deletePersona(personaId) {
    try {
      this.db.prepare('UPDATE sessions SET persona_id = NULL WHERE persona_id = ?').run(personaId)
      return this.db.prepare('DELETE FROM personas WHERE id = ?').run(personaId).changes > 0
    } catch (error) {
      console.error('Error deleting persona:', error)
      throw error
    }
  }

  // Export/Import operations
  exportSessions() {
    try {
      const sessions = this.getAllSessions()
      return {
        version: '1.1',
        exportDate: new Date().toISOString(),
        sessions: sessions,
        characters: this.getAllCharacters(),
        memories: this.getAllMemories(),
        personas: this.getAllPersonas()
      }
    } catch (error) {
      console.error('Error exporting sessions:', error)
      throw error
    }
  }

  importSessions(data) {
    try {
      if (!data.sessions || !Array.isArray(data.sessions)) {
        throw new Error('Invalid import data format')
      }

      let importedCount = 0
      const transaction = this.db.transaction(() => {
        // Import characters first so references resolve
        if (Array.isArray(data.characters)) {
          for (const character of data.characters) {
            const existing = this.getCharacter(character.id)
            if (!existing) {
              this.createCharacter(character)
            }
          }
        }

        if (Array.isArray(data.personas)) {
          const known = new Set(this.getAllPersonas().map((persona) => persona.id))
          for (const persona of data.personas) {
            if (!known.has(persona.id)) this.savePersona(persona)
          }
        }

        // Import memories
        if (Array.isArray(data.memories)) {
          for (const memory of data.memories) {
            const exists = this.db.prepare('SELECT 1 FROM character_memories WHERE id = ?').get(memory.id)
            if (!exists && this.getCharacter(memory.characterId)) {
              this.createMemory(memory)
            }
          }
        }

        for (const session of data.sessions) {
          // Check if session already exists
          const existing = this.getSession(session.id)
          if (!existing) {
            this.createSession(session)
            importedCount++
          }
        }
      })

      transaction()
      return importedCount
    } catch (error) {
      console.error('Error importing sessions:', error)
      throw error
    }
  }

  async exportToFile() {
    try {
      const data = this.exportSessions();
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `chaichat-export-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (!canceled && filePath) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch (error) {
      console.error('Error exporting to file:', error);
      throw error;
    }
  }

  async importFromFile() {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (!canceled && filePaths?.[0]) {
        const content = await fs.readFile(filePaths[0], 'utf8');
        const data = JSON.parse(content);
        return this.importSessions(data);
      }
      return 0;
    } catch (error) {
      console.error('Error importing from file:', error);
      throw error;
    }
  }

  // Saved script operations
  createSavedScript(script) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO saved_scripts (id, name, code, language, created_at, updated_at, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        script.id,
        script.name,
        script.code,
        script.language || 'python',
        script.createdAt,
        script.updatedAt || script.createdAt,
        script.sessionId || null
      )
      return script.id
    } catch (error) {
      console.error('Error creating saved script:', error)
      throw error
    }
  }

  getAllSavedScripts() {
    try {
      const stmt = this.db.prepare(`
        SELECT id, name, code, language, created_at as createdAt, updated_at as updatedAt,
               last_run_at as lastRunAt, session_id as sessionId
        FROM saved_scripts
        ORDER BY updated_at DESC
      `)
      return stmt.all()
    } catch (error) {
      console.error('Error getting saved scripts:', error)
      throw error
    }
  }

  updateSavedScript(scriptId, updates) {
    try {
      const fields = []
      const values = []

      if (updates.name !== undefined) {
        fields.push('name = ?')
        values.push(updates.name)
      }
      if (updates.code !== undefined) {
        fields.push('code = ?')
        values.push(updates.code)
      }
      if (updates.lastRunAt !== undefined) {
        fields.push('last_run_at = ?')
        values.push(updates.lastRunAt)
      }

      fields.push('updated_at = ?')
      values.push(new Date().toISOString())
      values.push(scriptId)

      const stmt = this.db.prepare(`
        UPDATE saved_scripts
        SET ${fields.join(', ')}
        WHERE id = ?
      `)
      return stmt.run(...values).changes > 0
    } catch (error) {
      console.error('Error updating saved script:', error)
      throw error
    }
  }

  deleteSavedScript(scriptId) {
    try {
      const stmt = this.db.prepare('DELETE FROM saved_scripts WHERE id = ?')
      return stmt.run(scriptId).changes > 0
    } catch (error) {
      console.error('Error deleting saved script:', error)
      throw error
    }
  }

  close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export default DatabaseService 

// Only run this block if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const { default: DatabaseService } = await import('./database.js');
      const dbService = new DatabaseService();
      dbService.init();
      dbService.createTables();
      // Test: create a session
      const testSession = {
        id: 'test-session',
        title: 'Test Session',
        createdAt: new Date().toISOString(),
        messages: [],
        characterId: undefined
      };
      await dbService.createSession(testSession);
      const sessions = await dbService.getAllSessions();
      console.log('Sessions in DB:', sessions);
      await dbService.deleteSession('test-session');
      console.log('Test session deleted.');
      console.log('SQLite DB test completed successfully.');
    } catch (err) {
      console.error('SQLite DB test failed:', err);
    }
  })();
} 