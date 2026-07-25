import { ipcMain, app } from 'electron'
import { getDb } from './database'
import { join } from 'path'
import * as fs from 'fs'

const configPath = join(app.getPath('userData'), 'config.json')

function readConfig(): Record<string, unknown> {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function writeConfig(config: Record<string, unknown>) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function getSettingRaw(key: string): unknown {
  return readConfig()[key]
}

export function setSettingRaw(key: string, value: unknown) {
  const config = readConfig()
  config[key] = value
  writeConfig(config)
}

export function getSettingsDbPath(): string {
  return configPath
}

export function registerSettingsHandlers() {
  // Settings stored in the SQLite app_settings table
  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      const db = getDb()
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      if (!row) return null
      try { return JSON.parse(row.value) } catch { return row.value }
    } catch {
      // Fall back to config.json for early-boot settings
      return readConfig()[key] ?? null
    }
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    try {
      const db = getDb()
      db.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, JSON.stringify(value))
    } catch {
      const config = readConfig()
      config[key] = value
      writeConfig(config)
    }
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    try {
      const db = getDb()
      const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{
        key: string
        value: string
      }>
      const result: Record<string, unknown> = {}
      for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value) } catch { result[row.key] = row.value }
      }
      return result
    } catch {
      return readConfig()
    }
  })
}
