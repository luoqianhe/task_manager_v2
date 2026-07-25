import { useEffect, useMemo, useState, useCallback } from 'react'
import { Plus, Search } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import { PriorityGroup } from '../tasks/PriorityGroup'
import { TaskRow } from '../tasks/TaskRow'
import type { TabType } from '../../types'

const PRIORITY_ORDER = ['High', 'Medium', 'Low', 'Unprioritized']

const TABS: Array<{ id: TabType; label: string }> = [
  { id: 'current',   label: 'Current' },
  { id: 'backlog',   label: 'Backlog' },
  { id: 'completed', label: 'Completed' },
]

interface TaskListProps {
  onAddTask: () => void
}

export function TaskList({ onAddTask }: TaskListProps) {
  const { tasks, activeTab, setActiveTab, selectedTaskId, setSelectedTaskId, searchQuery, setSearchQuery, isLoading, taskCounts } = useStore()
  const { refresh, updateTask } = useTasks()

  // Which parent tasks have their subtasks expanded
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<number>>(new Set())

  const toggleSubtasks = useCallback((id: number) => {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [activeTab, refresh])

  // Auto-expand parent tasks when they first gain subtasks
  useEffect(() => {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      for (const t of tasks) {
        if (t.parent_id === null && tasks.some((s) => s.parent_id === t.id)) {
          next.add(t.id)
        }
      }
      return next
    })
  }, [tasks])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q)
    )
  }, [tasks, searchQuery])

  // Split into root tasks and a subtask lookup map
  const rootFiltered = useMemo(() => filtered.filter((t) => t.parent_id === null), [filtered])

  const subtaskMap = useMemo(() => {
    const map: Record<number, typeof filtered> = {}
    for (const t of filtered) {
      if (t.parent_id !== null) {
        if (!map[t.parent_id]) map[t.parent_id] = []
        map[t.parent_id].push(t)
      }
    }
    return map
  }, [filtered])

  const grouped = useMemo(() => {
    const map: Record<string, typeof rootFiltered> = {}
    for (const p of PRIORITY_ORDER) map[p] = []
    for (const task of rootFiltered) {
      const key = PRIORITY_ORDER.includes(task.priority) ? task.priority : 'Unprioritized'
      map[key].push(task)
    }
    return map
  }, [rootFiltered])

  const handleStatusChange = async (id: number, status: string) => {
    await updateTask(id, { status })
  }

  const isEmpty = rootFiltered.length === 0 && Object.keys(subtaskMap).length === 0

  return (
    <div className="flex flex-col h-full border-r border-neutral-800 w-80 min-w-[280px]">
      {/* Tab bar + add button */}
      <div
        className="flex items-center gap-1 px-3 pt-3 pb-1 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex flex-1 gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && taskCounts[tab.id] > 0 && (
                <span className="ml-1.5 text-neutral-500">{taskCounts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onAddTask}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="New task (⌘N)"
          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
          <input
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-800/60 text-neutral-300 placeholder-neutral-600 text-sm rounded-md pl-8 pr-3 py-1.5 border border-neutral-700/50 focus:outline-none focus:border-neutral-500 transition-colors"
          />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-neutral-600 text-sm">
            Loading…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <span className="text-neutral-600 text-sm">No tasks</span>
            <button
              onClick={onAddTask}
              className="text-blue-500 hover:text-blue-400 text-xs transition-colors"
            >
              + Add one
            </button>
          </div>
        ) : activeTab === 'current' ? (
          PRIORITY_ORDER.map((priority) => (
            <PriorityGroup
              key={priority}
              priority={priority}
              tasks={grouped[priority]}
              subtaskMap={subtaskMap}
              expandedSubtasks={expandedSubtasks}
              onToggleSubtasks={toggleSubtasks}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
              onStatusChange={handleStatusChange}
            />
          ))
        ) : (
          // Flat list for backlog / completed — with subtasks inlined
          <div className="space-y-px">
            {rootFiltered.map((task) => {
              const subtasks = subtaskMap[task.id] ?? []
              const hasSubtasks = subtasks.length > 0
              const isExpanded = expandedSubtasks.has(task.id)
              return (
                <div key={task.id}>
                  <TaskRow
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    onSelect={setSelectedTaskId}
                    onStatusChange={handleStatusChange}
                    hasSubtasks={hasSubtasks}
                    isExpanded={isExpanded}
                    onToggle={() => toggleSubtasks(task.id)}
                  />
                  {hasSubtasks && isExpanded && subtasks.map((sub) => (
                    <TaskRow
                      key={sub.id}
                      task={sub}
                      isSelected={sub.id === selectedTaskId}
                      onSelect={setSelectedTaskId}
                      onStatusChange={handleStatusChange}
                      isSubtask
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
