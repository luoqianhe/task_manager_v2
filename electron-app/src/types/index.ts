export interface Task {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  category_id: number | null
  category_name: string | null
  category_color: string | null
  parent_id: number | null
  parent_title: string | null
  display_order: number
  completed_at: string | null
  workspace: string
  is_pinned?: number
  attachment_count?: number
  links?: Link[]
}

export interface Attachment {
  id: number
  task_id: number
  file_path: string
  file_name: string
  display_order: number
  drive_file_id: string | null
}

export interface Link {
  id: number
  task_id: number
  url: string
  label: string
  display_order: number
}

export interface Category {
  id: number
  name: string
  color: string
}

export interface Priority {
  id: number
  name: string
  color: string
  display_order: number
}

export interface Status {
  id: number
  name: string
  color: string
  display_order: number
}

export interface Workspace {
  id: number
  name: string
  display_name: string
  color: string
  display_order: number
}

export type TabType = 'current' | 'backlog' | 'completed'

export interface ReorderPayload {
  movedId: number
  parentId: number | null
  priority?: string
  orderedIds: number[]
}

export interface TaskFormData {
  title: string
  description: string
  status: string
  priority: string
  due_date: string
  category_id: number | null
  parent_id: number | null
  workspace?: string
  links: Array<{ url: string; label: string }>
}

// Window API type
declare global {
  interface Window {
    api: {
      tasks: {
        list: (filter: string, workspace: string) => Promise<Task[]>
        get: (id: number) => Promise<Task & { links: Link[] }>
        create: (data: Partial<TaskFormData>) => Promise<number>
        update: (id: number, data: Partial<TaskFormData & { status: string; completed_at?: string }>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
        reorder: (payload: ReorderPayload) => Promise<{ ok: boolean; reason?: string }>
        counts: (workspace: string) => Promise<{ current: number; backlog: number; completed: number }>
        pin: (taskId: number) => Promise<boolean>
        unpin: (taskId: number) => Promise<boolean>
      }
      links: {
        list: (taskId: number) => Promise<Link[]>
        create: (data: Partial<Link>) => Promise<number>
        update: (id: number, data: Partial<Link>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
      }
      categories: {
        list: (workspace: string) => Promise<Category[]>
        create: (data: Partial<Category> & { workspace: string }) => Promise<number>
        update: (id: number, data: Partial<Category>) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
      }
      lookups: {
        priorities: (workspace: string) => Promise<Priority[]>
        statuses: (workspace: string) => Promise<Status[]>
        workspaces: () => Promise<Workspace[]>
      }
      settings: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<boolean>
        getAll: () => Promise<Record<string, unknown>>
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
      dialog: {
        openDb: () => Promise<string | null>
        saveDb: () => Promise<string | null>
        openCsv: () => Promise<string | null>
        saveCsv: () => Promise<string | null>
      }
      csv: {
        export: () => Promise<string>
        import: (filePath: string) => Promise<{ imported: number }>
      }
      sync: {
        openCredentials: () => Promise<string | null>
        isAuthenticated: (workspace: string) => Promise<boolean>
        authenticate: (credentialsPath: string, workspace: string) => Promise<{ ok: boolean; email: string | null }>
        finalizeWorkspace: (displayName: string, credentialsPath: string) => Promise<Workspace>
        revokeAuth: (workspace: string) => Promise<void>
        getSettings: (workspace: string) => Promise<SyncSettings | null>
        saveSettings: (workspace: string, settings: Partial<SyncSettings>) => Promise<{ ok: boolean }>
        detectColumns: (workspace: string) => Promise<{ columns: string[]; mapping: ColumnMapping; isEmpty: boolean }>
        sync: (workspace: string) => Promise<SyncResult>
        autoSync: (workspace: string) => Promise<{ synced: boolean } & Partial<SyncResult>>
      }
      files: {
        list: (taskId: number) => Promise<Attachment[]>
        attach: (taskId: number) => Promise<Attachment[]>
        open: (id: number) => Promise<void>
        reveal: (id: number) => Promise<void>
        delete: (id: number, workspace: string) => Promise<boolean>
        uploadToDrive: (id: number, workspace: string) => Promise<string>
        downloadFromDrive: (id: number, workspace: string) => Promise<string>
        syncDrive: (taskId: number, workspace: string) => Promise<{ uploaded: number; skipped: number }>
      }
      workspaces: {
        create: (data: { display_name: string; color: string }) => Promise<Workspace>
        update: (id: number, data: { display_name?: string; color?: string }) => Promise<boolean>
        delete: (id: number) => Promise<{ ok: boolean; reason?: string }>
      }
      priorities: {
        create: (data: { name: string; color: string; workspace: string }) => Promise<Priority>
        update: (id: number, data: { name?: string; color?: string }) => Promise<boolean>
        delete: (id: number) => Promise<{ ok: boolean; reason?: string }>
      }
      statuses: {
        create: (data: { name: string; color: string; workspace: string }) => Promise<Status>
        update: (id: number, data: { name?: string; color?: string }) => Promise<boolean>
        delete: (id: number) => Promise<{ ok: boolean; reason?: string }>
      }
    }
  }
}

export interface ColumnMapping {
  title: string | null
  description: string | null
  status: string | null
  priority: string | null
  due_date: string | null
  category: string | null
  assigned_to: string | null
  last_modified: string | null
}

export interface SyncSettings {
  workspace: string
  sheet_id: string | null
  sync_tab_name: string
  column_mapping: ColumnMapping | null
  detected_columns: string[]
  credentials_path: string | null
  last_sync: string | null
}

export interface SyncResult {
  added: number
  updated: number
  deleted: number
  pushed: number
  pushedNew: number
  deletedFromSheet: number
}

export interface DisplaySettings {
  accent: 'none' | 'border' | 'badge'
  showCategory: boolean
  showDueDate: boolean
  showStatus: boolean
  showPriority: boolean
  showLinks: boolean
  badgeStyle: 'text' | 'pill'
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  accent: 'none',
  showCategory: true,
  showDueDate: true,
  showStatus: false,
  showPriority: false,
  showLinks: true,
  badgeStyle: 'pill',
}
