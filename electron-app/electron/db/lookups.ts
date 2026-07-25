import { ipcMain } from 'electron'
import { getDb } from './database'

const PROTECTED_PRIORITIES = ['Unprioritized']
const PROTECTED_STATUSES = ['Completed', 'Backlog', 'Not Started']

export function registerLookupHandlers() {
  ipcMain.handle('lookups:priorities', (_e, workspace: string) => {
    return getDb().prepare('SELECT * FROM priorities WHERE workspace = ? ORDER BY display_order').all(workspace)
  })

  ipcMain.handle('lookups:priorities:create', (_e, data: { name: string; color: string; workspace: string }) => {
    const db = getDb()
    const { m } = db.prepare('SELECT COALESCE(MAX(display_order), 0) as m FROM priorities WHERE workspace = ?').get(data.workspace) as { m: number }
    const result = db.prepare('INSERT INTO priorities (name, color, display_order, workspace) VALUES (?, ?, ?, ?)').run(data.name, data.color, m + 1, data.workspace)
    return db.prepare('SELECT * FROM priorities WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('lookups:priorities:update', (_e, id: number, data: { name?: string; color?: string }) => {
    getDb().prepare('UPDATE priorities SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
      .run(data.name ?? null, data.color ?? null, id)
    return true
  })

  ipcMain.handle('lookups:priorities:delete', (_e, id: number) => {
    const db = getDb()
    const row = db.prepare('SELECT name, workspace FROM priorities WHERE id = ?').get(id) as { name: string; workspace: string } | undefined
    if (row && PROTECTED_PRIORITIES.includes(row.name)) {
      return { ok: false, reason: `"${row.name}" is the default fallback priority and cannot be deleted.` }
    }
    if (row) {
      db.prepare("UPDATE tasks SET priority = 'Unprioritized' WHERE priority = ? AND workspace = ?").run(row.name, row.workspace)
    }
    db.prepare('DELETE FROM priorities WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('lookups:statuses', (_e, workspace: string) => {
    return getDb().prepare('SELECT * FROM statuses WHERE workspace = ? ORDER BY display_order').all(workspace)
  })

  ipcMain.handle('lookups:statuses:create', (_e, data: { name: string; color: string; workspace: string }) => {
    const db = getDb()
    const { m } = db.prepare('SELECT COALESCE(MAX(display_order), 0) as m FROM statuses WHERE workspace = ?').get(data.workspace) as { m: number }
    const result = db.prepare('INSERT INTO statuses (name, color, display_order, workspace) VALUES (?, ?, ?, ?)').run(data.name, data.color, m + 1, data.workspace)
    return db.prepare('SELECT * FROM statuses WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('lookups:statuses:update', (_e, id: number, data: { name?: string; color?: string }) => {
    getDb().prepare('UPDATE statuses SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
      .run(data.name ?? null, data.color ?? null, id)
    return true
  })

  ipcMain.handle('lookups:statuses:delete', (_e, id: number) => {
    const db = getDb()
    const row = db.prepare('SELECT name, workspace FROM statuses WHERE id = ?').get(id) as { name: string; workspace: string } | undefined
    if (row && PROTECTED_STATUSES.includes(row.name)) {
      return { ok: false, reason: `"${row.name}" is used for tab grouping and cannot be deleted.` }
    }
    if (row) {
      db.prepare("UPDATE tasks SET status = 'Not Started' WHERE status = ? AND workspace = ?").run(row.name, row.workspace)
    }
    db.prepare('DELETE FROM statuses WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('lookups:workspaces', () => {
    return getDb().prepare('SELECT * FROM workspaces ORDER BY display_order').all()
  })
}
