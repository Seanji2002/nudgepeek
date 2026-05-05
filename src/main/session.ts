import { safeStorage, app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import type { StoredSession } from './ipc.js'

let sessionPath = ''

export function initSessionStorage(): void {
  sessionPath = join(app.getPath('userData'), 'session.enc')
}

export function saveSession(session: StoredSession): void {
  try {
    const json = JSON.stringify(session)
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(sessionPath, safeStorage.encryptString(json))
    } else {
      fs.writeFileSync(sessionPath, json, 'utf-8')
    }
  } catch (err) {
    console.error('[session] Failed to save session:', err)
  }
}

export function loadSession(): StoredSession | null {
  try {
    if (!fs.existsSync(sessionPath)) return null
    const data = fs.readFileSync(sessionPath)
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf-8')
    return JSON.parse(json) as StoredSession
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath)
  } catch {}
}
