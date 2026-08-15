import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { TaskRow } from './TaskRow'
import type { Task } from '../../types'
import type { DndScopeType, DropMode } from '../../lib/dndHelpers'

interface SortableTaskRowProps {
  task: Task
  scopeType: DndScopeType
  scopeKey: string
  hasSubtasks?: boolean
  disabled?: boolean
  dropIndicator?: DropMode | null
  isSelected: boolean
  onSelect: (id: number) => void
  onStatusChange: (id: number, status: string) => void
  isExpanded?: boolean
  onToggle?: () => void
  isSubtask?: boolean
  onAddSubtask?: (parentId: number) => void
}

export function SortableTaskRow({
  task, scopeType, scopeKey, hasSubtasks, disabled, dropIndicator, ...rowProps
}: SortableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
    data: {
      type: 'row',
      taskId: task.id,
      parentId: task.parent_id,
      priority: task.priority,
      hasSubtasks: !!hasSubtasks,
      scopeType,
      scopeKey,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={`relative ${isDragging ? 'opacity-40' : ''}`}>
      {dropIndicator === 'before' && (
        <div className="absolute left-2 right-2 -top-px h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {dropIndicator === 'after' && (
        <div className="absolute left-2 right-2 -bottom-px h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      <div
        className={
          dropIndicator === 'onto'
            ? 'rounded-md ring-2 ring-blue-500'
            : dropIndicator === 'blocked'
              ? 'rounded-md ring-2 ring-red-500/60'
              : ''
        }
      >
        <TaskRow
          task={task}
          hasSubtasks={hasSubtasks}
          dragHandle={
            !disabled ? (
              <span
                {...attributes}
                {...listeners}
                className="flex items-center justify-center text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing"
              >
                <GripVertical size={13} />
              </span>
            ) : undefined
          }
          {...rowProps}
        />
      </div>
    </div>
  )
}

interface DropSentinelProps {
  id: string
  scopeType: DndScopeType
  scopeKey: string
  disabled?: boolean
  active?: boolean
}

/** Trailing drop target for "append to end of this list" — also the only
 * drop target for a scope that currently has zero visible rows. */
export function DropSentinel({ id, scopeType, scopeKey, disabled, active }: DropSentinelProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data: { type: 'sentinel', scopeType, scopeKey },
  })

  if (!active) return null

  return (
    <div
      ref={setNodeRef}
      className={`h-3 mx-1 rounded-md transition-colors ${isOver ? 'bg-blue-500/20 ring-1 ring-blue-500/40' : ''}`}
    />
  )
}
