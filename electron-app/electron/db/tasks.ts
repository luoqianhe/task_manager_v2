import { ipcMain } from 'electron'
import { getDb } from './database'

export function registerTaskHandlers() {
  // List tasks by filter: 'current' | 'backlog' | 'completed', scoped to a workspace
  ipcMain.handle('tasks:list', (_event, filter: string, workspace = 'home') => {
    const db = getDb()
    let filterClause = ''
    if (filter === 'current') {
      filterClause = `AND t.status NOT IN ('Backlog', 'Completed')`
    } else if (filter === 'backlog') {
      filterClause = `AND t.status = 'Backlog'`
    } else if (filter === 'completed') {
      filterClause = `AND t.status = 'Completed'`
    }

    if (workspace === 'current_tasks') {
      return db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color,
               p.title as parent_title,
               (SELECT COUNT(*) FROM files WHERE task_id = t.id) as attachment_count,
               1 as is_pinned
        FROM tasks t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN tasks p ON t.parent_id = p.id
        WHERE (t.id IN (SELECT task_id FROM pinned_tasks)
               OR t.parent_id IN (SELECT task_id FROM pinned_tasks))
        ${filterClause}
        ORDER BY t.display_order ASC, t.id ASC
      `).all()
    }

    return db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color,
             p.title as parent_title,
             (SELECT COUNT(*) FROM files WHERE task_id = t.id) as attachment_count,
             (CASE WHEN EXISTS(SELECT 1 FROM pinned_tasks WHERE task_id = t.id) THEN 1 ELSE 0 END) as is_pinned
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN tasks p ON t.parent_id = p.id
      WHERE t.workspace = ?
      ${filterClause}
      ORDER BY t.display_order ASC, t.id ASC
    `).all(workspace)
  })

  // Get a single task with its links
  ipcMain.handle('tasks:get', (_event, id: number) => {
    const db = getDb()
    const task = db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color,
             p.title as parent_title
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN tasks p ON t.parent_id = p.id
      WHERE t.id = ?
    `).get(id)

    const links = db.prepare(
      'SELECT * FROM links WHERE task_id = ? ORDER BY display_order'
    ).all(id)

    return { ...task as object, links }
  })

  // Create a task
  ipcMain.handle('tasks:create', (_event, data: Record<string, unknown>) => {
    const db = getDb()
    const now = new Date().toISOString()

    const maxOrder = (db.prepare(
      'SELECT COALESCE(MAX(display_order), 0) as m FROM tasks'
    ).get() as { m: number }).m

    const result = db.prepare(`
      INSERT INTO tasks (title, description, status, priority, due_date, category_id,
                         parent_id, display_order, completed_at, workspace, last_modified)
      VALUES (@title, @description, @status, @priority, @due_date, @category_id,
              @parent_id, @display_order, @completed_at, @workspace, @last_modified)
    `).run({
      title: data.title || '',
      description: data.description || null,
      status: data.status || 'Not Started',
      priority: data.priority || 'Unprioritized',
      due_date: data.due_date || null,
      category_id: data.category_id || null,
      parent_id: data.parent_id || null,
      display_order: maxOrder + 1,
      completed_at: data.status === 'Completed' ? now : null,
      workspace: data.workspace || 'home',
      last_modified: now,
    })

    // Insert links if provided
    if (Array.isArray(data.links)) {
      const insertLink = db.prepare(
        'INSERT INTO links (task_id, url, label, display_order) VALUES (?, ?, ?, ?)'
      )
      ;(data.links as Array<{ url: string; label?: string }>).forEach((link, i) => {
        if (link.url) insertLink.run(result.lastInsertRowid, link.url, link.label || '', i)
      })
    }

    return result.lastInsertRowid
  })

  // Update a task
  ipcMain.handle('tasks:update', (_event, id: number, data: Record<string, unknown>) => {
    const db = getDb()
    const now = new Date().toISOString()

    // Set completed_at when transitioning to Completed
    const existing = db.prepare('SELECT status, completed_at FROM tasks WHERE id = ?').get(id) as
      | { status: string; completed_at: string | null }
      | undefined

    let completedAt = existing?.completed_at ?? null
    if (data.status === 'Completed' && existing?.status !== 'Completed') {
      completedAt = now
    } else if (data.status !== 'Completed') {
      completedAt = null
    }

    db.prepare(`
      UPDATE tasks SET
        title = COALESCE(@title, title),
        description = @description,
        status = COALESCE(@status, status),
        priority = COALESCE(@priority, priority),
        due_date = @due_date,
        category_id = @category_id,
        parent_id = @parent_id,
        completed_at = @completed_at,
        workspace = COALESCE(@workspace, workspace),
        last_modified = @last_modified
      WHERE id = @id
    `).run({
      id,
      title: data.title ?? null,
      description: data.description ?? null,
      status: data.status ?? null,
      priority: data.priority ?? null,
      due_date: data.due_date ?? null,
      category_id: data.category_id ?? null,
      parent_id: data.parent_id ?? null,
      completed_at: completedAt,
      workspace: data.workspace ?? null,
      last_modified: now,
    })

    // Replace links if provided
    if (Array.isArray(data.links)) {
      db.prepare('DELETE FROM links WHERE task_id = ?').run(id)
      const insertLink = db.prepare(
        'INSERT INTO links (task_id, url, label, display_order) VALUES (?, ?, ?, ?)'
      )
      ;(data.links as Array<{ url: string; label?: string }>).forEach((link, i) => {
        if (link.url) insertLink.run(id, link.url, link.label || '', i)
      })
    }

    return true
  })

  // Task counts for all tabs, scoped to a workspace
  ipcMain.handle('tasks:counts', (_event, workspace = 'home') => {
    const db = getDb()

    if (workspace === 'current_tasks') {
      const row = db.prepare(`
        SELECT
          SUM(CASE WHEN t.status NOT IN ('Backlog','Completed') THEN 1 ELSE 0 END) as current,
          SUM(CASE WHEN t.status = 'Backlog' THEN 1 ELSE 0 END) as backlog,
          SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed
        FROM tasks t
        WHERE t.id IN (SELECT task_id FROM pinned_tasks)
      `).get() as { current: number; backlog: number; completed: number }
      return { current: row.current ?? 0, backlog: row.backlog ?? 0, completed: row.completed ?? 0 }
    }

    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status NOT IN ('Backlog','Completed') THEN 1 ELSE 0 END) as current,
        SUM(CASE WHEN status = 'Backlog' THEN 1 ELSE 0 END) as backlog,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE workspace = ?
    `).get(workspace) as { current: number; backlog: number; completed: number }
    return { current: row.current ?? 0, backlog: row.backlog ?? 0, completed: row.completed ?? 0 }
  })

  // Pin / unpin a task to Current Tasks
  ipcMain.handle('tasks:pin', (_event, taskId: number) => {
    getDb().prepare('INSERT OR IGNORE INTO pinned_tasks (task_id) VALUES (?)').run(taskId)
    return true
  })

  ipcMain.handle('tasks:unpin', (_event, taskId: number) => {
    getDb().prepare('DELETE FROM pinned_tasks WHERE task_id = ?').run(taskId)
    return true
  })

  // Delete a task (and its subtasks, since parent_id FK has no CASCADE)
  ipcMain.handle('tasks:delete', (_event, id: number) => {
    const db = getDb()
    db.transaction(() => {
      db.prepare('DELETE FROM tasks WHERE parent_id = ?').run(id)
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    })()
    return true
  })

  // Reorder / reparent a task: renumber display_order for the destination
  // sibling scope, and optionally change the moved task's parent_id/priority.
  ipcMain.handle('tasks:reorder', (_event, payload: {
    movedId: number
    parentId: number | null
    priority?: string
    orderedIds: number[]
  }) => {
    const db = getDb()
    const { movedId, parentId, priority, orderedIds } = payload

    if (!orderedIds.includes(movedId)) {
      return { ok: false, reason: 'orderedIds must include movedId' }
    }

    if (parentId !== null) {
      const target = db.prepare('SELECT id, parent_id FROM tasks WHERE id = ?').get(parentId) as
        | { id: number; parent_id: number | null }
        | undefined
      if (!target) return { ok: false, reason: 'target task not found' }
      if (target.parent_id !== null) return { ok: false, reason: 'cannot nest under a subtask' }
      if (parentId === movedId) return { ok: false, reason: 'cannot parent a task to itself' }

      const currentParent = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(movedId) as
        | { parent_id: number | null }
        | undefined
      if (currentParent?.parent_id !== parentId) {
        const hasChildren = db.prepare('SELECT 1 FROM tasks WHERE parent_id = ? LIMIT 1').get(movedId)
        if (hasChildren) return { ok: false, reason: 'cannot reparent a task that has its own subtasks' }
      }
    }

    const now = new Date().toISOString()

    db.transaction(() => {
      db.prepare(`
        UPDATE tasks SET parent_id = @parentId, priority = COALESCE(@priority, priority), last_modified = @now
        WHERE id = @movedId
      `).run({ movedId, parentId, priority: priority ?? null, now })

      const stmt = db.prepare('UPDATE tasks SET display_order = ? WHERE id = ?')
      orderedIds.forEach((id, i) => stmt.run(i * 10, id))
    })()

    return { ok: true }
  })

  // Links
  ipcMain.handle('links:list', (_event, taskId: number) => {
    return getDb().prepare(
      'SELECT * FROM links WHERE task_id = ? ORDER BY display_order'
    ).all(taskId)
  })

  ipcMain.handle('links:create', (_event, data: Record<string, unknown>) => {
    const result = getDb().prepare(
      'INSERT INTO links (task_id, url, label, display_order) VALUES (?, ?, ?, ?)'
    ).run(data.task_id, data.url, data.label || '', data.display_order || 0)
    return result.lastInsertRowid
  })

  ipcMain.handle('links:update', (_event, id: number, data: Record<string, unknown>) => {
    getDb().prepare(
      'UPDATE links SET url = ?, label = ? WHERE id = ?'
    ).run(data.url, data.label, id)
    return true
  })

  ipcMain.handle('links:delete', (_event, id: number) => {
    getDb().prepare('DELETE FROM links WHERE id = ?').run(id)
    return true
  })
}
