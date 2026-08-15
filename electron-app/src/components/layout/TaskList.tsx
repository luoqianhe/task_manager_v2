import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Plus, Search } from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import { PriorityGroup } from '../tasks/PriorityGroup'
import { SortableTaskRow, DropSentinel } from '../tasks/SortableTaskRow'
import { getDropIntent } from '../../lib/dndHelpers'
import type { TabType, Task } from '../../types'
import type { RowDragData, SentinelDragData, DropMode } from '../../lib/dndHelpers'

const PRIORITY_ORDER = ['High', 'Medium', 'Low', 'Unprioritized']

const TABS: Array<{ id: TabType; label: string }> = [
  { id: 'current',   label: 'Current' },
  { id: 'backlog',   label: 'Backlog' },
  { id: 'completed', label: 'Completed' },
]

interface TaskListProps {
  onAddTask: () => void
  onAddSubtask: (parentId: number) => void
}

type DropIntentState =
  | { type: 'row'; mode: DropMode; overId: number; row: RowDragData }
  | { type: 'sentinel'; sentinel: SentinelDragData }
  | null

export function TaskList({ onAddTask, onAddSubtask }: TaskListProps) {
  const { tasks, activeTab, setActiveTab, activeWorkspace, selectedTaskId, setSelectedTaskId, searchQuery, setSearchQuery, isLoading, taskCounts } = useStore()
  const { refresh, updateTask, reorderTasks } = useTasks()

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

  // ---- Drag & drop ----
  const dndEnabled = activeWorkspace !== 'current_tasks'
  const [activeId, setActiveId] = useState<number | null>(null)
  const [dropIntent, setDropIntent] = useState<DropIntentState>(null)
  const dropIntentRef = useRef<DropIntentState>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const activeTask = activeId != null ? tasks.find((t) => t.id === activeId) ?? null : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as RowDragData | undefined
    setActiveId(data?.taskId ?? null)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) {
      dropIntentRef.current = null
      setDropIntent(null)
      return
    }

    const activeData = active.data.current as RowDragData | undefined
    const overData = over.data.current as RowDragData | SentinelDragData | undefined
    if (!activeData || !overData) {
      dropIntentRef.current = null
      setDropIntent(null)
      return
    }

    if (overData.type === 'sentinel') {
      const next: DropIntentState = { type: 'sentinel', sentinel: overData }
      dropIntentRef.current = next
      setDropIntent(next)
      return
    }

    const activeRect = active.rect.current.translated ?? active.rect.current.initial
    const overRect = over.rect
    if (!activeRect || !overRect) return

    const intent = getDropIntent(
      activeRect,
      overRect,
      { taskId: activeData.taskId, hasSubtasks: activeData.hasSubtasks },
      { taskId: overData.taskId, parentId: overData.parentId }
    )

    if (!intent) {
      dropIntentRef.current = null
      setDropIntent(null)
      return
    }

    const next: DropIntentState = { type: 'row', mode: intent.mode, overId: overData.taskId, row: overData }
    dropIntentRef.current = next
    setDropIntent(next)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const intent = dropIntentRef.current
    const activeData = event.active.data.current as RowDragData | undefined
    setActiveId(null)
    setDropIntent(null)
    dropIntentRef.current = null

    if (!intent || !activeData || intent.type === 'row' && intent.mode === 'blocked') return

    if (intent.type === 'sentinel') {
      const { scopeType, scopeKey } = intent.sentinel
      if (scopeType === 'priorityGroup') {
        const siblingIds = grouped[scopeKey].filter((t) => t.id !== activeData.taskId).map((t) => t.id)
        await reorderTasks({ movedId: activeData.taskId, parentId: null, priority: scopeKey, orderedIds: [...siblingIds, activeData.taskId] })
      } else if (scopeType === 'flatList') {
        const siblingIds = rootFiltered.filter((t) => t.id !== activeData.taskId).map((t) => t.id)
        await reorderTasks({ movedId: activeData.taskId, parentId: null, orderedIds: [...siblingIds, activeData.taskId] })
      } else {
        if (activeData.hasSubtasks) return
        const parentId = Number(scopeKey)
        const siblingIds = (subtaskMap[parentId] ?? []).filter((t) => t.id !== activeData.taskId).map((t) => t.id)
        await reorderTasks({ movedId: activeData.taskId, parentId, orderedIds: [...siblingIds, activeData.taskId] })
        setExpandedSubtasks((prev) => new Set(prev).add(parentId))
      }
      return
    }

    // intent.type === 'row'
    if (intent.mode === 'onto') {
      const parentId = intent.row.taskId
      const siblingIds = (subtaskMap[parentId] ?? []).filter((t) => t.id !== activeData.taskId).map((t) => t.id)
      await reorderTasks({ movedId: activeData.taskId, parentId, orderedIds: [...siblingIds, activeData.taskId] })
      setExpandedSubtasks((prev) => new Set(prev).add(parentId))
      return
    }

    // before / after
    const row = intent.row
    let destList: Task[]
    let parentIdForPayload: number | null = null
    let priorityForPayload: string | undefined

    if (row.scopeType === 'priorityGroup') {
      destList = grouped[row.scopeKey]
      priorityForPayload = row.scopeKey
    } else if (row.scopeType === 'flatList') {
      destList = rootFiltered
    } else {
      destList = subtaskMap[Number(row.scopeKey)] ?? []
      parentIdForPayload = Number(row.scopeKey)
    }

    const withoutActive = destList.filter((t) => t.id !== activeData.taskId)
    const targetIndex = withoutActive.findIndex((t) => t.id === row.taskId)
    const insertAt = intent.mode === 'before' ? targetIndex : targetIndex + 1
    const orderedIds = [
      ...withoutActive.slice(0, insertAt).map((t) => t.id),
      activeData.taskId,
      ...withoutActive.slice(insertAt).map((t) => t.id),
    ]

    await reorderTasks({ movedId: activeData.taskId, parentId: parentIdForPayload, priority: priorityForPayload, orderedIds })
    if (parentIdForPayload !== null) setExpandedSubtasks((prev) => new Set(prev).add(parentIdForPayload!))
  }, [grouped, rootFiltered, subtaskMap, reorderTasks])

  // ---- Blank-space "Create Task" context menu ----
  const [blankMenu, setBlankMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!blankMenu) return
    const close = () => setBlankMenu(null)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', handleKey)
    }
  }, [blankMenu])

  const handleBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setBlankMenu({ x: e.clientX, y: e.clientY })
  }

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
      <div className="flex-1 overflow-y-auto pb-2" onContextMenu={handleBlankContextMenu}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveId(null); setDropIntent(null); dropIntentRef.current = null }}
        >
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
                onAddSubtask={onAddSubtask}
                dndEnabled={dndEnabled}
                isDragActive={activeId != null}
                dropIntent={dropIntent}
              />
            ))
          ) : (
            // Flat list for backlog / completed — with subtasks inlined
            <SortableContext items={rootFiltered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-px">
                {rootFiltered.map((task) => {
                  const subtasks = subtaskMap[task.id] ?? []
                  const hasSubtasks = subtasks.length > 0
                  const isExpanded = expandedSubtasks.has(task.id)
                  return (
                    <div key={task.id}>
                      <SortableTaskRow
                        task={task}
                        scopeType="flatList"
                        scopeKey={activeTab}
                        hasSubtasks={hasSubtasks}
                        disabled={!dndEnabled}
                        dropIndicator={dropIntent?.type === 'row' && dropIntent.overId === task.id ? dropIntent.mode : null}
                        isSelected={task.id === selectedTaskId}
                        onSelect={setSelectedTaskId}
                        onStatusChange={handleStatusChange}
                        isExpanded={isExpanded}
                        onToggle={() => toggleSubtasks(task.id)}
                        onAddSubtask={onAddSubtask}
                      />
                      {hasSubtasks && isExpanded && (
                        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                          {subtasks.map((sub) => (
                            <SortableTaskRow
                              key={sub.id}
                              task={sub}
                              scopeType="subtaskList"
                              scopeKey={String(task.id)}
                              disabled={!dndEnabled}
                              dropIndicator={dropIntent?.type === 'row' && dropIntent.overId === sub.id ? dropIntent.mode : null}
                              isSelected={sub.id === selectedTaskId}
                              onSelect={setSelectedTaskId}
                              onStatusChange={handleStatusChange}
                              isSubtask
                            />
                          ))}
                          <DropSentinel
                            id={`sentinel:subtaskList:${task.id}`}
                            scopeType="subtaskList"
                            scopeKey={String(task.id)}
                            disabled={!dndEnabled}
                            active={activeId != null}
                          />
                        </SortableContext>
                      )}
                    </div>
                  )
                })}
                <DropSentinel
                  id={`sentinel:flatList:${activeTab}`}
                  scopeType="flatList"
                  scopeKey={activeTab}
                  disabled={!dndEnabled}
                  active={activeId != null}
                />
              </div>
            </SortableContext>
          )}

          <DragOverlay>
            {activeTask ? (
              <div className="mx-1 px-3 py-2 rounded-md bg-neutral-800 border border-neutral-600 shadow-xl text-sm text-neutral-200 truncate max-w-[260px]">
                {activeTask.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {blankMenu && (
          <div
            className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: blankMenu.x, top: blankMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setBlankMenu(null); onAddTask() }}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              Create Task
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
