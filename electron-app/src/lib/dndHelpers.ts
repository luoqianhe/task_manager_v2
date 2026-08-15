export type DropMode = 'before' | 'after' | 'onto' | 'blocked'

export type DndScopeType = 'priorityGroup' | 'flatList' | 'subtaskList'

export interface RowDragData {
  type: 'row'
  taskId: number
  parentId: number | null
  priority: string
  hasSubtasks: boolean
  scopeType: DndScopeType
  scopeKey: string
}

export interface SentinelDragData {
  type: 'sentinel'
  scopeType: DndScopeType
  scopeKey: string
}

export interface DropIntent {
  mode: DropMode
}

interface RectLike {
  top: number
  height: number
}

/**
 * Splits the hovered row into top/bottom 25% "reorder" bands and a middle
 * 50% "nest onto this row" band.
 *
 * The middle band only becomes 'onto' when the target is itself a root task
 * (subtasks can't receive subtasks). If the target is a subtask, the middle
 * band falls back to before/after among that subtask's siblings.
 *
 * Either way, if the *dragged* task already has its own subtasks, landing it
 * under any parent (via 'onto', or via before/after among another parent's
 * subtasks) would create two levels of nesting — that's reported as
 * 'blocked' instead, so it stays a root task and can only be reordered.
 */
export function getDropIntent(
  activeRect: RectLike,
  overRect: RectLike,
  active: { taskId: number; hasSubtasks: boolean },
  over: { taskId: number; parentId: number | null }
): DropIntent | null {
  if (over.taskId === active.taskId) return null

  const activeCenter = activeRect.top + activeRect.height / 2
  const ratio = overRect.height > 0 ? (activeCenter - overRect.top) / overRect.height : 0.5

  if (ratio >= 0.25 && ratio <= 0.75 && over.parentId === null) {
    return active.hasSubtasks ? { mode: 'blocked' } : { mode: 'onto' }
  }

  const mode: DropMode = ratio < 0.5 ? 'before' : 'after'
  if (over.parentId !== null && active.hasSubtasks) return { mode: 'blocked' }
  return { mode }
}
