import { useState, useEffect } from 'react'
import { X, Plus, Trash2, FolderOpen, Download, Upload, Check, RefreshCw, Pencil, ChevronDown } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import type { Category, Priority, Status, DisplaySettings } from '../../types'

const WS_COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#6b7280']

interface SettingsPanelProps {
  onClose: () => void
  onOpenSync: () => void
}

const CHIP_OPTIONS: Array<{ key: keyof DisplaySettings; label: string }> = [
  { key: 'showCategory',  label: 'Category' },
  { key: 'showDueDate',   label: 'Due date' },
  { key: 'showStatus',    label: 'Status' },
  { key: 'showPriority',  label: 'Priority' },
  { key: 'showLinks',     label: 'Links' },
]

type LookupSection = 'cat' | 'pri' | 'sta'
type EditingLookup = { section: LookupSection; id: number; name: string } | null

interface LookupListProps {
  items: { id: number; name: string; color: string | null }[]
  editingId: number | null
  editingName: string
  onStartEdit: (id: number, name: string) => void
  onEditNameChange: (v: string) => void
  onSaveName: () => void
  onCancelEdit: () => void
  onColorChange: (id: number, color: string) => void
  onDelete: (id: number) => void
  error: string
  newName: string
  newColor: string
  onNewNameChange: (v: string) => void
  onNewColorChange: (c: string) => void
  onAdd: () => void
}

