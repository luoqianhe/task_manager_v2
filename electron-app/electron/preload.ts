import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Tasks
  tasks: {
    list: (filter: string, workspace: string) => ipcRenderer.invoke('tasks:list', filter, workspace),
    get: (id: number) => ipcRenderer.invoke('tasks:get', id),
    create: (data: unknown) => ipcRenderer.invoke('tasks:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('tasks:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    reorder: (payload: unknown) => ipcRenderer.invoke('tasks:reorder', payload),
    counts: (workspace: string) => ipcRenderer.invoke('tasks:counts', workspace),
    pin: (taskId: number) => ipcRenderer.invoke('tasks:pin', taskId),
    unpin: (taskId: number) => ipcRenderer.invoke('tasks:unpin', taskId),
  },
  // Links
  links: {
    list: (taskId: number) => ipcRenderer.invoke('links:list', taskId),
    create: (data: unknown) => ipcRenderer.invoke('links:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('links:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('links:delete', id),
  },
  // Categories
  categories: {
    list: (workspace: string) => ipcRenderer.invoke('categories:list', workspace),
    create: (data: unknown) => ipcRenderer.invoke('categories:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('categories:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
  },
  // Lookup tables (priorities, statuses, workspaces)
  lookups: {
    priorities: (workspace: string) => ipcRenderer.invoke('lookups:priorities', workspace),
    statuses: (workspace: string) => ipcRenderer.invoke('lookups:statuses', workspace),
    workspaces: () => ipcRenderer.invoke('lookups:workspaces'),
  },
  // Workspace CRUD
  workspaces: {
    create: (data: unknown) => ipcRenderer.invoke('workspaces:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('workspaces:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('workspaces:delete', id),
  },
  // Priority CRUD
  priorities: {
    create: (data: { name: string; color: string; workspace: string }) => ipcRenderer.invoke('lookups:priorities:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('lookups:priorities:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('lookups:priorities:delete', id),
  },
  // Status CRUD
  statuses: {
    create: (data: { name: string; color: string; workspace: string }) => ipcRenderer.invoke('lookups:statuses:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('lookups:statuses:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('lookups:statuses:delete', id),
  },
  // App settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  // Shell / dialogs
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  dialog: {
    openDb: () => ipcRenderer.invoke('dialog:openDb'),
    saveDb: () => ipcRenderer.invoke('dialog:saveDb'),
    openCsv: () => ipcRenderer.invoke('dialog:openCsv'),
    saveCsv: () => ipcRenderer.invoke('dialog:saveCsv'),
  },
  csv: {
    export: () => ipcRenderer.invoke('csv:export'),
    import: (filePath: string) => ipcRenderer.invoke('csv:import', filePath),
  },
  sync: {
    openCredentials: () => ipcRenderer.invoke('sync:openCredentials'),
    isAuthenticated: (workspace: string) => ipcRenderer.invoke('sync:isAuthenticated', workspace),
    authenticate: (credentialsPath: string, workspace: string) => ipcRenderer.invoke('sync:authenticate', credentialsPath, workspace),
    finalizeWorkspace: (displayName: string, credentialsPath: string) => ipcRenderer.invoke('sync:finalizeWorkspace', displayName, credentialsPath),
    revokeAuth: (workspace: string) => ipcRenderer.invoke('sync:revokeAuth', workspace),
    getSettings: (workspace: string) => ipcRenderer.invoke('sync:getSettings', workspace),
    saveSettings: (workspace: string, settings: unknown) => ipcRenderer.invoke('sync:saveSettings', workspace, settings),
    detectColumns: (workspace: string) => ipcRenderer.invoke('sync:detectColumns', workspace),
    sync: (workspace: string) => ipcRenderer.invoke('sync:sync', workspace),
    autoSync: (workspace: string) => ipcRenderer.invoke('sync:autoSync', workspace),
  },
  files: {
    list: (taskId: number) => ipcRenderer.invoke('files:list', taskId),
    attach: (taskId: number) => ipcRenderer.invoke('files:attach', taskId),
    open: (id: number) => ipcRenderer.invoke('files:open', id),
    reveal: (id: number) => ipcRenderer.invoke('files:reveal', id),
    delete: (id: number, workspace: string) => ipcRenderer.invoke('files:delete', id, workspace),
    uploadToDrive: (id: number, workspace: string) => ipcRenderer.invoke('files:uploadToDrive', id, workspace),
    downloadFromDrive: (id: number, workspace: string) => ipcRenderer.invoke('files:downloadFromDrive', id, workspace),
    syncDrive: (taskId: number, workspace: string) => ipcRenderer.invoke('files:syncDrive', taskId, workspace),
  },
})
