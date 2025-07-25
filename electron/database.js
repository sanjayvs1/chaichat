import Database from 'better-sqlite3'
import path from 'path'
import { app, dialog } from 'electron'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

    // Ensure character_id column exists in messages table (migration for multi-character support)
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all();
    const hasMessageCharacterId = messageColumns.some(col => col.name === 'character_id');
    if (!hasMessageCharacterId) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN character_id TEXT`);
    }

    // Migrate characters table if background column exists
    const charColumns = this.db.prepare("PRAGMA table_info(characters)").all();
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
  }

  // Session operations
  createSession(session) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, character_id)
      VALUES (?, ?, ?, ?, ?)
    `)
    
    try {
      stmt.run(session.id, session.title, session.createdAt, new Date().toISOString(), session.characterId || null)
      
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

  getAllSessions() {
    try {
      const sessionsStmt = this.db.prepare(`
        SELECT id, title, created_at as createdAt, updated_at as updatedAt, character_id as characterId
        FROM sessions
        ORDER BY created_at DESC
      `)
      
      const sessions = sessionsStmt.all()
      
      // Get messages for each session
      const messagesStmt = this.db.prepare(`
        SELECT id, role, content, timestamp
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `)
      
      return sessions.map(session => ({
        ...session,
        characterId: session.characterId || undefined,
        messages: messagesStmt.all(session.id).map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }))
    } catch (error) {
      console.error('Error getting sessions:', error)
      throw error
    }
  }

  getSession(sessionId) {
    try {
      const sessionStmt = this.db.prepare(`
        SELECT id, title, created_at as createdAt, updated_at as updatedAt, character_id as characterId
        FROM sessions
        WHERE id = ?
      `)
      
      const session = sessionStmt.get(sessionId)
      if (!session) return null
      
      const messagesStmt = this.db.prepare(`
        SELECT id, role, content, timestamp, character_id as characterId
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `)
      
      const messages = messagesStmt.all(sessionId).map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
        characterId: msg.characterId || undefined
      }))
      
      return { 
        ...session, 
        characterId: session.characterId || undefined,
        messages 
      }
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
        values.push(updates.characterId)
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
        messages: session.messages
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
        INSERT OR IGNORE INTO messages (id, session_id, role, content, timestamp, character_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      
      const transaction = this.db.transaction((msgs) => {
        for (const message of msgs) {
          stmt.run(
            message.id,
            sessionId,
            message.role,
            message.content,
            message.timestamp.toISOString(),
            message.characterId || null
          )
        }
      })
      
      transaction(messages)
    } catch (error) {
      console.error('Error adding messages:', error)
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

  // Character operations
  createCharacter(character) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO characters (id, name, description, avatar, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      
      stmt.run(
        character.id,
        character.name,
        character.description,
        character.avatar || null,
        character.isDefault ? 1 : 0,
        character.createdAt,
        character.updatedAt
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
        SELECT id, name, description, avatar, is_default as isDefault, 
               created_at as createdAt, updated_at as updatedAt
        FROM characters
        ORDER BY is_default DESC, name ASC
      `)
      
      const characters = stmt.all()
      return characters.map(char => ({
        ...char,
        isDefault: Boolean(char.isDefault)
      }))
    } catch (error) {
      console.error('Error getting characters:', error)
      throw error
    }
  }

  getCharacter(characterId) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, name, description, avatar, is_default as isDefault, 
               created_at as createdAt, updated_at as updatedAt
        FROM characters
        WHERE id = ?
      `)
      
      const character = stmt.get(characterId)
      if (!character) return null
      
      return {
        ...character,
        isDefault: Boolean(character.isDefault)
      }
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
      if (updates.description !== undefined) {
        fields.push('description = ?')
        values.push(updates.description)
      }
      if (updates.avatar !== undefined) {
        fields.push('avatar = ?')
        values.push(updates.avatar)
      }
      if (updates.isDefault !== undefined) {
        fields.push('is_default = ?')
        values.push(updates.isDefault ? 1 : 0)
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
        SELECT id, name, description, avatar, is_default as isDefault, 
               created_at as createdAt, updated_at as updatedAt
        FROM characters
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY is_default DESC, name ASC
      `)
      
      const searchTerm = `%${query}%`
      const characters = stmt.all(searchTerm, searchTerm)
      
      return characters.map(char => ({
        ...char,
        isDefault: Boolean(char.isDefault)
      }))
    } catch (error) {
      console.error('Error searching characters:', error)
      throw error
    }
  }

  // Export/Import operations
  exportSessions() {
    try {
      const sessions = this.getAllSessions()
      return {
        version: '1.0',
        exportDate: new Date().toISOString(),
        sessions: sessions
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