import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDatabase(dbPath: string): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#E8F4FD',
      workspace TEXT NOT NULL DEFAULT 'home'
    );

    CREATE TABLE IF NOT EXISTS priorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      workspace TEXT NOT NULL DEFAULT 'home'
    );

    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      workspace TEXT NOT NULL DEFAULT 'home'
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      color TEXT,
      display_order INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'Not Started',
      priority TEXT NOT NULL DEFAULT 'Medium',
      due_date TEXT,
      category_id INTEGER,
      parent_id INTEGER DEFAULT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      tree_level INTEGER NOT NULL DEFAULT 0,
      is_compact INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT DEFAULT NULL,
      bee_item_id TEXT DEFAULT NULL,
      workspace TEXT DEFAULT 'home',
      assigned_to TEXT,
      owner TEXT,
      last_modified TIMESTAMP,
      sheet_row_id INTEGER,
      remind_me TEXT DEFAULT NULL,
      extra_data TEXT,
      subtask_sheet_row_id INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (parent_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_links_task_id ON links(task_id);

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      drive_file_id TEXT DEFAULT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_files_task_id ON files(task_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_settings (
      workspace TEXT PRIMARY KEY,
      sheet_id TEXT,
      sync_tab_name TEXT DEFAULT 'Tasks',
      column_mapping TEXT,
      detected_columns TEXT,
      credentials_path TEXT,
      last_sync TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace TEXT NOT NULL,
      sheet_row_id INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pinned_tasks (
      task_id INTEGER PRIMARY KEY,
      pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `)

  migrateToWorkspaceLookups(db)
  seedDefaults(db)
}

// One-time migration: add workspace column to categories/priorities/statuses
// and duplicate existing global rows per workspace.
function migrateToWorkspaceLookups(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(categories)').all() as Array<{ name: string }>
  if (cols.some(c => c.name === 'workspace')) return

  const workspaces = db.prepare(
    "SELECT name FROM workspaces WHERE name != 'current_tasks' ORDER BY display_order"
  ).all() as { name: string }[]

  // Add columns (DDL outside transaction for compatibility)
  db.exec('ALTER TABLE categories ADD COLUMN workspace TEXT')
  db.exec('ALTER TABLE priorities ADD COLUMN workspace TEXT')
  db.exec('ALTER TABLE statuses ADD COLUMN workspace TEXT')

  if (workspaces.length === 0) return

  db.transaction(() => {
    // Categories: duplicate per workspace and remap task category_ids
    const cats = db.prepare('SELECT * FROM categories WHERE workspace IS NULL').all() as
      Array<{ id: number; name: string; color: string }>

    const catIdMap = new Map<string, Map<number, number>>()
    for (const ws of workspaces) {
      const wsMap = new Map<number, number>()
      catIdMap.set(ws.name, wsMap)
      for (const cat of cats) {
        const r = db.prepare('INSERT INTO categories (name, color, workspace) VALUES (?, ?, ?)').run(cat.name, cat.color, ws.name)
        wsMap.set(cat.id, r.lastInsertRowid as number)
      }
    }

    const tasks = db.prepare('SELECT id, category_id, workspace FROM tasks WHERE category_id IS NOT NULL').all() as
      Array<{ id: number; category_id: number; workspace: string }>
    for (const task of tasks) {
      const newId = catIdMap.get(task.workspace)?.get(task.category_id)
      if (newId) db.prepare('UPDATE tasks SET category_id = ? WHERE id = ?').run(newId, task.id)
    }
    db.prepare('DELETE FROM categories WHERE workspace IS NULL').run()

    // Priorities
    const pris = db.prepare('SELECT * FROM priorities WHERE workspace IS NULL').all() as
      Array<{ name: string; color: string; display_order: number }>
    for (const ws of workspaces) {
      for (const pri of pris) {
        db.prepare('INSERT INTO priorities (name, color, display_order, workspace) VALUES (?, ?, ?, ?)')
          .run(pri.name, pri.color, pri.display_order, ws.name)
      }
    }
    db.prepare('DELETE FROM priorities WHERE workspace IS NULL').run()

    // Statuses
    const stats = db.prepare('SELECT * FROM statuses WHERE workspace IS NULL').all() as
      Array<{ name: string; color: string; display_order: number }>
    for (const ws of workspaces) {
      for (const stat of stats) {
        db.prepare('INSERT INTO statuses (name, color, display_order, workspace) VALUES (?, ?, ?, ?)')
          .run(stat.name, stat.color, stat.display_order, ws.name)
      }
    }
    db.prepare('DELETE FROM statuses WHERE workspace IS NULL').run()
  })()
}

function seedDefaults(db: Database.Database): void {
  // Always ensure the built-in Current Tasks workspace exists
  const hasCurrent = db.prepare("SELECT id FROM workspaces WHERE name = 'current_tasks'").get()
  if (!hasCurrent) {
    db.prepare('INSERT INTO workspaces (name, display_name, color, display_order) VALUES (?, ?, ?, ?)')
      .run('current_tasks', 'Current Tasks', '#6b7280', 0)
  }

  const userWsCount = (db.prepare("SELECT COUNT(*) as c FROM workspaces WHERE name != 'current_tasks'").get() as { c: number }).c
  if (userWsCount === 0) {
    const insertWs = db.prepare('INSERT INTO workspaces (name, display_name, color, display_order) VALUES (?, ?, ?, ?)')
    insertWs.run('home', 'Home', '#3b82f6', 1)
    insertWs.run('work', 'Work', '#ef4444', 2)
  }

  // Seed lookups for each user workspace that has none yet
  const userWorkspaces = db.prepare("SELECT name FROM workspaces WHERE name != 'current_tasks'").all() as { name: string }[]
  for (const ws of userWorkspaces) {
    seedWorkspaceLookupsInternal(db, ws.name)
  }
}

function seedWorkspaceLookupsInternal(db: Database.Database, workspace: string): void {
  const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories WHERE workspace = ?').get(workspace) as { c: number }).c
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO categories (name, color, workspace) VALUES (?, ?, ?)')
    for (const [name, color] of [['Work', '#E8F4FD'], ['Personal', '#F0F7FF'], ['General', '#F8F9FA'], ['Ideas', '#FFF8E1']]) {
      ins.run(name, color, workspace)
    }
  }

  const priCount = (db.prepare('SELECT COUNT(*) as c FROM priorities WHERE workspace = ?').get(workspace) as { c: number }).c
  if (priCount === 0) {
    const ins = db.prepare('INSERT INTO priorities (name, color, display_order, workspace) VALUES (?, ?, ?, ?)')
    for (const [name, color, order] of [['High', '#ef4444', 1], ['Medium', '#f59e0b', 2], ['Low', '#6b7280', 3], ['Unprioritized', '#9ca3af', 4]]) {
      ins.run(name, color, order, workspace)
    }
  }

  const statCount = (db.prepare('SELECT COUNT(*) as c FROM statuses WHERE workspace = ?').get(workspace) as { c: number }).c
  if (statCount === 0) {
    const ins = db.prepare('INSERT INTO statuses (name, color, display_order, workspace) VALUES (?, ?, ?, ?)')
    for (const [name, color, order] of [
      ['Not Started', '#9ca3af', 1], ['In Progress', '#3b82f6', 2],
      ['On Hold', '#f59e0b', 3], ['Backlog', '#a855f7', 4], ['Completed', '#22c55e', 5],
    ]) {
      ins.run(name, color, order, workspace)
    }
  }
}

// Called by workspaces:create to populate a new workspace with default lookups
export function seedWorkspaceLookups(workspace: string): void {
  seedWorkspaceLookupsInternal(getDb(), workspace)
}
