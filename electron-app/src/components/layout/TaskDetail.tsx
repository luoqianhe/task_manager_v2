import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  ExternalLink, Trash2, Edit3, Check, X,
  Calendar, Tag, Flag, CheckCircle2, ChevronDown,
  Paperclip, Upload, Cloud, FolderOpen, Plus, Loader,
} from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useTasks } from '../../hooks/useTasks'
import type { Task, Link, Attachment } from '../../types'

const STATUS_STYLE: Record<string, string> = {
  'Not Started': 'bg-neutral-700 text-neutral-300',
  'In Progress': 'bg-blue-900/50 text-blue-300 border border-blue-700/40',
  'On Hold':     'bg-amber-900/50 text-amber-300 border border-amber-700/40',
  'Backlog':     'bg-purple-900/50 text-purple-300 border border-purple-700/40',
  'Completed':   'bg-green-900/50 text-green-300 border border-green-700/40',
}

const PRIORITY_COLOR: Record<string, string> = {
  High:           'text-red-400',
  Medium:         'text-amber-400',
  Low:            'text-neutral-400',
  Unprioritized:  'text-neutral-500',
}

function QuickSelect({
  value,
  options,
  onChange,
  className = '',
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={`relative inline-flex items-center gap-0.5 ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full cursor-pointer"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="text-xs">{value}</span>
      <ChevronDown size={10} className="opacity-50 flex-shrink-0" />
    </div>
  )
}

export function TaskDetail() {
  const { selectedTaskId, tasks, statuses, categories, priorities, activeWorkspace, setSelectedTaskId } = useStore()
  const WORKSPACE = activeWorkspace
  const { updateTask, deleteTask } = useTasks()

  const [fullTask, setFullTask] = useState<(Task & { links: Link[] }) | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [driveStatus, setDriveStatus] = useState<Record<number, 'uploading' | 'downloading' | null>>({})

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null)
  const [editParentId, setEditParentId] = useState<number | null>(null)
  const [editLinks, setEditLinks] = useState<Array<{ url: string; label: string }>>([])

  useEffect(() => {
    if (!selectedTaskId) { setFullTask(null); setIsEditing(false); setAttachments([]); return }
    window.api.tasks.get(selectedTaskId).then((t) => {
      setFullTask(t)
      setEditTitle(t.title)
      setEditDescription(t.description || '')
      setEditStatus(t.status)
      setEditPriority(t.priority)
      setEditDueDate(t.due_date || '')
      setEditCategoryId(t.category_id)
      setEditParentId(t.parent_id)
      setEditLinks(t.links?.map((l) => ({ url: l.url, label: l.label })) ?? [])
    })
    window.api.files.list(selectedTaskId).then(setAttachments)
  }, [selectedTaskId, tasks])

  if (!fullTask) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 text-sm gap-2 select-none">
        <span className="text-3xl opacity-20">⌘</span>
        <span>Select a task to see details</span>
      </div>
    )
  }

  // Quick inline changes (without opening full edit form)
  const quickUpdate = async (patch: Record<string, unknown>) => {
    await updateTask(fullTask.id, patch as Parameters<typeof updateTask>[1])
  }

  const handleDelete = async () => {
    if (confirm(`Delete "${fullTask.title}"?`)) {
      await deleteTask(fullTask.id)
      setSelectedTaskId(null)
    }
  }

  const handleSave = async () => {
    await updateTask(fullTask.id, {
      title: editTitle,
      description: editDescription || null,
      status: editStatus,
      priority: editPriority,
      due_date: editDueDate || null,
      category_id: editCategoryId,
      parent_id: editParentId,
      links: editLinks.filter((l) => l.url.trim()),
    } as Parameters<typeof updateTask>[1])
    setIsEditing(false)
  }

  const openLink = (url: string) => window.api.shell.openExternal(url)

  const refreshAttachments = () =>
    fullTask && window.api.files.list(fullTask.id).then(setAttachments)

  const handleAttach = async () => {
    if (!fullTask) return
    const added = await window.api.files.attach(fullTask.id)
    if (added.length > 0) refreshAttachments()
  }

  const handleUploadToDrive = async (id: number) => {
    setDriveStatus(s => ({ ...s, [id]: 'uploading' }))
    try {
      await window.api.files.uploadToDrive(id, WORKSPACE)
      refreshAttachments()
    } catch (e) {
      alert(String(e))
    } finally {
      setDriveStatus(s => ({ ...s, [id]: null }))
    }
  }

  const handleDownloadFromDrive = async (id: number) => {
    setDriveStatus(s => ({ ...s, [id]: 'downloading' }))
    try {
      await window.api.files.downloadFromDrive(id, WORKSPACE)
      refreshAttachments()
    } catch (e) {
      alert(String(e))
    } finally {
      setDriveStatus(s => ({ ...s, [id]: null }))
    }
  }

  const handleDeleteAttachment = async (id: number) => {
    await window.api.files.delete(id, WORKSPACE)
    refreshAttachments()
  }

  const handleSyncAllToDrive = async () => {
    if (!fullTask) return
    try {
      const r = await window.api.files.syncDrive(fullTask.id, WORKSPACE)
      refreshAttachments()
      if (r.uploaded > 0) alert(`Uploaded ${r.uploaded} file${r.uploaded === 1 ? '' : 's'} to Drive`)
    } catch (e) {
      alert(String(e))
    }
  }

  const statusOptions = statuses.map((s) => s.name)
  const priorityOptions = priorities.map((p) => p.name)

  // Only root-level tasks can be picked as a parent, to keep subtasks one level deep
  const parentOptions = tasks.filter((t) => t.parent_id === null && t.id !== fullTask.id)
  const hasChildren = tasks.some((t) => t.parent_id === fullTask.id)

  // ── EDIT FORM ──
  if (isEditing) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <div
          className="h-10 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-transparent text-neutral-100 text-base font-semibold placeholder-neutral-600 focus:outline-none border-b border-neutral-700 focus:border-neutral-500 pb-2 transition-colors"
          />

          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Add notes…"
            rows={4}
            className="w-full bg-neutral-800/60 text-neutral-300 placeholder-neutral-600 rounded-md px-3 py-2 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500 resize-none transition-colors"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500">
                {statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Priority</label>
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500">
                {priorities.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Due Date</label>
              <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Category</label>
              <select value={editCategoryId ?? ''} onChange={(e) => setEditCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500">
                <option value="">None</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Parent Task */}
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Parent Task</label>
            <select
              value={editParentId ?? ''}
              onChange={(e) => setEditParentId(e.target.value ? Number(e.target.value) : null)}
              disabled={hasChildren}
              className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">None</option>
              {parentOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            {hasChildren && (
              <p className="text-xs text-neutral-600 mt-1">This task has subtasks, so it can't become a subtask itself.</p>
            )}
          </div>

          {/* Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-neutral-500">Links</label>
              <button type="button" onClick={() => setEditLinks([...editLinks, { url: '', label: '' }])}
                className="text-xs text-blue-500 hover:text-blue-400">+ Add</button>
            </div>
            {editLinks.map((link, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input placeholder="URL" value={link.url}
                  onChange={(e) => setEditLinks(editLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                  className="flex-1 bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500" />
                <input placeholder="Label" value={link.label}
                  onChange={(e) => setEditLinks(editLinks.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                  className="w-24 bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500" />
                <button onClick={() => setEditLinks(editLinks.filter((_, j) => j !== i))}
                  className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-neutral-800 rounded-md">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors">
              <Check size={13} /> Save
            </button>
            <button onClick={() => setIsEditing(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── READ VIEW ──
  const isCompleted = fullTask.status === 'Completed'

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Drag region */}
      <div className="h-10 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* Title + action buttons */}
        <div className="flex items-start gap-3 mb-3">
          <h2 className="flex-1 text-base font-semibold text-neutral-100 leading-snug">{fullTask.title}</h2>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setIsEditing(true)} title="Edit"
              className="p-1.5 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors">
              <Edit3 size={14} />
            </button>
            <button onClick={handleDelete} title="Delete"
              className="p-1.5 rounded-md text-neutral-600 hover:text-red-400 hover:bg-neutral-800 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Status + priority badges — clickable inline selects */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer select-none ${STATUS_STYLE[fullTask.status] ?? 'bg-neutral-700 text-neutral-300'}`}>
            <QuickSelect
              value={fullTask.status}
              options={statusOptions}
              onChange={(v) => quickUpdate({ status: v })}
            />
          </span>

          <span className={`inline-flex items-center gap-1 text-xs font-medium cursor-pointer select-none ${PRIORITY_COLOR[fullTask.priority] ?? 'text-neutral-500'}`}>
            <Flag size={11} className="flex-shrink-0" />
            <QuickSelect
              value={fullTask.priority}
              options={priorityOptions}
              onChange={(v) => quickUpdate({ priority: v })}
              className={PRIORITY_COLOR[fullTask.priority]}
            />
          </span>
        </div>

        {/* Meta fields */}
        <div className="space-y-4">
          {fullTask.due_date && (
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-neutral-600 shrink-0" />
              <span className="text-sm text-neutral-300">
                {format(parseISO(fullTask.due_date), 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          {fullTask.category_name && (
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-neutral-600 shrink-0" />
              <span className="text-sm text-neutral-300">{fullTask.category_name}</span>
            </div>
          )}

          {fullTask.parent_title && (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-neutral-600 shrink-0" />
              <span className="text-sm text-neutral-300">Subtask of {fullTask.parent_title}</span>
            </div>
          )}

          {fullTask.completed_at && (
            <div className="flex items-center gap-2">
              <Check size={13} className="text-green-600 shrink-0" />
              <span className="text-sm text-neutral-500">
                Completed {format(parseISO(fullTask.completed_at), 'MMM d, yyyy')}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        {fullTask.description && (
          <div className="mt-5">
            <div className="text-xs text-neutral-500 mb-2 uppercase tracking-wide">Notes</div>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
              {fullTask.description}
            </p>
          </div>
        )}

        {/* Links */}
        {fullTask.links && fullTask.links.length > 0 && (
          <div className="mt-5">
            <div className="text-xs text-neutral-500 mb-2 uppercase tracking-wide">Links</div>
            <div className="space-y-1.5">
              {fullTask.links.map((link: Link) => (
                <button key={link.id} onClick={() => openLink(link.url)}
                  className="flex items-center gap-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 transition-colors group">
                  <ExternalLink size={12} className="shrink-0" />
                  <span className="truncate underline underline-offset-2 decoration-blue-700 group-hover:decoration-blue-500">
                    {link.label || link.url}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
              <Paperclip size={11} />
              Attachments {attachments.length > 0 && <span className="text-neutral-600">({attachments.length})</span>}
            </div>
            <div className="flex items-center gap-2">
              {attachments.some(f => !f.drive_file_id) && (
                <button
                  onClick={handleSyncAllToDrive}
                  className="text-xs text-neutral-600 hover:text-blue-400 transition-colors"
                  title="Upload all unsynced files to Drive"
                >
                  Sync all to Drive
                </button>
              )}
              <button
                onClick={handleAttach}
                className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-300 transition-colors"
              >
                <Plus size={11} /> Attach
              </button>
            </div>
          </div>

          {attachments.length === 0 ? (
            <button
              onClick={handleAttach}
              className="w-full py-3 border border-dashed border-neutral-800 rounded-md text-xs text-neutral-600 hover:text-neutral-400 hover:border-neutral-700 transition-colors"
            >
              Click to attach files
            </button>
          ) : (
            <div className="space-y-1">
              {attachments.map((file) => {
                const busy = driveStatus[file.id]
                return (
                  <div key={file.id} className="flex items-center gap-2 group py-1 px-2 rounded-md hover:bg-neutral-800/50 transition-colors">
                    <Paperclip size={11} className="text-neutral-600 shrink-0" />
                    <span className="flex-1 text-sm text-neutral-300 truncate" title={file.file_name}>
                      {file.file_name}
                    </span>

                    {busy === 'uploading' && <Loader size={12} className="text-blue-400 animate-spin shrink-0" />}
                    {busy === 'downloading' && <Loader size={12} className="text-green-400 animate-spin shrink-0" />}

                    {!busy && file.drive_file_id && (
                      <Cloud size={12} className="text-blue-400 shrink-0" />
                    )}
                    {!busy && !file.drive_file_id && (
                      <button
                        onClick={() => handleUploadToDrive(file.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Upload to Google Drive"
                      >
                        <Upload size={12} className="text-neutral-600 hover:text-blue-400" />
                      </button>
                    )}

                    <button
                      onClick={() => window.api.files.open(file.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Open file"
                    >
                      <ExternalLink size={12} className="text-neutral-600 hover:text-neutral-300" />
                    </button>
                    <button
                      onClick={() => window.api.files.reveal(file.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Show in Finder"
                    >
                      <FolderOpen size={12} className="text-neutral-600 hover:text-neutral-300" />
                    </button>
                    <button
                      onClick={() => handleDeleteAttachment(file.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove attachment"
                    >
                      <Trash2 size={12} className="text-neutral-600 hover:text-red-400" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Mark complete CTA (only when not completed) */}
        {!isCompleted && (
          <button
            onClick={() => quickUpdate({ status: 'Completed' })}
            className="mt-6 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-neutral-700 text-neutral-500 hover:text-green-400 hover:border-green-700/50 hover:bg-green-900/10 text-sm transition-colors"
          >
            <CheckCircle2 size={15} />
            Mark as complete
          </button>
        )}

        {isCompleted && (
          <button
            onClick={() => quickUpdate({ status: 'Not Started' })}
            className="mt-6 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-neutral-700 text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
          >
            <X size={13} />
            Reopen task
          </button>
        )}
      </div>
    </div>
  )
}
