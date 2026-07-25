import { useState, useEffect } from 'react'
import { X, RefreshCw, CheckCircle2, AlertCircle, ChevronDown, ExternalLink, LogOut, Loader, PlusCircle } from 'lucide-react'
import { useTasks } from '../../hooks/useTasks'
import { useStore } from '../../hooks/useStore'
import type { SyncSettings, ColumnMapping } from '../../types'

type Stage = 'loading' | 'credentials' | 'authenticating' | 'name-workspace' | 'configure' | 'mapping' | 'ready'

const APP_FIELDS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: 'title',         label: 'Title' },
  { key: 'description',  label: 'Description' },
  { key: 'status',       label: 'Status' },
  { key: 'priority',     label: 'Priority' },
  { key: 'due_date',     label: 'Due Date' },
  { key: 'category',     label: 'Category' },
  { key: 'assigned_to',  label: 'Assigned To' },
  { key: 'last_modified',label: 'Last Modified' },
]

interface SyncPanelProps {
  onClose: () => void
}

export function SyncPanel({ onClose }: SyncPanelProps) {
  const { refresh } = useTasks()
  const { activeWorkspace: WORKSPACE, setWorkspaces, setActiveWorkspace } = useStore()

  const [stage, setStage] = useState<Stage>('loading')
  const [settings, setSettings] = useState<SyncSettings | null>(null)
  const [credPath, setCredPath] = useState('')
  const [sheetId, setSheetId] = useState('')
  const [tabName, setTabName] = useState('Tasks')
  const [mapping, setMapping] = useState<ColumnMapping>({
    title: null, description: null, status: null, priority: null,
    due_date: null, category: null, assigned_to: null, last_modified: null,
  })
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; msg: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [showCloudGuide, setShowCloudGuide] = useState(false)
  const [showSheetGuide, setShowSheetGuide] = useState(false)

  useEffect(() => {
    (async () => {
      const s = await window.api.sync.getSettings(WORKSPACE)
      const isAuth = await window.api.sync.isAuthenticated(WORKSPACE)
      if (s) {
        setSettings(s)
        setCredPath(s.credentials_path ?? '')
        setSheetId(s.sheet_id ?? '')
        setTabName(s.sync_tab_name ?? 'Tasks')
        if (s.column_mapping) setMapping(s.column_mapping)
        if (s.detected_columns?.length) setDetectedColumns(s.detected_columns)
      }

      if (!isAuth || !s?.credentials_path) {
        setStage('credentials')
      } else if (!s?.sheet_id) {
        setStage('configure')
      } else if (!s?.column_mapping) {
        setStage('mapping')
      } else {
        setStage('ready')
      }
    })()
  }, [])

  const pickCredentials = async () => {
    const path = await window.api.sync.openCredentials()
    if (path) setCredPath(path)
  }

  const authenticate = async () => {
    if (!credPath) return
    setStage('authenticating')
    setStatus({ type: 'info', msg: 'Opening browser for Google sign-in…' })
    try {
      const { email } = await window.api.sync.authenticate(credPath, WORKSPACE)
      setWorkspaceName(email ?? '')
      setStatus({ type: 'success', msg: 'Authenticated successfully' })
      setStage('name-workspace')
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) })
      setStage('credentials')
    }
  }

  const finalizeWorkspace = async () => {
    const name = workspaceName.trim()
    if (!name) return
    try {
      const newWs = await window.api.sync.finalizeWorkspace(name, credPath)
      const updated = await window.api.lookups.workspaces()
      setWorkspaces(updated)
      setActiveWorkspace(newWs.name)
      setStatus({ type: 'info', msg: `Workspace "${newWs.display_name}" created — now configure your sheet.` })
      setStage('configure')
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) })
    }
  }

  const detectAndMap = async () => {
    if (!sheetId) { setStatus({ type: 'error', msg: 'Enter a Sheet ID first' }); return }
    setStatus({ type: 'info', msg: 'Detecting columns…' })
    try {
      await window.api.sync.saveSettings(WORKSPACE, {
        sheet_id: sheetId,
        sync_tab_name: tabName,
        credentials_path: credPath || undefined,
      })
      const { columns, mapping: suggested, isEmpty } = await window.api.sync.detectColumns(WORKSPACE)
      setDetectedColumns(columns)
      setMapping(suggested)
      setStatus({
        type: isEmpty ? 'info' : 'success',
        msg: isEmpty
          ? 'Sheet has no columns yet — default columns will be created automatically on first sync'
          : `Found ${columns.filter(c => !c.startsWith('_')).length} columns`,
      })
      setStage('mapping')
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) })
    }
  }

  const saveMapping = async () => {
    await window.api.sync.saveSettings(WORKSPACE, {
      sheet_id: sheetId,
      sync_tab_name: tabName,
      column_mapping: mapping,
    })
    setStage('ready')
    setStatus({ type: 'success', msg: 'Configuration saved' })
  }

  const doSync = async () => {
    setSyncing(true)
    setStatus({ type: 'info', msg: 'Syncing…' })
    try {
      const result = await window.api.sync.sync(WORKSPACE)
      await refresh()
      setStatus({
        type: 'success',
        msg: `Done — ↓ ${result.added} added, ${result.updated} updated, ${result.deleted} deleted  ↑ ${result.pushed + result.pushedNew} pushed`,
      })
      // Refresh displayed settings (last_sync)
      const s = await window.api.sync.getSettings(WORKSPACE)
      if (s) setSettings(s)
    } catch (e) {
      setStatus({ type: 'error', msg: String(e) })
    } finally {
      setSyncing(false)
    }
  }

  const revoke = async () => {
    await window.api.sync.revokeAuth(WORKSPACE)
    setStage('credentials')
    setStatus({ type: 'info', msg: 'Signed out' })
  }

  const visibleColumns = detectedColumns.filter(c => !c.startsWith('_'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Google Sheets Sync</h2>
            {settings?.last_sync && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Last synced {new Date(settings.last_sync).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status bar */}
          {status && (
            <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-md ${
              status.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800/40' :
              status.type === 'error'   ? 'bg-red-900/30 text-red-400 border border-red-800/40' :
                                          'bg-blue-900/30 text-blue-400 border border-blue-800/40'
            }`}>
              {status.type === 'success' ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> :
               status.type === 'error'   ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> :
                                            <Loader size={13} className="shrink-0 mt-0.5 animate-spin" />}
              <span>{status.msg}</span>
            </div>
          )}

          {/* ── STEP 1: Credentials ─────────────────────────────────── */}
          {stage !== 'loading' && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">1. Google Account</h3>
              {stage === 'credentials' || stage === 'authenticating' ? (
                <div className="space-y-2">
                  {/* Expandable Cloud setup guide */}
                  <button
                    onClick={() => setShowCloudGuide(v => !v)}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400"
                  >
                    <ChevronDown size={12} className={`transition-transform ${showCloudGuide ? '' : '-rotate-90'}`} />
                    {showCloudGuide ? 'Hide' : 'How to get a credentials file from Google'}
                  </button>
                  {showCloudGuide && (
                    <div className="bg-neutral-800/60 rounded-md px-3 py-3 space-y-3 text-xs text-neutral-400 border border-neutral-700/60">
                      <div>
                        <p className="text-neutral-300 font-medium mb-1">1. Create a Google Cloud project</p>
                        <p>Go to{' '}
                          <button onClick={() => window.api.shell.openExternal('https://console.cloud.google.com/')} className="text-blue-500 hover:text-blue-400 underline">console.cloud.google.com</button>
                          , click <em>Select a project</em> → <em>New Project</em>, give it any name, and click Create.
                        </p>
                      </div>
                      <div>
                        <p className="text-neutral-300 font-medium mb-1">2. Enable the required APIs</p>
                        <p className="mb-1">Go to <em>☰ Menu → APIs &amp; Services → Library</em>. Search for and enable each of these:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-neutral-500">
                          <li><strong className="text-neutral-400">Google Sheets API</strong> — for task sync</li>
                          <li><strong className="text-neutral-400">Google Drive API</strong> — for file attachments</li>
                        </ul>
                      </div>
                      <div>
                        <p className="text-neutral-300 font-medium mb-1">3. Configure the OAuth consent screen</p>
                        <p className="mb-1">Go to <em>☰ Menu → APIs &amp; Services → OAuth consent screen</em>.</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>User type: <strong>External</strong> → Create</li>
                          <li>Fill in App name + your email, then finish the form</li>
                          <li>You'll land on an <strong>OAuth Overview</strong> page — click the <strong>Data Access</strong> tab</li>
                          <li>Click <em>Add or Remove Scopes</em> and check these two:
                            <ul className="list-disc list-inside ml-4 mt-0.5 text-neutral-500 space-y-0.5">
                              <li>.../auth/<strong className="text-neutral-400">spreadsheets</strong></li>
                              <li>.../auth/<strong className="text-neutral-400">drive.file</strong></li>
                            </ul>
                          </li>
                          <li>Click Update to save the scopes</li>
                          <li>Go to the <strong>Audience</strong> tab → under <em>Test users</em>, add your Gmail address</li>
                        </ul>
                      </div>
                      <div>
                        <p className="text-neutral-300 font-medium mb-1">4. Create credentials</p>
                        <p className="mb-1">Go to <em>☰ Menu → APIs &amp; Services → Credentials</em>.</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>Click <em>+ Create Credentials → OAuth client ID</em></li>
                          <li>Application type: <strong>Desktop app</strong> → Create</li>
                          <li>Click the <strong>⬇ Download JSON</strong> button</li>
                          <li>Save the file anywhere on your Mac — you'll browse to it below</li>
                        </ul>
                      </div>
                      <p className="text-neutral-500 pt-1 border-t border-neutral-700">
                        The first time you sign in, Google may show an "unverified app" warning.
                        Click <em>Advanced → Go to [app name] (unsafe)</em> to continue — this is expected for personal tools.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">Select the <code className="bg-neutral-800 px-1 rounded">credentials.json</code> file you downloaded from Google Cloud Console.</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-400 font-mono truncate">
                      {credPath || 'No credentials.json selected'}
                    </div>
                    <button onClick={pickCredentials}
                      className="px-2.5 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs rounded-md transition-colors shrink-0">
                      Browse…
                    </button>
                  </div>
                  <button
                    onClick={authenticate}
                    disabled={!credPath || stage === 'authenticating'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-md transition-colors"
                  >
                    <ExternalLink size={13} />
                    {stage === 'authenticating' ? 'Waiting for browser…' : 'Sign in with Google'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-neutral-800/60 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-green-500" />
                      <span className="text-sm text-neutral-300">Authenticated</span>
                    </div>
                    <button onClick={revoke} className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400">
                      <LogOut size={11} /> Sign out
                    </button>
                  </div>
                  <button
                    onClick={() => { setCredPath(''); setStatus(null); setStage('credentials') }}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 px-1"
                  >
                    <PlusCircle size={12} /> Add another Google account
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ── STEP 1b: Name the workspace ─────────────────────────── */}
          {stage === 'name-workspace' && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">2. Name your workspace</h3>
              <p className="text-xs text-neutral-500 mb-3">
                A new workspace will be created for this Google account. You can rename it anytime in Settings.
              </p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={workspaceName}
                  onChange={e => setWorkspaceName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && finalizeWorkspace()}
                  placeholder="e.g. your@email.com"
                  className="flex-1 bg-neutral-800 text-neutral-300 placeholder-neutral-600 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
                />
                <button
                  onClick={finalizeWorkspace}
                  disabled={!workspaceName.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-md transition-colors"
                >
                  Create
                </button>
              </div>
            </section>
          )}

          {/* ── STEP 2: Sheet configuration ─────────────────────────── */}
          {(stage === 'configure' || stage === 'mapping' || stage === 'ready') && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">2. Sheet</h3>
              <div className="space-y-2">
                {/* Expandable sheet creation guide */}
                <button
                  onClick={() => setShowSheetGuide(v => !v)}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400"
                >
                  <ChevronDown size={12} className={`transition-transform ${showSheetGuide ? '' : '-rotate-90'}`} />
                  {showSheetGuide ? 'Hide' : 'How to create or set up a Google Sheet'}
                </button>
                {showSheetGuide && (
                  <div className="bg-neutral-800/60 rounded-md px-3 py-3 space-y-3 text-xs text-neutral-400 border border-neutral-700/60">
                    <div>
                      <p className="text-neutral-300 font-medium mb-1">Create a new sheet</p>
                      <p>Go to{' '}
                        <button onClick={() => window.api.shell.openExternal('https://sheets.google.com/')} className="text-blue-500 hover:text-blue-400 underline">sheets.google.com</button>
                        {' '}and click <strong>+</strong> to create a blank spreadsheet. Rename it anything you like.
                      </p>
                    </div>
                    <div>
                      <p className="text-neutral-300 font-medium mb-1">Name the tab</p>
                      <p>Right-click the tab at the bottom of the sheet and rename it to <code className="bg-neutral-700 px-1 rounded text-neutral-300">Tasks</code> (case-sensitive). This is what you'll enter in the <em>Tab name</em> field below.</p>
                    </div>
                    <div>
                      <p className="text-neutral-300 font-medium mb-1">Column headers (optional)</p>
                      <p className="mb-1">You can leave the sheet blank and the app will set it up on first sync. Or add your own headers in row 1 — the app recognises these names automatically:</p>
                      <p className="text-neutral-500 font-mono">Title · Description · Status · Priority · Due Date · Category · Completed At</p>
                      <p className="mt-1">Any column name works — you can map them manually in Step 3.</p>
                    </div>
                    <div>
                      <p className="text-neutral-300 font-medium mb-1">Get the Sheet ID</p>
                      <p>You can paste the <strong>full URL</strong> from your browser's address bar — the app extracts the ID automatically. Or paste just the ID (the part between <code className="bg-neutral-700 px-1 rounded text-neutral-300">/d/</code> and <code className="bg-neutral-700 px-1 rounded text-neutral-300">/edit</code>).</p>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Sheet ID</label>
                  <input
                    value={sheetId}
                    onChange={e => {
                      const val = e.target.value
                      const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
                      setSheetId(match ? match[1] : val)
                    }}
                    placeholder="Paste the Sheet ID or the full URL"
                    className="w-full bg-neutral-800 text-neutral-300 placeholder-neutral-600 rounded-md px-2.5 py-1.5 text-xs font-mono border border-neutral-700 focus:outline-none focus:border-neutral-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Tab name</label>
                  <input
                    value={tabName}
                    onChange={e => setTabName(e.target.value)}
                    className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-sm border border-neutral-700 focus:outline-none focus:border-neutral-500"
                  />
                </div>
                <button onClick={detectAndMap}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-sm rounded-md transition-colors">
                  <RefreshCw size={13} /> Detect columns
                </button>
              </div>
            </section>
          )}

          {/* ── STEP 3: Column mapping ───────────────────────────────── */}
          {(stage === 'mapping' || stage === 'ready') && detectedColumns.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">3. Column mapping</h3>
              <div className="space-y-1.5">
                {APP_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-28 text-xs text-neutral-400 shrink-0">{label}</span>
                    <div className="relative flex-1">
                      <select
                        value={mapping[key] ?? ''}
                        onChange={e => setMapping({ ...mapping, [key]: e.target.value || null })}
                        className="w-full bg-neutral-800 text-neutral-300 rounded-md px-2.5 py-1.5 text-xs border border-neutral-700 focus:outline-none focus:border-neutral-500 appearance-none"
                      >
                        <option value="">— not mapped —</option>
                        {visibleColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
              {stage === 'mapping' && (
                <button onClick={saveMapping}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors">
                  <CheckCircle2 size={13} /> Save mapping
                </button>
              )}
            </section>
          )}

          {/* ── STEP 4: Sync ─────────────────────────────────────────── */}
          {stage === 'ready' && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">4. Sync</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Bidirectional sync: pulls new/updated rows from the sheet, then pushes local changes back.
                Conflict resolution favours the record with the newer <em>last_modified</em> timestamp.
              </p>
              <button
                onClick={doSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
              >
                {syncing
                  ? <><Loader size={14} className="animate-spin" /> Syncing…</>
                  : <><RefreshCw size={14} /> Sync Now</>
                }
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
