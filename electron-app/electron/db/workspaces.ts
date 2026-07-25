import { ipcMain } from 'electron'
import { getDb, seedWorkspaceLookups } from './database'

function toSlug(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspaces:create', (_e, data: { display_name: string; color: string }) => {
    const db = getDb()
    const maxOrder = (db.prepare(
      'SELECT COALESCE(MAX(display_order), 0) as m FROM workspaces'
    ).get() as { m: number }).m

    let name = toSlug(data.display_name)
    // Ensure uniqueness by appending a counter if needed
    const existing = db.prepare('SELECT name FROM workspaces WHERE name = ?').get(name)
    if (existing) name = `${name}_${Date.now()}`

    const result = db.prepare(
      'INSERT INTO workspaces (name, display_name, color, display_order) VALUES (?, ?, ?, ?)'
    ).run(name, data.display_name.trim(), data.color, maxOrder + 1)

    seedWorkspaceLookups(name)

    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('workspaces:update', (_e, id: number, data: { display_name?: string; color?: string }) => {
    getDb().prepare(
      'UPDATE workspaces SET display_name = COALESCE(?, display_name), color = COALESCE(?, color) WHERE id = ?'
    ).run(data.display_name ?? null, data.color ?? null, id)
    return true
  })

  ipcMain.handle('workspaces:delete', (_e, id: number) => {
    const db = getDb()

    const wsCount = (db.prepare('SELECT COUNT(*) as c FROM workspaces').get() as { c: number }).c
    if (wsCount <= 1) return { ok: false, reason: 'Cannot delete the last workspace.' }

    const ws = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(id) as { name: string } | undefined
    if (!ws) return { ok: false, reason: 'Workspace not found.' }
    if (ws.name === 'current_tasks') return { ok: false, reason: 'Current Tasks is a built-in workspace and cannot be deleted.' }

    const taskCount = (db.prepare(
      'SELECT COUNT(*) as c FROM tasks WHERE workspace = ?'
    ).get(ws.name) as { c: number }).c

    if (taskCount > 0) {
      return {
        ok: false,
        reason: `This workspace contains ${taskCount} task${taskCount === 1 ? '' : 's'}. Move or delete them first.`,
      }
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
    return { ok: true }
  })
}
