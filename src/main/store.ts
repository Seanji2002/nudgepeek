import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

interface Prefs {
  widgetX?: number
  widgetY?: number
  widgetVisible?: boolean
  autoLaunchEnabled?: boolean
}

let prefs: Prefs = {}
let storePath = ''

export function initPrefs(): void {
  storePath = join(app.getPath('userData'), 'prefs.json')
  try {
    prefs = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Prefs
  } catch {
    prefs = {}
  }
}

function persist(): void {
  try {
    fs.writeFileSync(storePath, JSON.stringify(prefs, null, 2), 'utf-8')
  } catch (err) {
    console.error('[store] Failed to persist prefs:', err)
  }
}

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return prefs[key]
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs[key] = value
  persist()
}
