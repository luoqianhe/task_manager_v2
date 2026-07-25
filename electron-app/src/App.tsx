import { useEffect, useState } from 'react'
import { useStore } from './hooks/useStore'
import { Sidebar } from './components/layout/Sidebar'
import { TaskList } from './components/layout/TaskList'
import { TaskDetail } from './components/layout/TaskDetail'
import { AddTaskModal } from './components/tasks/AddTaskModal'
import { SettingsPanel } from './components/layout/SettingsPanel'
import { SyncPanel } from './components/sync/SyncPanel'
import { DEFAULT_DISPLAY_SETTINGS } from './types'

export default function App() {
  const {
    activeWorkspace,
    setPriorities, setStatuses, setCategories,
    setWorkspaces, setDisplaySettings,
  } = useStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSync, setShowSync] = useState(false)

  // Load workspace-independent lookups once on mount
  useEffect(() => {
    Promise.all([
      window.api.lookups.workspaces(),
      window.api.settings.get('display_settings'),
    ]).then(([workspaces, rawDisplay]) => {
      setWorkspaces(workspaces)
      try {
        setDisplaySettings(rawDisplay ? JSON.parse(String(rawDisplay)) : DEFAULT_DISPLAY_SETTINGS)
      } catch {
        setDisplaySettings(DEFAULT_DISPLAY_SETTINGS)
      }
    })
  }, [setWorkspaces, setDisplaySettings])

  // Reload workspace-specific lookups whenever the active workspace changes
  useEffect(() => {
    if (activeWorkspace === 'current_tasks') return
    Promise.all([
      window.api.lookups.priorities(activeWorkspace),
      window.api.lookups.statuses(activeWorkspace),
      window.api.categories.list(activeWorkspace),
    ]).then(([priorities, statuses, categories]) => {
      setPriorities(priorities)
      setStatuses(statuses)
      setCategories(categories)
    })
  }, [activeWorkspace, setPriorities, setStatuses, setCategories])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        setShowAddModal(true)
      }
      if (e.key === 'Escape') {
        setShowAddModal(false)
        setShowSettings(false)
        setShowSync(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-300 overflow-hidden">
      <Sidebar onOpenSettings={() => setShowSettings(true)} onOpenSync={() => setShowSync(true)} />

      <div className="flex flex-1 overflow-hidden">
        <TaskList onAddTask={() => setShowAddModal(true)} />
        <TaskDetail />
      </div>

      {showAddModal && (
        <AddTaskModal onClose={() => setShowAddModal(false)} />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} onOpenSync={() => { setShowSettings(false); setShowSync(true) }} />
      )}

      {showSync && (
        <SyncPanel onClose={() => setShowSync(false)} />
      )}
    </div>
  )
}
