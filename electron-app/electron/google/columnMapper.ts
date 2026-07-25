export interface ColumnMapping {
  title: string | null
  description: string | null
  status: string | null
  priority: string | null
  due_date: string | null
  category: string | null
  assigned_to: string | null
  last_modified: string | null
}

const FIELD_ALIASES: Record<keyof ColumnMapping, string[]> = {
  title:         ['title', 'task', 'task name', 'name', 'summary', 'subject'],
  description:   ['description', 'desc', 'notes', 'details', 'body', 'note'],
  status:        ['status', 'state', 'stage'],
  priority:      ['priority', 'pri', 'urgency', 'importance'],
  due_date:      ['due date', 'due', 'deadline', 'date', 'target date', 'due_date'],
  category:      ['category', 'cat', 'type', 'label', 'tag', 'project', 'area'],
  assigned_to:   ['assigned to', 'assignee', 'owner', 'assigned', 'responsible', 'assigned_to'],
  last_modified: ['last modified', 'modified', 'updated', 'last updated', 'last_modified', 'timestamp'],
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()
}

export function suggestMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    title: null, description: null, status: null, priority: null,
    due_date: null, category: null, assigned_to: null, last_modified: null,
  }

  for (const field of Object.keys(mapping) as Array<keyof ColumnMapping>) {
    const aliases = FIELD_ALIASES[field]
    for (const col of columns) {
      const norm = normalize(col)
      if (aliases.some(a => norm === a || norm.startsWith(a))) {
        mapping[field] = col
        break
      }
    }
  }

  return mapping
}

export const DEFAULT_COLUMNS = ['Title', 'Description', 'Status', 'Priority', 'Due Date', 'Category', 'Last Modified']

export const DEFAULT_MAPPING: ColumnMapping = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  due_date: 'Due Date',
  category: 'Category',
  assigned_to: null,
  last_modified: 'Last Modified',
}

export function getColumnLetter(n: number): string {
  let result = ''
  while (n > 0) {
    n--
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}
