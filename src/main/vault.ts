import { safeStorage, app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

let vaultsDir = ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function initVaultStorage(): void {
  vaultsDir = join(app.getPath('userData'), 'vaults')
  if (!fs.existsSync(vaultsDir)) {
    fs.mkdirSync(vaultsDir, { recursive: true })
  }
  // Best-effort migration: if a legacy single-key vault.enc exists from the
  // pre-multi-group build, remove it so it doesn't sit around unused.
  const legacy = join(app.getPath('userData'), 'vault.enc')
  if (fs.existsSync(legacy)) {
    try {
      fs.unlinkSync(legacy)
    } catch {}
  }
}

function pathFor(groupId: string): string | null {
  if (!UUID_RE.test(groupId)) return null
  return join(vaultsDir, `${groupId.toLowerCase()}.enc`)
}

export function saveGroupKey(groupId: string, key: Uint8Array): void {
  const filePath = pathFor(groupId)
  if (!filePath) return
  try {
    const b64 = Buffer.from(key).toString('base64')
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(filePath, safeStorage.encryptString(b64))
    } else {
      fs.writeFileSync(filePath, b64, 'utf-8')
    }
  } catch (err) {
    console.error('[vault] Failed to save group key:', err)
  }
}

export function loadGroupKey(groupId: string): Uint8Array | null {
  const filePath = pathFor(groupId)
  if (!filePath) return null
  try {
    if (!fs.existsSync(filePath)) return null
    const data = fs.readFileSync(filePath)
    const b64 = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf-8')
    return new Uint8Array(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function loadAllGroupKeys(): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  try {
    if (!fs.existsSync(vaultsDir)) return out
    for (const entry of fs.readdirSync(vaultsDir)) {
      if (!entry.endsWith('.enc')) continue
      const groupId = entry.slice(0, -'.enc'.length)
      if (!UUID_RE.test(groupId)) continue
      const key = loadGroupKey(groupId)
      if (key) out.set(groupId, key)
    }
  } catch (err) {
    console.error('[vault] Failed to load all group keys:', err)
  }
  return out
}

export function clearGroupKey(groupId: string): void {
  const filePath = pathFor(groupId)
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

export function clearAllGroupKeys(): void {
  try {
    if (!fs.existsSync(vaultsDir)) return
    for (const entry of fs.readdirSync(vaultsDir)) {
      if (!entry.endsWith('.enc')) continue
      try {
        fs.unlinkSync(join(vaultsDir, entry))
      } catch {}
    }
  } catch {}
}