function LookupList({
  items, editingId, editingName, onStartEdit, onEditNameChange, onSaveName, onCancelEdit,
  onColorChange, onDelete, error, newName, newColor, onNewNameChange, onNewColorChange, onAdd,
}: LookupListProps) {
  return (
    <>
      <div className="space-y-1.5 mb-3">
        {items.map((item) => (
          <div key={item.id} className="group">
            <div className="flex items-center gap-2">
              {editingId === item.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  onBlur={onSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveName()
                    if (e.key === 'Escape') onCancelEdit()
                  }}
                  className="flex-1 bg-neutral-800 text-neutral-200 text-sm rounded px-2 py-0.5 border border-neutral-600 focus:outline-none focus:border-neutral-400"
                />
              ) : (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color ?? '#6b7280' }}
                  />
                  <span className="flex-1 text-sm text-neutral-300">{item.name}</span>
                  <button
                    onClick={() => onStartEdit(item.id, item.name)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-neutral-400 rounded transition-all"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-red-400 rounded transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
            {editingId !== item.id && (
              <div className="flex gap-1 mt-1 pl-4 opacity-0 group-hover:opacity-100 transition-opacity h-0 group-hover:h-auto overflow-hidden">
                {WS_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => onColorChange(item.id, c)}
                    className={`w-3 h-3 rounded-full transition-transform hover:scale-125 ${item.color === c ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-900' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="flex gap-2 items-center">
        <input
          placeholder="New name"
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          className="flex-1 bg-neutral-800 text-neutral-300 placeholder-neutral-600 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
        />
        <div className="flex gap-1">
          {WS_COLORS.slice(0, 4).map((c) => (
            <button
              key={c}
              onClick={() => onNewColorChange(c)}
              className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${newColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-900' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={onAdd}
          disabled={!newName.trim()}
          className="px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-neutral-300 rounded-md text-sm transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
    </>
  )
}

export function SettingsPanel({ onClose, onOpenSync }: SettingsPanelProps) {
  const {
    activeWorkspace,
    categories: storeCats, setCategories,
    priorities: storePris, setPriorities,
    statuses: storeStas, setStatuses,
    workspaces, setWorkspaces,
    displaySettings, setDisplaySettings,
  } = useStore()
  const { refresh } = useTasks()

  const userWorkspaces = workspaces.filter(ws => ws.name !== 'current_tasks')

  // Independent workspace selector for the settings panel
  const [settingsWorkspace, setSettingsWorkspace] = useState<string>(() => {
    if (activeWorkspace !== 'current_tasks') return activeWorkspace
    return userWorkspaces[0]?.name ?? 'home'
  })

  // Local lookup data for the selected settings workspace
  const [localCats, setLocalCats] = useState<Category[]>([])
  const [localPris, setLocalPris] = useState<Priority[]>([])
  const [localStats, setLocalStats] = useState<Status[]>([])

  useEffect(() => {
    Promise.all([
      window.api.categories.list(settingsWorkspace),
      window.api.lookups.priorities(settingsWorkspace),
      window.api.lookups.statuses(settingsWorkspace),
    ]).then(([cats, pris, stats]) => {
      setLocalCats(cats)
      setLocalPris(pris)
      setLocalStats(stats)
      // Keep global store in sync when viewing the active workspace
      if (settingsWorkspace === activeWorkspace) {
        setCategories(cats)
        setPriorities(pris)
        setStatuses(stats)
      }
    })
  }, [settingsWorkspace]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shared inline-edit state for categories/priorities/statuses
  const [editingLookup, setEditingLookup] = useState<EditingLookup>(null)
  const [catError, setCatError] = useState('')
  const [priError, setPriError] = useState('')
  const [staError, setStaError] = useState('')

  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(WS_COLORS[0])
  const [newPriName, setNewPriName] = useState('')
  const [newPriColor, setNewPriColor] = useState(WS_COLORS[0])
  const [newStaName, setNewStaName] = useState('')
  const [newStaColor, setNewStaColor] = useState(WS_COLORS[4])

  // Workspace state
  const [newWsName, setNewWsName] = useState('')
  const [newWsColor, setNewWsColor] = useState(WS_COLORS[0])
  const [editingWsId, setEditingWsId] = useState<number | null>(null)
  const [editingWsName, setEditingWsName] = useState('')
  const [wsError, setWsError] = useState('')

  const [dbPath, setDbPath] = useState<string>('')
  const [csvStatus, setCsvStatus] = useState<string>('')

  useEffect(() => {
    window.api.settings.get('database_path').then((p) => setDbPath(String(p ?? '')))
  }, [])

  // ── Refresh helpers (local + global store sync) ──────────────────────────────
  const refreshCategories = async () => {
    const cats = await window.api.categories.list(settingsWorkspace)
    setLocalCats(cats)
    if (settingsWorkspace === activeWorkspace) setCategories(cats)
  }
  const refreshPriorities = async () => {
    const pris = await window.api.lookups.priorities(settingsWorkspace)
    setLocalPris(pris)
    if (settingsWorkspace === activeWorkspace) setPriorities(pris)
  }
  const refreshStatuses = async () => {
    const stats = await window.api.lookups.statuses(settingsWorkspace)
    setLocalStats(stats)
    if (settingsWorkspace === activeWorkspace) setStatuses(stats)
  }
  const refreshWorkspaces = async () => setWorkspaces(await window.api.lookups.workspaces())

  // ── Shared lookup name-edit handlers ────────────────────────────────────────
  const handleStartEdit = (section: LookupSection, id: number, name: string) =>
    setEditingLookup({ section, id, name })

  const handleSaveLookupName = async () => {
    if (!editingLookup) return
    const { section, id, name } = editingLookup
    const trimmed = name.trim()
    setEditingLookup(null)
    if (!trimmed) return
    if (section === 'cat') {
      await window.api.categories.update(id, { name: trimmed })
      await refreshCategories()
    } else if (section === 'pri') {
      await window.api.priorities.update(id, { name: trimmed })
      await refreshPriorities()
    } else {
      await window.api.statuses.update(id, { name: trimmed })
      await refreshStatuses()
    }
  }

  // ── Category handlers ────────────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    await window.api.categories.create({ name: newCatName.trim(), color: newCatColor, workspace: settingsWorkspace })
    await refreshCategories()
    setNewCatName('')
  }

  const handleDeleteCategory = async (id: number) => {
    setCatError('')
    await window.api.categories.delete(id)
    await refreshCategories()
  }

  const handleColorCategory = async (id: number, color: string) => {
    await window.api.categories.update(id, { color })
    await refreshCategories()
  }

  // ── Priority handlers ────────────────────────────────────────────────────────
  const handleAddPriority = async () => {
    if (!newPriName.trim()) return
    await window.api.priorities.create({ name: newPriName.trim(), color: newPriColor, workspace: settingsWorkspace })
    await refreshPriorities()
    setNewPriName('')
  }

  const handleDeletePriority = async (id: number) => {
    setPriError('')
    const result = await window.api.priorities.delete(id)
    if (!result.ok) {
      setPriError(result.reason ?? 'Cannot delete')
    } else {
      await refreshPriorities()
    }
  }

  const handleColorPriority = async (id: number, color: string) => {
    await window.api.priorities.update(id, { color })
    await refreshPriorities()
  }

  // ── Status handlers ──────────────────────────────────────────────────────────
  const handleAddStatus = async () => {
    if (!newStaName.trim()) return
    await window.api.statuses.create({ name: newStaName.trim(), color: newStaColor, workspace: settingsWorkspace })
    await refreshStatuses()
    setNewStaName('')
  }

  const handleDeleteStatus = async (id: number) => {
    setStaError('')
    const result = await window.api.statuses.delete(id)
    if (!result.ok) {
      setStaError(result.reason ?? 'Cannot delete')
    } else {
      await refreshStatuses()
    }
  }

  const handleColorStatus = async (id: number, color: string) => {
    await window.api.statuses.update(id, { color })
    await refreshStatuses()
  }

  // ── Workspace handlers ───────────────────────────────────────────────────────
  const handleAddWorkspace = async () => {
    if (!newWsName.trim()) return
    await window.api.workspaces.create({ display_name: newWsName.trim(), color: newWsColor })
    await refreshWorkspaces()
    setNewWsName('')
    setNewWsColor(WS_COLORS[0])
  }

  const handleRenameWorkspace = async (id: number) => {
    if (!editingWsName.trim()) { setEditingWsId(null); return }
    await window.api.workspaces.update(id, { display_name: editingWsName.trim() })
    await refreshWorkspaces()
    setEditingWsId(null)
  }

  const handleColorWorkspace = async (id: number, color: string) => {
    await window.api.workspaces.update(id, { color })
    await refreshWorkspaces()
  }

  const handleDeleteWorkspace = async (id: number) => {
    setWsError('')
    const result = await window.api.workspaces.delete(id)
    if (!result.ok) {
      setWsError(result.reason ?? 'Cannot delete workspace')
    } else {
      await refreshWorkspaces()
    }
  }

  // ── Display settings ─────────────────────────────────────────────────────────
  const updateDisplay = async (patch: Partial<DisplaySettings>) => {
    const next = { ...displaySettings, ...patch }
    setDisplaySettings(next)
    await window.api.settings.set('display_settings', JSON.stringify(next))
  }

  // ── Data handlers ────────────────────────────────────────────────────────────
  const handleChangeDb = async () => {
    const path = await window.api.dialog.openDb()
    if (path) {
      await window.api.settings.set('database_path', path)
      setDbPath(path)
      alert('Database path saved. Please restart the app to use the new database.')
    }
  }

  const handleExportCsv = async () => {
    const savePath = await window.api.dialog.saveCsv()
    if (!savePath) return
    const csvContent = await window.api.csv.export()
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = savePath.split('/').pop() ?? 'tasks.csv'
    a.click()
    URL.revokeObjectURL(url)
    setCsvStatus('Exported successfully')
    setTimeout(() => setCsvStatus(''), 3000)
  }

  const handleImportCsv = async () => {
    const filePath = await window.api.dialog.openCsv()
    if (!filePath) return
    const result = await window.api.csv.import(filePath)
    await refresh()
    setCsvStatus(`Imported ${result.imported} task${result.imported === 1 ? '' : 's'}`)
    setTimeout(() => setCsvStatus(''), 4000)
  }

  // Derived editing state per section
  const catEditing = editingLookup?.section === 'cat' ? editingLookup : null
  const priEditing = editingLookup?.section === 'pri' ? editingLookup : null
  const staEditing = editingLookup?.section === 'sta' ? editingLookup : null

  // Suppress unused vars from store (still needed if active workspace matches)
  void storeCats; void storePris; void storeStas

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-200">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">

          {/* Workspace selector */}
          {userWorkspaces.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 shrink-0">Workspace</span>
              <div className="relative flex-1">
                <select
                  value={settingsWorkspace}
                  onChange={(e) => {
                    setEditingLookup(null)
                    setSettingsWorkspace(e.target.value)
                  }}
                  className="w-full appearance-none bg-neutral-800 text-neutral-200 text-sm rounded-md pl-3 pr-8 py-1.5 border border-neutral-700 focus:outline-none focus:border-neutral-500 cursor-pointer"
                >
                  {userWorkspaces.map((ws) => (
                    <option key={ws.name} value={ws.name}>{ws.display_name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Categories */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Categories</h3>
            <LookupList
              items={localCats}
              editingId={catEditing?.id ?? null}
              editingName={catEditing?.name ?? ''}
              onStartEdit={(id, name) => handleStartEdit('cat', id, name)}
              onEditNameChange={(v) => editingLookup && setEditingLookup({ ...editingLookup, name: v })}
              onSaveName={handleSaveLookupName}
              onCancelEdit={() => setEditingLookup(null)}
              onColorChange={handleColorCategory}
              onDelete={handleDeleteCategory}
              error={catError}
              newName={newCatName}
              newColor={newCatColor}
              onNewNameChange={setNewCatName}
              onNewColorChange={setNewCatColor}
              onAdd={handleAddCategory}
            />
          </section>

          {/* Priorities */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Priorities</h3>
            <LookupList
              items={localPris}
              editingId={priEditing?.id ?? null}
              editingName={priEditing?.name ?? ''}
              onStartEdit={(id, name) => handleStartEdit('pri', id, name)}
              onEditNameChange={(v) => editingLookup && setEditingLookup({ ...editingLookup, name: v })}
              onSaveName={handleSaveLookupName}
              onCancelEdit={() => setEditingLookup(null)}
              onColorChange={handleColorPriority}
              onDelete={handleDeletePriority}
              error={priError}
              newName={newPriName}
              newColor={newPriColor}
              onNewNameChange={setNewPriName}
              onNewColorChange={setNewPriColor}
              onAdd={handleAddPriority}
            />
          </section>

          {/* Statuses */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Statuses</h3>
            <p className="text-xs text-neutral-600 mb-2">
              Completed, Backlog, and Not Started are system statuses used for tab grouping.
            </p>
            <LookupList
              items={localStats}
              editingId={staEditing?.id ?? null}
              editingName={staEditing?.name ?? ''}
              onStartEdit={(id, name) => handleStartEdit('sta', id, name)}
              onEditNameChange={(v) => editingLookup && setEditingLookup({ ...editingLookup, name: v })}
              onSaveName={handleSaveLookupName}
              onCancelEdit={() => setEditingLookup(null)}
              onColorChange={handleColorStatus}
              onDelete={handleDeleteStatus}
              error={staError}
              newName={newStaName}
              newColor={newStaColor}
              onNewNameChange={setNewStaName}
              onNewColorChange={setNewStaColor}
              onAdd={handleAddStatus}
            />
          </section>

          {/* Workspaces */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Workspaces</h3>
            <div className="space-y-1.5 mb-3">
              {userWorkspaces.map((ws) => (
                <div key={ws.id} className="group">
                  <div className="flex items-center gap-2">
                    {editingWsId === ws.id ? (
                      <input
                        autoFocus
                        value={editingWsName}
                        onChange={(e) => setEditingWsName(e.target.value)}
                        onBlur={() => handleRenameWorkspace(ws.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameWorkspace(ws.id)
                          if (e.key === 'Escape') setEditingWsId(null)
                        }}
                        className="flex-1 bg-neutral-800 text-neutral-200 text-sm rounded px-2 py-0.5 border border-neutral-600 focus:outline-none focus:border-neutral-400"
                      />
                    ) : (
                      <>
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ws.color ?? '#6b7280' }}
                        />
                        <span className="flex-1 text-sm text-neutral-300">{ws.display_name}</span>
                        <button
                          onClick={() => { setEditingWsId(ws.id); setEditingWsName(ws.display_name) }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-neutral-400 rounded transition-all"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteWorkspace(ws.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-red-400 rounded transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1 mt-1 pl-4 opacity-0 group-hover:opacity-100 transition-opacity h-0 group-hover:h-auto overflow-hidden">
                    {WS_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleColorWorkspace(ws.id, c)}
                        className={`w-3 h-3 rounded-full transition-transform hover:scale-125 ${ws.color === c ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-900' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {wsError && <p className="text-xs text-red-400 mb-2">{wsError}</p>}
            <div className="flex gap-2 items-center">
              <input
                placeholder="New workspace name"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspace()}
                className="flex-1 bg-neutral-800 text-neutral-300 placeholder-neutral-600 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
              />
              <div className="flex gap-1">
                {WS_COLORS.slice(0, 4).map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewWsColor(c)}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${newWsColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-neutral-900' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                onClick={handleAddWorkspace}
                disabled={!newWsName.trim()}
                className="px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-neutral-300 rounded-md text-sm transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </section>

          {/* Row Display */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Row Display</h3>

            <div className="mb-4">
              <p className="text-xs text-neutral-600 mb-2">Left accent</p>
              <div className="flex gap-1 bg-neutral-800 rounded-md p-1">
                {(['none', 'border', 'badge'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => updateDisplay({ accent: v })}
                    className={`flex-1 py-1 rounded text-xs transition-colors capitalize ${
                      displaySettings.accent === v
                        ? 'bg-neutral-700 text-neutral-200 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs text-neutral-600 mb-2">Right metadata</p>
              <div className="space-y-0">
                {CHIP_OPTIONS.map(({ key, label }) => {
                  const isOn = displaySettings[key] as boolean
                  return (
                    <div key={key} className="flex items-center justify-between py-1.5 border-t border-neutral-800 first:border-t-0">
                      <span className={`text-sm transition-colors ${isOn ? 'text-neutral-300' : 'text-neutral-600'}`}>
                        {label}
                      </span>
                      <button
                        onClick={() => updateDisplay({ [key]: !isOn })}
                        className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                          isOn ? 'bg-blue-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                            isOn ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs text-neutral-600 mb-2">Badge style <span className="text-neutral-700">— status &amp; priority</span></p>
              <div className="flex gap-1 bg-neutral-800 rounded-md p-1">
                {(['text', 'pill'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => updateDisplay({ badgeStyle: v })}
                    className={`flex-1 py-1 rounded text-xs transition-colors capitalize ${
                      displaySettings.badgeStyle === v
                        ? 'bg-neutral-700 text-neutral-200 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Data */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Data</h3>
            <div className="flex gap-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors"
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={handleImportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors"
              >
                <Upload size={14} /> Import CSV
              </button>
            </div>
            {csvStatus && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-green-400">
                <Check size={12} /> {csvStatus}
              </div>
            )}
            <p className="text-xs text-neutral-600 mt-2">
              CSV columns: title, description, status, priority, due_date, category, completed_at, workspace
            </p>
          </section>

          {/* Google Sheets Sync */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Google Sheets Sync</h3>
            <button
              onClick={onOpenSync}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors"
            >
              <RefreshCw size={14} /> Configure Sync…
            </button>
          </section>

          {/* Database */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-3">Database</h3>
            <div className="bg-neutral-800 rounded-md px-3 py-2 text-xs text-neutral-500 font-mono mb-2 truncate">
              {dbPath || 'Using default location'}
            </div>
            <button
              onClick={handleChangeDb}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors"
            >
              <FolderOpen size={14} /> Change database file…
            </button>
            <p className="text-xs text-neutral-600 mt-2">
              You can point this to your existing task_organizer.db from the PyQt6 app — the schema is identical.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
