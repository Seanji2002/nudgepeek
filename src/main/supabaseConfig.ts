import { safeStorage, app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import type { StoredSupabaseConfig } from './ipc.js'

let configPath = ''

export function initSupabaseConfigStorage(): void {
  configPath = join(app.getPath('userData'), 'supabase.enc')
}

export function saveSupabaseConfig(config: StoredSupabaseConfig): void {
  try {
    const json = JSON.stringify(config)
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(configPath, safeStorage.encryptString(json))
    } else {
      fs.writeFileSync(configPath, json, 'utf-8')
    }
  } catch (err) {
    console.error('[supabaseConfig] Failed to save config:', err)
    throw err
  }
}

export function loadSupabaseConfig(): StoredSupabaseConfig | null {
  try {
    if (!fs.existsSync(configPath)) return null
    const data = fs.readFileSync(configPath)
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf-8')
    return JSON.parse(json) as StoredSupabaseConfig
  } catch {
    return null
  }
}

export function clearSupabaseConfig(): void {
  try {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
  } catch {}
}
