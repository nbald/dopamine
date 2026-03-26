import Database from 'better-sqlite3';
import fs from 'node:fs';
import { config } from './config.js';
import { assignProjectCategory, assignPanelEmoji, generatePanelName } from './utils/emoji.js';

let db: Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    jwt_secret TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS terminals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title_override TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    cwd TEXT,
    exit_code INTEGER,
    is_dead INTEGER NOT NULL DEFAULT 0,
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 24,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    layout TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iframes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_terminals_project ON terminals(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_iframes_project ON iframes(project_id);
`;

export function initDb(): Database.Database {
  fs.mkdirSync(config.dataDir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);

  return db;
}

function migrate(db: Database.Database) {
  const migrations = [
    'ALTER TABLE projects ADD COLUMN emoji_category TEXT',
    'ALTER TABLE terminals ADD COLUMN emoji TEXT',
    'ALTER TABLE notes ADD COLUMN emoji TEXT',
    'ALTER TABLE iframes ADD COLUMN emoji TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch {}
  }

  // Backfill existing projects with a category
  const projects = db.prepare('SELECT id FROM projects WHERE emoji_category IS NULL').all() as { id: number }[];
  for (const p of projects) {
    const category = assignProjectCategory(db);
    db.prepare('UPDATE projects SET emoji_category = ? WHERE id = ?').run(category, p.id);
  }

  // Assign emojis to panels that don't have one yet
  const panelTables = ['terminals', 'notes', 'iframes'];
  for (const table of panelTables) {
    const items = db.prepare(`SELECT id, project_id FROM ${table} WHERE emoji IS NULL`).all() as { id: number; project_id: number }[];
    for (const item of items) {
      const emoji = assignPanelEmoji(db, item.project_id);
      db.prepare(`UPDATE ${table} SET emoji = ? WHERE id = ?`).run(emoji, item.id);
    }
  }

  // Regenerate all panel names from their emoji
  for (const table of panelTables) {
    const items = db.prepare(`SELECT id, emoji FROM ${table} WHERE emoji IS NOT NULL`).all() as { id: number; emoji: string }[];
    for (const item of items) {
      const name = generatePanelName(item.emoji);
      if (table === 'terminals') {
        db.prepare('UPDATE terminals SET name = ?, title_override = NULL WHERE id = ?').run(name, item.id);
      } else {
        db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, item.id);
      }
    }
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}
