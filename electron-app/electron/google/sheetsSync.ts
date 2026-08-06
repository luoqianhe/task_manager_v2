import { google } from 'googleapis'
import type Database from 'better-sqlite3'
import { ColumnMapping, getColumnLetter } from './columnMapper'

type SheetsClient = ReturnType<typeof google.sheets>
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

const TASK_ID_COL = '_TaskID'
const PARENT_ID_COL = '_ParentTaskID'

export async function detectColumns(auth: OAuth2Client, sheetId: string, tabName: string): Promise<string[]> {
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:ZZ1`,
  })
  const row = res.data.values?.[0] ?? []
  return row.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
}

// Ensures a hidden bookkeeping column (e.g. _TaskID, _ParentTaskID) exists, appending it if missing.
// Returns the updated columns array so callers can chain multiple ensures without a network re-fetch.
async function ensureHiddenColumn(
  sheets: SheetsClient, sheetId: string, tabName: string, columns: string[], colName: string
): Promise<{ index: number; columns: string[] }> {
  const idx = columns.indexOf(colName)
  if (idx !== -1) return { index: idx, columns }

  const newIdx = columns.length
  const letter = getColumnLetter(newIdx + 1)
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tabName}!${letter}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[colName]] },
  })

  // Hide the column
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' })
    const sheetMeta = meta.data.sheets?.find(s => s.properties?.title === tabName)
    const sheetGid = sheetMeta?.properties?.sheetId
    if (sheetGid !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            updateDimensionProperties: {
              range: { sheetId: sheetGid, dimension: 'COLUMNS', startIndex: newIdx, endIndex: newIdx + 1 },
              properties: { hiddenByUser: true },
              fields: 'hiddenByUser',
            },
          }],
        },
      })
    }
  } catch { /* non-fatal */ }

  return { index: newIdx, columns: [...columns, colName] }
}

function parseDate(val: string | null): string | null {
  if (!val) return null
  // Handle MM/DD/YYYY, YYYY-MM-DD, and other common formats
  const mmddyyyy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Try ISO parse
  const d = new Date(val)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function rowToTask(row: string[], columns: string[], mapping: ColumnMapping): Record<string, string | null> {
  const get = (field: keyof ColumnMapping): string | null => {
    const col = mapping[field]
    if (!col) return null
    const idx = columns.indexOf(col)
    return idx !== -1 ? (row[idx] ?? '').trim() || null : null
  }
  return {
    title:         get('title'),
    description:   get('description'),
    status:        get('status'),
    priority:      get('priority'),
    due_date:      parseDate(get('due_date')),
    category:      get('category'),
    assigned_to:   get('assigned_to'),
    last_modified: get('last_modified'),
  }
}

function taskToRow(
  task: Record<string, unknown>,
  columns: string[],
  mapping: ColumnMapping,
  categoryName: string | null,
  taskIdColIndex: number | null,
): string[] {
  const row = new Array(columns.length).fill('')

  const set = (field: keyof ColumnMapping, value: string | null) => {
    const col = mapping[field]
    if (!col) return
    const idx = columns.indexOf(col)
    if (idx !== -1) row[idx] = value ?? ''
  }

  set('title',         String(task.title ?? ''))
  set('description',   task.description ? String(task.description) : '')
  set('status',        String(task.status ?? ''))
  set('priority',      String(task.priority ?? ''))
  set('due_date',      task.due_date ? String(task.due_date) : '')
  set('category',      categoryName ?? '')
  set('assigned_to',   task.assigned_to ? String(task.assigned_to) : '')
  set('last_modified', task.last_modified ? String(task.last_modified) : new Date().toISOString())

  if (taskIdColIndex !== null) row[taskIdColIndex] = String(task.id)

  return row
}

function ensureRefData(db: Database.Database, field: string, value: string | null) {
  if (!value) return
  if (field === 'status') {
    const exists = db.prepare('SELECT id FROM statuses WHERE name = ?').get(value)
    if (!exists) {
      const maxOrder = (db.prepare('SELECT COALESCE(MAX(display_order),0) as m FROM statuses').get() as { m: number }).m
      db.prepare('INSERT INTO statuses (name, color, display_order) VALUES (?,?,?)').run(value, '#9ca3af', maxOrder + 1)
    }
  } else if (field === 'priority') {
    const exists = db.prepare('SELECT id FROM priorities WHERE name = ?').get(value)
    if (!exists) {
      const maxOrder = (db.prepare('SELECT COALESCE(MAX(display_order),0) as m FROM priorities').get() as { m: number }).m
      db.prepare('INSERT INTO priorities (name, color, display_order) VALUES (?,?,?)').run(value, '#6b7280', maxOrder + 1)
    }
  } else if (field === 'category') {
    const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(value)
    if (!exists) {
      db.prepare('INSERT INTO categories (name, color) VALUES (?,?)').run(value, '#E8F4FD')
    }
  }
}

function getCategoryId(db: Database.Database, name: string | null): number | null {
  if (!name) return null
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number } | undefined
  return row?.id ?? null
}

export interface SyncResult {
  added: number
  updated: number
  deleted: number
  pushed: number
  pushedNew: number
  deletedFromSheet: number
}

export async function syncWorkspace(
  db: Database.Database,
  auth: OAuth2Client,
  workspace: string,
  sheetId: string,
  tabName: string,
  mapping: ColumnMapping,
): Promise<SyncResult> {
  const sheets = google.sheets({ version: 'v4', auth })

  // ── Detect columns & ensure hidden bookkeeping columns ───────────────────
  let columns = await detectColumns(auth, sheetId, tabName)
  let taskIdRes = await ensureHiddenColumn(sheets, sheetId, tabName, columns, TASK_ID_COL)
  let parentIdRes = await ensureHiddenColumn(sheets, sheetId, tabName, taskIdRes.columns, PARENT_ID_COL)
  let taskIdColIndex = taskIdRes.index
  let parentIdColIndex = parentIdRes.index
  // Re-fetch headers now that hidden columns may have been added
  let freshColumns = await detectColumns(auth, sheetId, tabName)

  // Bootstrap column headers for a brand-new empty sheet
  if (freshColumns.filter(c => c !== TASK_ID_COL && c !== PARENT_ID_COL).length === 0) {
    const mappedCols = Object.values(mapping).filter((v): v is string => typeof v === 'string')
    if (mappedCols.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [mappedCols] },
      })
      columns = await detectColumns(auth, sheetId, tabName)
      taskIdRes = await ensureHiddenColumn(sheets, sheetId, tabName, columns, TASK_ID_COL)
      parentIdRes = await ensureHiddenColumn(sheets, sheetId, tabName, taskIdRes.columns, PARENT_ID_COL)
      taskIdColIndex = taskIdRes.index
      parentIdColIndex = parentIdRes.index
      freshColumns = await detectColumns(auth, sheetId, tabName)
    }
  }

  // ── Read all sheet rows ───────────────────────────────────────────────────
  const numCols = freshColumns.length
  const lastCol = getColumnLetter(numCols)
  const sheetData = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A2:${lastCol}`,
  })
  const sheetRows = (sheetData.data.values ?? []) as string[][]

  // ── Tombstones ───────────────────────────────────────────────────────────
  const tombstones = new Set<number>(
    (db.prepare('SELECT sheet_row_id FROM sync_tombstones WHERE workspace = ?').all(workspace) as { sheet_row_id: number }[])
      .map(r => r.sheet_row_id)
  )

  const now = new Date().toISOString()
  let added = 0, updated = 0, deleted = 0

  // Track local task IDs we saw in the sheet (for deletion pass)
  const seenLocalIds = new Set<number>()
  // Rows needing _TaskID written back
  const rowsNeedingId: Array<{ rowNum: number; taskId: number }> = []
  // Maps a subtask row's parent-reference (the parent's _TaskID value AS IT APPEARED in the sheet
  // before this pull) to the parent's resolved local id, so pass 2 can attach subtasks correctly
  // even if the parent's local id has just changed (e.g. first sync on a fresh machine).
  const parentIdRemap = new Map<number, number>()
  // Rows to update in sheet (task data changed locally since last pull)
  // We handle this in the push phase below.

  const getParentRaw = (row: string[]): string =>
    parentIdColIndex !== -1 ? (row[parentIdColIndex] ?? '').trim() : ''

  // Create/update a single local task from a sheet row. `parentLocalId` is null for root tasks.
  // Returns the task's resolved local id, or null if the row has no title (skipped).
  function pullOneRow(row: string[], rowNum: number, parentLocalId: number | null): number | null {
    const taskData = rowToTask(row, freshColumns, mapping)
    if (!taskData.title) return null

    const taskIdRaw = taskIdColIndex !== -1 ? (row[taskIdColIndex] ?? '').trim() : ''
    const stableId = taskIdRaw ? parseInt(taskIdRaw, 10) : null

    // Ensure reference data exists
    ensureRefData(db, 'status', taskData.status)
    ensureRefData(db, 'priority', taskData.priority)
    ensureRefData(db, 'category', taskData.category)
    const categoryId = getCategoryId(db, taskData.category)

    // Try to find existing local task
    type TaskRow = { id: number; last_modified: string | null }
    let existing: TaskRow | undefined

    if (stableId) {
      existing = db.prepare('SELECT id, last_modified FROM tasks WHERE id = ? AND workspace = ?').get(stableId, workspace) as TaskRow | undefined
    }
    if (!existing) {
      existing = db.prepare('SELECT id, last_modified FROM tasks WHERE sheet_row_id = ? AND workspace = ?').get(rowNum, workspace) as TaskRow | undefined
    }

    if (existing) {
      seenLocalIds.add(existing.id)
      db.prepare('UPDATE tasks SET sheet_row_id = ?, parent_id = ? WHERE id = ?').run(rowNum, parentLocalId, existing.id)

      // Conflict resolution: sheet wins if its last_modified >= local
      let shouldUpdate = false
      if (taskData.last_modified) {
        try {
          const sheetTs = new Date(taskData.last_modified).getTime()
          const localTs = existing.last_modified ? new Date(existing.last_modified).getTime() : 0
          shouldUpdate = sheetTs >= localTs
        } catch { shouldUpdate = true }
      } else {
        shouldUpdate = true
      }

      if (shouldUpdate) {
        db.prepare(`
          UPDATE tasks SET
            title = ?, description = ?,
            status = COALESCE(?, status),
            priority = COALESCE(?, priority),
            due_date = ?, category_id = COALESCE(?, category_id),
            assigned_to = ?, last_modified = ?
          WHERE id = ?
        `).run(
          taskData.title,
          taskData.description,
          taskData.status,
          taskData.priority,
          taskData.due_date,
          categoryId,
          taskData.assigned_to,
          taskData.last_modified ?? now,
          existing.id,
        )
        updated++
      }

      if (!stableId) rowsNeedingId.push({ rowNum, taskId: existing.id })
      return existing.id
    } else {
      // New task from sheet. Prefer inserting with the sheet's own stable id when it's free
      // locally, instead of always letting SQLite autoincrement assign one. Otherwise, on a
      // fresh machine pulling root tasks and subtasks in different passes, autoincrement can
      // hand a task the exact id that ANOTHER row's stable id refers to — and a later row in
      // this same sync would then match that id and silently overwrite the wrong task.
      const maxOrder = (db.prepare('SELECT COALESCE(MAX(display_order),0) as m FROM tasks').get() as { m: number }).m
      const idIsFree = stableId !== null && !db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(stableId)

      const result = idIsFree
        ? db.prepare(`
            INSERT INTO tasks (id, title, description, status, priority, due_date,
              category_id, assigned_to, workspace, sheet_row_id, last_modified, display_order, parent_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            stableId,
            taskData.title, taskData.description, taskData.status ?? 'Not Started',
            taskData.priority ?? 'Unprioritized', taskData.due_date, categoryId,
            taskData.assigned_to, workspace, rowNum, taskData.last_modified ?? now,
            maxOrder + 1, parentLocalId,
          )
        : db.prepare(`
            INSERT INTO tasks (title, description, status, priority, due_date,
              category_id, assigned_to, workspace, sheet_row_id, last_modified, display_order, parent_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            taskData.title, taskData.description, taskData.status ?? 'Not Started',
            taskData.priority ?? 'Unprioritized', taskData.due_date, categoryId,
            taskData.assigned_to, workspace, rowNum, taskData.last_modified ?? now,
            maxOrder + 1, parentLocalId,
          )

      const newId = idIsFree ? (stableId as number) : Number(result.lastInsertRowid)
      seenLocalIds.add(newId)
      if (newId !== stableId) rowsNeedingId.push({ rowNum, taskId: newId })
      added++
      return newId
    }
  }

  // ── PULL pass 1: root tasks (rows with no _ParentTaskID) ────────────────
  for (let i = 0; i < sheetRows.length; i++) {
    const rowNum = i + 2  // 1-indexed, row 1 is header
    const row = sheetRows[i]
    if (!row || row.every(c => !c?.trim())) continue
    if (tombstones.has(rowNum)) continue
    if (getParentRaw(row)) continue  // subtask row, handled in pass 2

    const taskIdRaw = taskIdColIndex !== -1 ? (row[taskIdColIndex] ?? '').trim() : ''
    const stableId = taskIdRaw ? parseInt(taskIdRaw, 10) : null

    const finalId = pullOneRow(row, rowNum, null)
    if (finalId !== null && stableId) parentIdRemap.set(stableId, finalId)
  }

  // ── PULL pass 2: subtasks (rows with _ParentTaskID set) ──────────────────
  // Only rows whose parent resolves to an actual root task are accepted — this keeps
  // subtasks one level deep even if a sheet row is manually mis-edited to point at another subtask.
  for (let i = 0; i < sheetRows.length; i++) {
    const rowNum = i + 2
    const row = sheetRows[i]
    if (!row || row.every(c => !c?.trim())) continue
    if (tombstones.has(rowNum)) continue
    const parentRaw = getParentRaw(row)
    if (!parentRaw) continue  // root row, handled in pass 1

    const parentStableId = parseInt(parentRaw, 10)
    if (isNaN(parentStableId)) continue

    let parentLocalId = parentIdRemap.get(parentStableId)
    if (parentLocalId === undefined) {
      const parentRow = db.prepare(
        'SELECT id FROM tasks WHERE id = ? AND workspace = ? AND parent_id IS NULL'
      ).get(parentStableId, workspace) as { id: number } | undefined
      parentLocalId = parentRow?.id
    }
    if (parentLocalId === undefined) continue  // parent missing locally and in this sync — orphaned row, skip

    pullOneRow(row, rowNum, parentLocalId)
  }

  // Write _TaskID back for rows that were missing it
  if (rowsNeedingId.length > 0) {
    const idColLetter = getColumnLetter(freshColumns.indexOf(TASK_ID_COL) + 1)
    const batchData = rowsNeedingId.map(({ rowNum, taskId }) => ({
      range: `${tabName}!${idColLetter}${rowNum}`,
      values: [[String(taskId)]],
    }))
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: 'RAW', data: batchData },
      })
    } catch { /* non-critical */ }
  }

  // Delete local tasks that disappeared from the sheet (and have a sheet_row_id = were synced).
  // Covers both root tasks and subtasks; deleting a root also cascades to its subtasks locally,
  // same as a manual delete in the app, since parent_id has no ON DELETE CASCADE.
  type SyncedTask = { id: number }
  const syncedTasks = db.prepare(
    'SELECT id FROM tasks WHERE workspace = ? AND sheet_row_id IS NOT NULL'
  ).all(workspace) as SyncedTask[]

  for (const { id } of syncedTasks) {
    if (!seenLocalIds.has(id)) {
      db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(id)
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      deleted++
    }
  }

  // ── PUSH: local DB → sheet ───────────────────────────────────────────────
  type DbTask = {
    id: number; title: string; description: string | null; status: string
    priority: string; due_date: string | null; category_name: string | null
    assigned_to: string | null; last_modified: string | null; sheet_row_id: number | null
    parent_id: number | null
  }
  // Root tasks first, each immediately followed by its own subtasks, for a readable sheet layout.
  const localTasks = db.prepare(`
    SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
           c.name as category_name, t.assigned_to, t.last_modified, t.sheet_row_id, t.parent_id
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.workspace = ?
    ORDER BY COALESCE(t.parent_id, t.id), (t.parent_id IS NOT NULL), t.display_order, t.id
  `).all(workspace) as DbTask[]

  // Read current sheet to know existing row count
  const existingSheet = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A2:${getColumnLetter(freshColumns.length)}`,
  })
  const existingRows = existingSheet.data.values ?? []
  let nextRow = existingRows.length + 2

  const updateBatch: Array<{ range: string; values: string[][] }> = []
  const newRows: string[][] = []
  let pushed = 0, pushedNew = 0

  const idColLetter = getColumnLetter(freshColumns.indexOf(TASK_ID_COL) + 1)
  const taskIdIdx = freshColumns.indexOf(TASK_ID_COL)

  for (const task of localTasks) {
    const row = taskToRow(task as Record<string, unknown>, freshColumns, mapping, task.category_name, taskIdIdx)
    if (parentIdColIndex !== -1) row[parentIdColIndex] = task.parent_id ? String(task.parent_id) : ''

    if (task.sheet_row_id) {
      // Update existing row
      updateBatch.push({
        range: `${tabName}!A${task.sheet_row_id}:${getColumnLetter(freshColumns.length)}${task.sheet_row_id}`,
        values: [row],
      })
      pushed++
    } else {
      // Append new row
      newRows.push(row)
      db.prepare('UPDATE tasks SET sheet_row_id = ? WHERE id = ?').run(nextRow, task.id)
      nextRow++
      pushedNew++
    }
  }

  if (updateBatch.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updateBatch },
    })
  }
  if (newRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A2`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows },
    })
  }

  // Delete sheet rows for tombstoned tasks
  // (rows where the task no longer exists locally and has a tombstone)
  // For simplicity: clear tombstones after push (they've been accounted for)
  db.prepare('DELETE FROM sync_tombstones WHERE workspace = ?').run(workspace)

  // Update last_sync
  db.prepare(`
    INSERT INTO sync_settings (workspace, last_sync)
    VALUES (?, ?)
    ON CONFLICT(workspace) DO UPDATE SET last_sync = excluded.last_sync
  `).run(workspace, now)

  return { added, updated, deleted, pushed, pushedNew, deletedFromSheet: 0 }
}
