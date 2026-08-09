import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import type { TaskFormData } from '../../types'

interface AddTaskModalProps {
  onClose: () => void
  initialParentId?: number | null
}

export function AddTaskModal({ onClose, initialParentId = null }: AddTaskModalProps) {
  const { categories, priorities, statuses, activeTab, tasks } = useStore()
  const { createTask } = useTasks()

  // Only root-level tasks can be picked as a parent, to keep subtasks one level deep
  const parentOptions = tasks.filter((t) => t.parent_id === null)

  const defaultStatus = activeTab === 'backlog' ? 'Backlog' : activeTab === 'completed' ? 'Completed' : 'Not Started'

  const [form, setForm] = useState<TaskFormData>({
    title: '',
    description: '',
    status: defaultStatus,
    priority: 'Unprioritized',
    due_date: '',
    category_id: null,
    parent_id: initialParentId,
    links: [],
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const setField = <K extends keyof TaskFormData>(k: K, v: TaskFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addLink = () => setForm((f) => ({ ...f, links: [...f.links, { url: '', label: '' }] }))
  const removeLink = (i: number) => setForm((f) => ({ ...f, links: f.links.filter((_, idx) => idx !== i) }))
  const updateLink = (i: number, field: 'url' | 'label', val: string) =>
    setForm((f) => ({
      ...f,
      links: f.links.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)),
    }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setIsSubmitting(true)
    try {
      await createTask({
        ...form,
        due_date: form.due_date || undefined,
        links: form.links.filter((l) => l.url.trim()),
      })
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-200">{initialParentId ? 'New Subtask' : 'New Task'}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <input
              autoFocus
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
              className="w-full bg-transparent text-neutral-100 text-base font-medium placeholder-neutral-600 focus:outline-none border-b border-neutral-700 focus:border-neutral-500 pb-2"
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              placeholder="Add notes…"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              className="w-full bg-neutral-800 text-neutral-300 placeholder-neutral-600 rounded-md px-3 py-2 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500 resize-none"
            />
          </div>

          {/* Row: Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
              >
                {statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setField('priority', e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
              >
                {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row: Due date + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setField('due_date', e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Category</label>
              <select
                value={form.category_id ?? ''}
                onChange={(e) => setField('category_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
              >
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Parent Task */}
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Parent Task</label>
            <select
              value={form.parent_id ?? ''}
              onChange={(e) => setField('parent_id', e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
            >
              <option value="">None</option>
              {parentOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          {/* Links */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-neutral-500">Links</label>
              <button
                type="button"
                onClick={addLink}
                className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
              >
                <Plus size={11} /> Add link
              </button>
            </div>
            {form.links.map((link, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  placeholder="URL"
                  value={link.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  className="flex-1 bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
                />
                <input
                  placeholder="Label"
                  value={link.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  className="w-28 bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-neutral-800 rounded-md"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm text-neutral-400 hover:text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.title.trim()}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {isSubmitting ? 'Adding…' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
