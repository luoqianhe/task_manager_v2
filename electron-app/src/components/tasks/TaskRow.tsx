import { useState, useEffect } from 'react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { Link as LinkIcon, Calendar, ChevronDown, ChevronRight, Paperclip } from 'lucide-react'
import type { Task } from '../../types'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'

interface TaskRowProps {
  task: Task
  isSelected: boolean
  onSelect: (id: number) => void
  onStatusChange: (id: number, status: string) => void
  hasSubtasks?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  isSubtask?: boolean
  onAddSubtask?: (parentId: number) => void
}

const SECTION_STATUS: Record<'current' | 'backlog' | 'completed', string> = {
  current: 'Not Started',
  backlog: 'Backlog',
  completed: 'Completed',
}

const SECTION_LABEL: Record<'current' | 'backlog' | 'completed', string> = {
  current: 'Current',
  backlog: 'Backlog',
  completed: 'Completed',
}

function Badge({ label, color, style }: { label: string; color: string; style: 'text' | 'pill' }) {
  if (style === 'pill') {
    return (
      <span
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: color + '28', color }}
      >
        {label}
      </span>
    )
  }
  return <span className="text-[11px] font-medium whitespace-nowrap" style={{ color }}>{label}</span>
}

export function TaskRow({
  task, isSelected, onSelect, onStatusChange,
  hasSubtasks, isExpanded, onToggle, isSubtask, onAddSubtask,
}: TaskRowProps) {
  const { displaySettings, priorities, statuses, activeWorkspace } = useStore()
  const { refresh, updateTask } = useTasks()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const isCompleted = task.status === 'Completed'
  const isPinned = (task.is_pinned ?? 0) === 1
  const currentSection: 'current' | 'backlog' | 'completed' =
    isCompleted ? 'completed' : task.status === 'Backlog' ? 'backlog' : 'current'

  const priorityColor = priorities.find(p => p.name === task.priority)?.color ?? '#6b7280'
  const statusColor   = statuses.find(s => s.name === task.status)?.color   ?? '#6b7280'

  const showBorderAccent = displaySettings.accent === 'border' && !isSubtask && !isCompleted
  const showBadgeAccent  = displaySettings.accent === 'badge'  && !isSubtask && !isCompleted

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isSubtask) return
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenu(null)
    await window.api.tasks.pin(task.id)
    refresh()
  }

  const handleUnpin = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenu(null)
    await window.api.tasks.unpin(task.id)
    refresh()
  }

  const handleAddSubtask = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenu(null)
    onAddSubtask?.(task.id)
  }

  const handleMove = (section: 'current' | 'backlog' | 'completed') => async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenu(null)
    await updateTask(task.id, { status: SECTION_STATUS[section] })
  }

  const dueDateEl = task.due_date ? (() => {
    const d = parseISO(task.due_date)
    const overdue = isPast(d) && !isToday(d) && !isCompleted
    const today   = isToday(d) && !isCompleted
    return (
      <span className={`flex items-center gap-1 text-xs shrink-0 ${
        overdue ? 'text-red-400' : today ? 'text-amber-400' : 'text-neutral-500'
      }`}>
        <Calendar size={11} />
        {format(d, 'MMM d')}
      </span>
    )
  })() : null

  return (
    <div
      onClick={() => onSelect(task.id)}
      onContextMenu={handleContextMenu}
      className={`group relative flex items-center gap-2 py-2 mx-1 rounded-md cursor-pointer transition-colors ${
        isSubtask
          ? 'pl-8 pr-3'
          : showBorderAccent
            ? 'pl-4 pr-3'
            : 'px-3'
      } ${
        isSelected
          ? 'bg-blue-600/20 border border-blue-500/30'
          : 'hover:bg-neutral-800/70 border border-transparent'
      }`}
    >
      {/* Border accent stripe */}
      {showBorderAccent && (
        <span
          className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r flex-shrink-0"
          style={{ background: priorityColor }}
        />
      )}

      {/* Expand/collapse toggle */}
      {hasSubtasks ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
          className="w-4 h-4 flex items-center justify-center text-neutral-600 hover:text-neutral-400 flex-shrink-0 -ml-0.5"
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}

      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onStatusChange(task.id, isCompleted ? 'Not Started' : 'Completed')
        }}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          isCompleted
            ? 'bg-green-500 border-green-500'
            : 'border-neutral-600 hover:border-neutral-400'
        }`}
      >
        {isCompleted && (
          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white">
            <path d="M1.5 5L4 7.5 8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Badge accent (priority label left of title) */}
      {showBadgeAccent && (
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded tracking-wide flex-shrink-0"
          style={{ background: priorityColor + '28', color: priorityColor }}
        >
          {task.priority}
        </span>
      )}

      {/* Title */}
      <span className={`flex-1 truncate ${isSubtask ? 'text-xs' : 'text-sm'} ${
        isCompleted
          ? 'line-through text-neutral-500'
          : isSelected
            ? 'text-neutral-100'
            : isSubtask ? 'text-neutral-400' : 'text-neutral-300'
      } ${isPinned && activeWorkspace !== 'current_tasks' ? 'italic' : ''}`}>
        {task.title}
      </span>

      {/* Right meta */}
      <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
        {displaySettings.showCategory && task.category_name && !isSubtask && (
          <span className="text-xs text-neutral-500 hidden md:block">{task.category_name}</span>
        )}
        {displaySettings.showDueDate && dueDateEl}
        {displaySettings.showStatus && !isSubtask && (
          <Badge label={task.status} color={statusColor} style={displaySettings.badgeStyle} />
        )}
        {displaySettings.showPriority && !isSubtask && (
          <Badge label={task.priority} color={priorityColor} style={displaySettings.badgeStyle} />
        )}
        {displaySettings.showLinks && task.links && task.links.length > 0 && (
          <LinkIcon size={11} className="text-neutral-600" />
        )}
        {task.attachment_count != null && task.attachment_count > 0 && !isSubtask && (
          <Paperclip size={11} className="text-neutral-600" />
        )}
      </div>

      {/* Context menu */}
      {menu && !isSubtask && (
        <div
          className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[190px]"
          style={{ left: menu.x, top: menu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={handleAddSubtask}
            className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
          >
            Add Subtask
          </button>

          <div className="my-1 border-t border-neutral-700" />

          {(['current', 'backlog', 'completed'] as const)
            .filter((section) => section !== currentSection)
            .map((section) => (
              <button
                key={section}
                onClick={handleMove(section)}
                className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Move to {SECTION_LABEL[section]}
              </button>
            ))}

          <div className="my-1 border-t border-neutral-700" />

          {isPinned || activeWorkspace === 'current_tasks' ? (
            <button
              onClick={handleUnpin}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              Remove from Current Tasks
            </button>
          ) : (
            <button
              onClick={handlePin}
              className="w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
            >
              Add to Current Tasks
            </button>
          )}
        </div>
      )}
    </div>
  )
}
