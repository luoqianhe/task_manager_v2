import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { initDatabase, closeDatabase, getDb } from './db/database'
import { registerTaskHandlers } from './db/tasks'
import { registerCategoryHandlers } from './db/categories'
import { registerSettingsHandlers } from './db/settings'
import { registerLookupHandlers } from './db/lookups'
import { registerFileHandlers } from './db/attachments'
import { registerWorkspaceHandlers } from './db/workspaces'
import { getAuthClient, isAuthenticated, revokeAuth, getUserEmail, moveToken } from './google/auth'
import { detectColumns, syncWorkspace } from './google/sheetsSync'
import { suggestMapping, DEFAULT_COLUMNS, DEFAULT_MAPPING } from './google/columnMapper'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function resolveDbPath(): string {
  const userDataPath = app.getPath('userData')
  const configFile = join(userDataPath, 'config.json')
  const defaultDbPath = join(userDataPath, 'task_organizer.db')

  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
      if (config.database_path && fs.existsSync(config.database_path)) {
        return config.database_path
      }
    }
  } catch { /* ignore parse errors */ }

  return defaultDbPath
}

app.whenReady().then(() => {
  try {
    const dbPath = resolveDbPath()
    console.log('[main] DB path:', dbPath)
    initDatabase(dbPath)
    console.log('[main] DB initialized')

    registerTaskHandlers()
    registerCategoryHandlers()
    registerSettingsHandlers()
    registerLookupHandlers()
    registerFileHandlers()
    registerWorkspaceHandlers()

    ipcMain.handle('shell:openExternal', (_event, url: string) => {
      shell.openExternal(url)
    })

    ipcMain.handle('dialog:openDb', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'createDirectory'],
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
      })
      return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle('dialog:saveDb', async () => {
      const result = await dialog.showSaveDialog({
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        defaultPath: 'task_organizer.db',
      })
      return result.canceled ? null : result.filePath
    })

    ipcMain.handle('dialog:openCsv', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle('dialog:saveCsv', async () => {
      const result = await dialog.showSaveDialog({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: `tasks_${new Date().toISOString().slice(0, 10)}.csv`,
      })
      return result.canceled ? null : result.filePath
    })

    // CSV export — returns CSV string to renderer (renderer handles save dialog)
    ipcMain.handle('csv:export', () => {
      const db = getDb()
      const rows = db.prepare(`
        SELECT t.title, t.description, t.status, t.priority,
               t.due_date, c.name as category, t.completed_at, t.workspace
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.display_order ASC, t.id ASC
      `).all() as Record<string, unknown>[]

      const headers = ['title','description','status','priority','due_date','category','completed_at','workspace']
      const escape = (v: unknown) => {
        if (v == null) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }
      const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))]
      return lines.join('\n')
    })

    // CSV import — receives file path, bulk-inserts tasks
    ipcMain.handle('csv:import', (_event, filePath: string) => {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      if (lines.length < 2) return { imported: 0 }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const db = getDb()
      const now = new Date().toISOString()

      const maxOrder = (db.prepare(
        'SELECT COALESCE(MAX(display_order), 0) as m FROM tasks'
      ).get() as { m: number }).m

      // Parse a CSV line handling quoted fields
      const parseLine = (line: string): string[] => {
        const result: string[] = []
        let cur = '', inQuote = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
            else inQuote = !inQuote
          } else if (ch === ',' && !inQuote) {
            result.push(cur); cur = ''
          } else {
            cur += ch
          }
        }
        result.push(cur)
        return result
      }

      let imported = 0
      const insert = db.prepare(`
        INSERT INTO tasks (title, description, status, priority, due_date, category_id,
                           completed_at, workspace, display_order, last_modified)
        VALUES (@title, @description, @status, @priority, @due_date, @category_id,
                @completed_at, @workspace, @display_order, @last_modified)
      `)

      const categoryCache: Record<string, number | null> = {}
      const getCategoryId = (name: string): number | null => {
        if (!name) return null
        if (name in categoryCache) return categoryCache[name]
        const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number } | undefined
        categoryCache[name] = row?.id ?? null
        return categoryCache[name]
      }

      const importAll = db.transaction(() => {
        for (let i = 1; i < lines.length; i++) {
          const vals = parseLine(lines[i])
          const row: Record<string, string> = {}
          headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
          if (!row['title']?.trim()) continue

          insert.run({
            title: row['title'].trim(),
            description: row['description'] || null,
            status: row['status'] || 'Not Started',
            priority: row['priority'] || 'Unprioritized',
            due_date: row['due_date'] || null,
            category_id: getCategoryId(row['category'] || ''),
            completed_at: row['completed_at'] || null,
            workspace: row['workspace'] || 'default',
            display_order: maxOrder + i,
            last_modified: now,
          })
          imported++
        }
      })
      importAll()
      return { imported }
    })

    // ── Google Sheets Sync ──────────────────────────────────────────────────

    ipcMain.handle('sync:openCredentials', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
        message: 'Select your Google OAuth credentials.json file',
      })
      return result.canceled ? null : result.filePaths[0]
    })

    ipcMain.handle('sync:isAuthenticated', (_e, workspace: string) => {
      return isAuthenticated(workspace)
    })

    ipcMain.handle('sync:authenticate', async (_e, credentialsPath: string, _workspace: string) => {
      // Always auth into a staging slot; finalizeWorkspace moves it to the real workspace
      const STAGING = '_sync_staging'
      const db = getDb()
      db.prepare(`
        INSERT INTO sync_settings (workspace, credentials_path)
        VALUES (?, ?)
        ON CONFLICT(workspace) DO UPDATE SET credentials_path = excluded.credentials_path
      `).run(STAGING, credentialsPath)
      const auth = await getAuthClient(credentialsPath, STAGING)
      const email = await getUserEmail(auth)
      return { ok: true, email }
    })

    ipcMain.handle('sync:finalizeWorkspace', (_e, displayName: string, credentialsPath: string) => {
      const db = getDb()
      const toSlug = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'workspace'

      // Find a unique slug
      const baseSlug = toSlug(displayName)
      let slug = baseSlug
      let suffix = 1
      while (db.prepare('SELECT id FROM workspaces WHERE name = ?').get(slug)) {
        slug = `${baseSlug}_${suffix++}`
      }

      const maxOrder = (db.prepare('SELECT COALESCE(MAX(display_order),0) as m FROM workspaces').get() as { m: number }).m
      db.prepare('INSERT INTO workspaces (name, display_name, color, display_order) VALUES (?,?,?,?)')
        .run(slug, displayName, '#3b82f6', maxOrder + 1)

      // Move token from staging to the real workspace name
      moveToken('_sync_staging', slug)

      // Transfer sync settings from staging to new workspace
      db.prepare(`
        INSERT INTO sync_settings (workspace, credentials_path)
        VALUES (?, ?)
        ON CONFLICT(workspace) DO UPDATE SET credentials_path = excluded.credentials_path
      `).run(slug, credentialsPath)
      db.prepare('DELETE FROM sync_settings WHERE workspace = ?').run('_sync_staging')

      return db.prepare('SELECT * FROM workspaces WHERE name = ?').get(slug)
    })

    ipcMain.handle('sync:autoSync', async (_e, workspace: string) => {
      if (!isAuthenticated(workspace)) return { synced: false }
      const db = getDb()
      const row = db.prepare('SELECT * FROM sync_settings WHERE workspace = ?').get(workspace) as Record<string, string> | undefined
      if (!row?.sheet_id || !row?.credentials_path || !row?.column_mapping) return { synced: false }
      const auth = await getAuthClient(row.credentials_path, workspace)
      const mapping = JSON.parse(row.column_mapping)
      const result = await syncWorkspace(db, auth, workspace, row.sheet_id, row.sync_tab_name ?? 'Tasks', mapping)
      return { synced: true, ...result }
    })

    ipcMain.handle('sync:revokeAuth', (_e, workspace: string) => {
      revokeAuth(workspace)
    })

    ipcMain.handle('sync:getSettings', (_e, workspace: string) => {
      const row = getDb().prepare(
        'SELECT * FROM sync_settings WHERE workspace = ?'
      ).get(workspace) as Record<string, string> | undefined
      if (!row) return null
      return {
        ...row,
        column_mapping: row.column_mapping ? JSON.parse(row.column_mapping) : null,
        detected_columns: row.detected_columns ? JSON.parse(row.detected_columns) : [],
      }
    })

    ipcMain.handle('sync:saveSettings', (_e, workspace: string, settings: Record<string, unknown>) => {
      const db = getDb()
      db.prepare(`
        INSERT INTO sync_settings (workspace, sheet_id, sync_tab_name, column_mapping, credentials_path)
        VALUES (@workspace, @sheet_id, @sync_tab_name, @column_mapping, @credentials_path)
        ON CONFLICT(workspace) DO UPDATE SET
          sheet_id = COALESCE(excluded.sheet_id, sheet_id),
          sync_tab_name = COALESCE(excluded.sync_tab_name, sync_tab_name),
          column_mapping = COALESCE(excluded.column_mapping, column_mapping),
          credentials_path = COALESCE(excluded.credentials_path, credentials_path)
      `).run({
        workspace,
        sheet_id: settings.sheet_id ?? null,
        sync_tab_name: settings.sync_tab_name ?? 'Tasks',
        column_mapping: settings.column_mapping ? JSON.stringify(settings.column_mapping) : null,
        credentials_path: settings.credentials_path ?? null,
      })
      return { ok: true }
    })

    ipcMain.handle('sync:detectColumns', async (_e, workspace: string) => {
      const db = getDb()
      const row = db.prepare('SELECT * FROM sync_settings WHERE workspace = ?').get(workspace) as Record<string, string> | undefined
      if (!row?.sheet_id || !row.credentials_path) throw new Error('Sheet not configured')
      const auth = await getAuthClient(row.credentials_path, workspace)
      const rawColumns = await detectColumns(auth, row.sheet_id, row.sync_tab_name ?? 'Tasks')
      const isEmpty = rawColumns.length === 0
      const columns = isEmpty ? DEFAULT_COLUMNS : rawColumns
      const mapping = isEmpty ? DEFAULT_MAPPING : suggestMapping(rawColumns)
      db.prepare('UPDATE sync_settings SET detected_columns = ? WHERE workspace = ?')
        .run(JSON.stringify(columns), workspace)
      return { columns, mapping, isEmpty }
    })

    ipcMain.handle('sync:sync', async (_e, workspace: string) => {
      const db = getDb()
      const row = db.prepare('SELECT * FROM sync_settings WHERE workspace = ?').get(workspace) as Record<string, string> | undefined
      if (!row?.sheet_id || !row.credentials_path) throw new Error('Sheet not configured')
      if (!row.column_mapping) throw new Error('Column mapping not configured')
      const auth = await getAuthClient(row.credentials_path, workspace)
      const mapping = JSON.parse(row.column_mapping)
      const result = await syncWorkspace(db, auth, workspace, row.sheet_id, row.sync_tab_name ?? 'Tasks', mapping)
      return result
    })

    console.log('[main] Creating window...')
    createWindow()
    console.log('[main] Window created')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    console.error('[main] FATAL ERROR:', err)
    dialog.showErrorBox('Startup Error', String(err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
