import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { fileURLToPath } from 'url'

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
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at);
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
      INSERT INTO sessions (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `)
    
    try {
      stmt.run(session.id, session.title, session.createdAt, new Date().toISOString())
      
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
        SELECT id, title, created_at as createdAt, updated_at as updatedAt
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
        SELECT id, title, created_at as createdAt, updated_at as updatedAt
        FROM sessions
        WHERE id = ?
      `)
      
      const session = sessionStmt.get(sessionId)
      if (!session) return null
      
      const messagesStmt = this.db.prepare(`
        SELECT id, role, content, timestamp
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `)
      
      const messages = messagesStmt.all(sessionId).map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
      
      return { ...session, messages }
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
        INSERT INTO messages (id, session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `)
      
      const transaction = this.db.transaction((msgs) => {
        for (const message of msgs) {
          stmt.run(
            message.id,
            sessionId,
            message.role,
            message.content,
            message.timestamp.toISOString()
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
        SELECT m.id, m.role, m.content, m.timestamp, m.session_id,
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
          timestamp: new Date(result.timestamp)
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

  close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export default DatabaseService 