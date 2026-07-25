import { ipcMain, dialog, shell, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getDb } from './database'
import { getCachedClient } from '../google/auth'
import { uploadToDrive, downloadFromDrive, deleteFromDrive } from '../google/driveSync'

function attachmentsDir(taskId: number): string {
  const dir = path.join(app.getPath('userData'), 'attachments', String(taskId))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function registerFileHandlers(): void {
  ipcMain.handle('files:list', (_e, taskId: number) => {
    return getDb().prepare(
      'SELECT * FROM files WHERE task_id = ? ORDER BY display_order ASC, id ASC'
    ).all(taskId)
  })

  ipcMain.handle('files:attach', async (_e, taskId: number) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Attach files to task',
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const db = getDb()
    const maxOrder = (db.prepare(
      'SELECT COALESCE(MAX(display_order), 0) as m FROM files WHERE task_id = ?'
    ).get(taskId) as { m: number }).m

    const destDir = attachmentsDir(taskId)
    const inserted: unknown[] = []

    result.filePaths.forEach((src, i) => {
      const fileName = path.basename(src)
      let dest = path.join(destDir, fileName)
      // Avoid collisions with same filename
      if (fs.existsSync(dest) && dest !== src) {
        const ext = path.extname(fileName)
        const base = path.basename(fileName, ext)
        dest = path.join(destDir, `${base}_${Date.now()}${ext}`)
      }
      if (src !== dest) fs.copyFileSync(src, dest)

      const r = db.prepare(
        'INSERT INTO files (task_id, file_path, file_name, display_order) VALUES (?, ?, ?, ?)'
      ).run(taskId, dest, fileName, maxOrder + i + 1)

      inserted.push(db.prepare('SELECT * FROM files WHERE id = ?').get(r.lastInsertRowid))
    })

    return inserted
  })

  ipcMain.handle('files:open', (_e, id: number) => {
    const row = getDb().prepare('SELECT file_path FROM files WHERE id = ?').get(id) as
      { file_path: string } | undefined
    if (!row) return
    if (!fs.existsSync(row.file_path)) {
      throw new Error('File not found locally — try downloading from Drive.')
    }
    shell.openPath(row.file_path)
  })

  ipcMain.handle('files:reveal', (_e, id: number) => {
    const row = getDb().prepare('SELECT file_path FROM files WHERE id = ?').get(id) as
      { file_path: string } | undefined
    if (row && fs.existsSync(row.file_path)) {
      shell.showItemInFolder(row.file_path)
    }
  })

  ipcMain.handle('files:delete', async (_e, id: number, workspace: string) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
      { file_path: string; drive_file_id: string | null } | undefined
    if (!row) return false

    if (row.drive_file_id) {
      try {
        const auth = getCachedClient(workspace)
        if (auth) await deleteFromDrive(auth, row.drive_file_id)
      } catch { /* best-effort — don't block deletion if Drive fails */ }
    }

    try {
      if (fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path)
    } catch { /* best-effort */ }

    db.prepare('DELETE FROM files WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('files:uploadToDrive', async (_e, id: number, workspace: string) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
      { file_path: string; file_name: string; drive_file_id: string | null } | undefined
    if (!row) throw new Error('Attachment record not found')
    if (!fs.existsSync(row.file_path)) throw new Error('Local file not found')

    const auth = getCachedClient(workspace)
    if (!auth) throw new Error('Not authenticated with Google — sign in via Sync settings')

    const driveId = await uploadToDrive(auth, row.file_path, row.file_name || path.basename(row.file_path))
    db.prepare('UPDATE files SET drive_file_id = ? WHERE id = ?').run(driveId, id)
    return driveId
  })

  ipcMain.handle('files:downloadFromDrive', async (_e, id: number, workspace: string) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
      { task_id: number; file_path: string; file_name: string; drive_file_id: string | null } | undefined
    if (!row?.drive_file_id) throw new Error('This file has no Drive ID')

    const auth = getCachedClient(workspace)
    if (!auth) throw new Error('Not authenticated with Google — sign in via Sync settings')

    const destDir = attachmentsDir(row.task_id)
    const dest = path.join(destDir, row.file_name || `attachment_${id}`)
    await downloadFromDrive(auth, row.drive_file_id, dest)
    db.prepare('UPDATE files SET file_path = ? WHERE id = ?').run(dest, id)
    return dest
  })

  ipcMain.handle('files:syncDrive', async (_e, taskId: number, workspace: string) => {
    const db = getDb()
    const auth = getCachedClient(workspace)
    if (!auth) throw new Error('Not authenticated with Google — sign in via Sync settings')

    const rows = db.prepare('SELECT * FROM files WHERE task_id = ?').all(taskId) as
      Array<{ id: number; file_path: string; file_name: string; drive_file_id: string | null }>

    let uploaded = 0, skipped = 0
    for (const row of rows) {
      if (row.drive_file_id) { skipped++; continue }
      if (!fs.existsSync(row.file_path)) { skipped++; continue }
      const driveId = await uploadToDrive(auth, row.file_path, row.file_name || path.basename(row.file_path))
      db.prepare('UPDATE files SET drive_file_id = ? WHERE id = ?').run(driveId, row.id)
      uploaded++
    }
    return { uploaded, skipped }
  })
}
