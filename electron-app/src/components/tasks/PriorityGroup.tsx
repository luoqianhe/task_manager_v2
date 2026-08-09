import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TaskRow } from './TaskRow'
import type { Task } from '../../types'

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
}

export function PriorityGroup({
  priority, tasks, subtaskMap, expandedSubtasks,
  onToggleSubtasks, selectedTaskId, onSelect, onStatusChange, onAddSubtask,
}: PriorityGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0) return null

  const colorClass = PRIORITY_COLORS[priority] ?? 'text-neutral-400'
  const dotClass = PRIORITY_DOT[priority] ?? 'bg-neutral-600'

  const totalCount = tasks.reduce((sum, t) => sum + 1 + (subtaskMap[t.id]?.length ?? 0), 0)

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
        <div className="space-y-px">
          {tasks.map((task) => {
            const subtasks = subtaskMap[task.id] ?? []
            const hasSubtasks = subtasks.length > 0
            const isExpanded = expandedSubtasks.has(task.id)

            return (
              <div key={task.id}>
                <TaskRow
                  task={task}
                  isSelected={task.id === selectedTaskId}
                  onSelect={onSelect}
                  onStatusChange={onStatusChange}
                  hasSubtasks={hasSubtasks}
                  isExpanded={isExpanded}
                  onToggle={() => onToggleSubtasks(task.id)}
                  onAddSubtask={onAddSubtask}
                />
                {hasSubtasks && isExpanded && subtasks.map((sub) => (
                  <TaskRow
                    key={sub.id}
                    task={sub}
                    isSelected={sub.id === selectedTaskId}
                    onSelect={onSelect}
                    onStatusChange={onStatusChange}
                    isSubtask
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
