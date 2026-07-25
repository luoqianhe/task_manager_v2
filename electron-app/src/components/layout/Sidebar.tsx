import { useState, useEffect, useRef } from 'react'
import { CheckSquare, Inbox, Archive, Settings, Clock, RefreshCw, Loader } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import type { TabType } from '../../types'

interface SidebarProps {
  onOpenSettings: () => void
  onOpenSync: () => void
}

export function Sidebar({ onOpenSettings, onOpenSync }: SidebarProps) {
  const {
    activeTab, setActiveTab,
    activeWorkspace, setActiveWorkspace,
    categories,
    workspaces,
    taskCounts,
  } = useStore()
  const { refresh } = useTasks()
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])

  const [syncingWs, setSyncingWs] = useState<string | null>(null)

  const handleWorkspaceClick = (wsName: string) => {
    setActiveWorkspace(wsName)
    setSyncingWs(wsName)
    window.api.sync.autoSync(wsName)
      .then(result => { if (result.synced) refreshRef.current() })
      .catch(() => {})
      .finally(() => setSyncingWs(null))
  }

  const navItems: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
    { id: 'current',   label: 'Current',   icon: <Inbox size={16} /> },
    { id: 'backlog',   label: 'Backlog',   icon: <Archive size={16} /> },
    { id: 'completed', label: 'Completed', icon: <CheckSquare size={16} /> },
  ]

  return (
    <div className="sidebar flex flex-col h-full w-52 bg-neutral-900 border-r border-neutral-800 select-none">
      {/* App title — drag region */}
      <div
        className="h-12 flex items-center px-4 pt-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-neutral-200">Task Organizer</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {/* Workspaces */}
        {workspaces.length > 0 && (
          <>
            <div className="text-xs font-medium text-neutral-500 uppercase px-2 py-1 mt-1">
              Workspaces
            </div>
            {workspaces.map((ws, i) => (
              <div key={ws.id}>
                <button
                  onClick={() => handleWorkspaceClick(ws.name)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                    activeWorkspace === ws.name
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ws.color ?? '#6b7280' }}
                  />
                  <span className="flex-1 text-left">{ws.display_name}</span>
                  {syncingWs === ws.name && (
                    <Loader size={11} className="text-neutral-500 animate-spin flex-shrink-0" />
                  )}
                </button>
                {ws.name === 'current_tasks' && i < workspaces.length - 1 && (
                  <div className="border-t border-neutral-800 my-1 mx-1" />
                )}
              </div>
            ))}
          </>
        )}

        {/* Views */}
        <div className="text-xs font-medium text-neutral-500 uppercase px-2 py-1 mt-3">Views</div>
        {navItems.map((item) => {
          const count = taskCounts[item.id]
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                activeTab === item.id
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {count > 0 && (
                <span className={`text-xs tabular-nums ${activeTab === item.id ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Categories */}
        {categories.length > 0 && (
          <>
            <div className="text-xs font-medium text-neutral-500 uppercase px-2 py-1 mt-3">
              Categories
            </div>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 cursor-default"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color === '#E8F4FD' ? '#60a5fa' : cat.color }}
                />
                {cat.name}
              </div>
            ))}
          </>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-neutral-800 p-2 space-y-0.5">
        <button
          onClick={onOpenSync}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        >
          <RefreshCw size={16} />
          Sync
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
    </div>
  )
}
