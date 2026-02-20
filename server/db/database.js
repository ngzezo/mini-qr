const initSqlJs = require('sql.js')
const path = require('path')
const fs = require('fs')

const DB_DIR = path.join(__dirname, '..', '..', 'data')
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })
const DB_PATH = path.join(DB_DIR, 'miniqr.db')

let db = null

function createWrapper(sqlDb) {
  function persist() {
    fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()))
  }

  function prepare(sql) {
    return {
      get(...params) {
        const stmt = sqlDb.prepare(sql)
        stmt.bind(params.flat())
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      },
      all(...params) {
        const stmt = sqlDb.prepare(sql)
        stmt.bind(params.flat())
        const rows = []
        while (stmt.step()) rows.push(stmt.getAsObject())
        stmt.free()
        return rows
      },
      run(...params) {
        const stmt = sqlDb.prepare(sql)
        stmt.run(params.flat())
        stmt.free()
        const lastInsertRowid = sqlDb.exec('SELECT last_insert_rowid()')[0]
          ? sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0]
          : null
        persist()
        return { lastInsertRowid }
      }
    }
  }

  function exec(sql) {
    sqlDb.run(sql)
    persist()
  }

  return { prepare, exec }
}

async function getDb() {
  if (db) return db

  const SQL = await initSqlJs()

  let sqlDb
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    sqlDb = new SQL.Database(fileBuffer)
  } else {
    sqlDb = new SQL.Database()
  }

  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    locked INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    destination_url TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    fg_color TEXT NOT NULL DEFAULT '#000000',
    bg_color TEXT NOT NULL DEFAULT '#ffffff',
    logo_url TEXT,
    qr_options TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`)
  // Migrate: add qr_options if it doesn't exist yet
  try { sqlDb.run('ALTER TABLE campaigns ADD COLUMN qr_options TEXT') } catch (_) {}
  sqlDb.run(`CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    country TEXT,
    city TEXT,
    latitude REAL,
    longitude REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db = createWrapper(sqlDb)
  db.exec('SELECT 1') // trigger initial persist

  return db
}

module.exports = { getDb }
