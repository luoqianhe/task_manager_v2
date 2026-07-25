import { useCallback } from 'react'
import { useStore } from './useStore'
import type { TaskFormData } from '../types'

export function useTasks() {
  const { activeTab, activeWorkspace, setTasks, setLoading, setTaskCounts } = useStore()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [tasks, counts] = await Promise.all([
        window.api.tasks.list(activeTab, activeWorkspace),
        window.api.tasks.counts(activeWorkspace),
      ])
      setTasks(tasks)
      setTaskCounts(counts)
    } finally {
      setLoading(false)
    }
  }, [activeTab, activeWorkspace, setTasks, setLoading, setTaskCounts])

  const createTask = useCallback(async (data: Partial<TaskFormData>) => {
    const id = await window.api.tasks.create({ ...data, workspace: activeWorkspace })
    await refresh()
    return id
  }, [refresh, activeWorkspace])

  const updateTask = useCallback(async (id: number, data: Partial<TaskFormData & { status: string }>) => {
    await window.api.tasks.update(id, data)
    await refresh()
  }, [refresh])

  const deleteTask = useCallback(async (id: number) => {
    await window.api.tasks.delete(id)
    await refresh()
  }, [refresh])

  return { refresh, createTask, updateTask, deleteTask }
}
