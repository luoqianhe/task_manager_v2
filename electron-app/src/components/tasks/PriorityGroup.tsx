import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortableTaskRow, DropSentinel } from './SortableTaskRow'
import type { Task } from '../../types'
import type { DropMode } from '../../lib/dndHelpers'

const PRIORITY_COLORS: Record<string, string> = {
  High: 'text-red-400',
  Medium: 'text-amber-400',
  Low: 'text-neutral-400',
  Unprioritized: 'text-neutral-500',
}

const PRIORITY_DOT: Record<string, string> = {
  High: 'bg-red-500',
  Medium: 'bg-amber-500',
  Low: 'bg-neutral-500',
  Unprioritized: 'bg-neutral-600',
}

interface DropIntentState {
  type: 'row' | 'sentinel'
  mode?: DropMode
  overId?: number
}

interface PriorityGroupProps {
  priority: string
  tasks: Task[]
  subtaskMap: Record<number, Task[]>
  expandedSubtasks: Set<number>
  onToggleSubtasks: (id: number) => void
  selectedTaskId: number | null
  onSelect: (id: number) => void
  onStatusChange: (id: number, status: string) => void
  onAddSubtask: (parentId: number) => void
  dndEnabled: boolean
  isDragActive: boolean
  dropIntent: DropIntentState | null
}

export function PriorityGroup({
  priority, tasks, subtaskMap, expandedSubtasks,
  onToggleSubtasks, selectedTaskId, onSelect, onStatusChange, onAddSubtask,
  dndEnabled, isDragActive, dropIntent,
}: PriorityGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0 && !isDragActive) return null

  const colorClass = PRIORITY_COLORS[priority] ?? 'text-neutral-400'
  const dotClass = PRIORITY_DOT[priority] ?? 'bg-neutral-600'

  const totalCount = tasks.reduce((sum, t) => sum + 1 + (subtaskMap[t.id]?.length ?? 0), 0)

  const indicatorFor = (id: number): DropMode | null =>
    dropIntent?.type === 'row' && dropIntent.overId === id ? dropIntent.mode ?? null : null

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-neutral-800/50 rounded-md group"
      >
        <span className="text-neutral-500 group-hover:text-neutral-400">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${colorClass}`}>
          {priority}
        </span>
        <span className="ml-auto text-xs text-neutral-600">{totalCount}</span>
      </button>

      {!collapsed && (
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-px">
            {tasks.map((task) => {
              const subtasks = subtaskMap[task.id] ?? []
              const hasSubtasks = subtasks.length > 0
              const isExpanded = expandedSubtasks.has(task.id)

              return (
                <div key={task.id}>
                  <SortableTaskRow
                    task={task}
                    scopeType="priorityGroup"
                    scopeKey={priority}
                    hasSubtasks={hasSubtasks}
                    disabled={!dndEnabled}
                    dropIndicator={indicatorFor(task.id)}
                    isSelected={task.id === selectedTaskId}
                    onSelect={onSelect}
                    onStatusChange={onStatusChange}
                    isExpanded={isExpanded}
                    onToggle={() => onToggleSubtasks(task.id)}
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
                          dropIndicator={indicatorFor(sub.id)}
                          isSelected={sub.id === selectedTaskId}
                          onSelect={onSelect}
                          onStatusChange={onStatusChange}
                          isSubtask
                        />
                      ))}
                      <DropSentinel
                        id={`sentinel:subtaskList:${task.id}`}
                        scopeType="subtaskList"
                        scopeKey={String(task.id)}
                        disabled={!dndEnabled}
                        active={isDragActive}
                      />
                    </SortableContext>
                  )}
                </div>
              )
            })}
            <DropSentinel
              id={`sentinel:priorityGroup:${priority}`}
              scopeType="priorityGroup"
              scopeKey={priority}
              disabled={!dndEnabled}
              active={isDragActive}
            />
          </div>
        </SortableContext>
      )}
    </div>
  )
}
