import { safeStorage, app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

let vaultPath = ''

export function initVaultStorage(): void {
  vaultPath = join(app.getPath('userData'), 'vault.enc')
}

export function saveVault(groupKey: Uint8Array): void {
  try {
    const b64 = Buffer.from(groupKey).toString('base64')
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(vaultPath, safeStorage.encryptString(b64))
    } else {
      fs.writeFileSync(vaultPath, b64, 'utf-8')
    }
  } catch (err) {
    console.error('[vault] Failed to save vault:', err)
  }
}

export function loadVault(): Uint8Array | null {
  try {
    if (!fs.existsSync(vaultPath)) return null
    const data = fs.readFileSync(vaultPath)
    const b64 = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(data)
      : data.toString('utf-8')
    return new Uint8Array(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function clearVault(): void {
  try {
    if (fs.existsSync(vaultPath)) fs.unlinkSync(vaultPath)
  } catch {}
}
