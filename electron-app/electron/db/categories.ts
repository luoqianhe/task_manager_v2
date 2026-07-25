import { ipcMain } from 'electron'
import { getDb } from './database'

export function registerCategoryHandlers() {
  ipcMain.handle('categories:list', (_event, workspace: string) => {
    return getDb().prepare('SELECT * FROM categories WHERE workspace = ? ORDER BY name').all(workspace)
  })

  ipcMain.handle('categories:create', (_event, data: Record<string, unknown>) => {
    const result = getDb().prepare(
      'INSERT INTO categories (name, color, workspace) VALUES (?, ?, ?)'
    ).run(data.name, data.color || '#E8F4FD', data.workspace)
    return result.lastInsertRowid
  })

  ipcMain.handle('categories:update', (_event, id: number, data: Record<string, unknown>) => {
    getDb().prepare(
      'UPDATE categories SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?'
    ).run(data.name ?? null, data.color ?? null, id)
    return true
  })

  ipcMain.handle('categories:delete', (_event, id: number) => {
    getDb().prepare('UPDATE tasks SET category_id = NULL WHERE category_id = ?').run(id)
    getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
    return true
  })
}
