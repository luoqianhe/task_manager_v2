import { create } from 'zustand'
import type { Task, Category, Priority, Status, Workspace, TabType, DisplaySettings } from '../types'
import { DEFAULT_DISPLAY_SETTINGS } from '../types'

interface TaskCounts {
  current: number
  backlog: number
  completed: number
}

interface AppState {
  tasks: Task[]
  categories: Category[]
  priorities: Priority[]
  statuses: Status[]
  workspaces: Workspace[]
  taskCounts: TaskCounts
  displaySettings: DisplaySettings

  activeTab: TabType
  activeWorkspace: string
  selectedTaskId: number | null
  searchQuery: string
  isLoading: boolean

  setTasks: (tasks: Task[]) => void
  setCategories: (categories: Category[]) => void
  setPriorities: (priorities: Priority[]) => void
  setStatuses: (statuses: Status[]) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setTaskCounts: (counts: TaskCounts) => void
  setDisplaySettings: (s: DisplaySettings) => void
  setActiveTab: (tab: TabType) => void
  setActiveWorkspace: (ws: string) => void
  setSelectedTaskId: (id: number | null) => void
  setSearchQuery: (q: string) => void
  setLoading: (loading: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  tasks: [],
  categories: [],
  priorities: [],
  statuses: [],
  workspaces: [],
  taskCounts: { current: 0, backlog: 0, completed: 0 },
  displaySettings: DEFAULT_DISPLAY_SETTINGS,
  activeTab: 'current',
  activeWorkspace: 'home',
  selectedTaskId: null,
  searchQuery: '',
  isLoading: false,

  setTasks: (tasks) => set({ tasks }),
  setCategories: (categories) => set({ categories }),
  setPriorities: (priorities) => set({ priorities }),
  setStatuses: (statuses) => set({ statuses }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setTaskCounts: (taskCounts) => set({ taskCounts }),
  setDisplaySettings: (displaySettings) => set({ displaySettings }),
  setActiveTab: (activeTab) => set({ activeTab, selectedTaskId: null }),
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace, selectedTaskId: null }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLoading: (isLoading) => set({ isLoading }),
}))
