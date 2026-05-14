import { app, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { getAutoLaunchEnabled } from './autoLaunch.js'

function resolveTrayIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.png')
  }
  return join(__dirname, '../../resources/icon.png')
}

export interface TrayCallbacks {
  onToggleWidget: () => void
  onOpenHistory: () => void
  onAutoLaunchChange: (enabled: boolean) => void
  onSignOut: () => void
  // Optional — only wired when the autoUpdater is enabled (packaged builds).
  onCheckForUpdates?: () => void
}

let tray: Tray | null = null
let callbacks: TrayCallbacks | null = null
let isLoggedIn = false

export function createTray(cb: TrayCallbacks): Tray {
  callbacks = cb

  let icon = nativeImage.createEmpty()
  try {
    const iconPath = resolveTrayIconPath()
    icon = nativeImage.createFromPath(iconPath)
    icon = icon.resize({ width: process.platform === 'darwin' ? 22 : 16 })
  } catch (err) {
    console.error('[tray] Failed to load tray icon:', err)
    // leave icon empty — app still works, just no tray icon image
  }

  tray = new Tray(icon)
  tray.setToolTip('NudgePeek')

  if (process.platform === 'darwin') {
    tray.setIgnoreDoubleClickEvents(true)
  } else {
    // Windows / Linux: single click toggles widget
    tray.on('click', () => callbacks?.onToggleWidget())
  }

  refreshMenu()
  return tray
}

export function setTrayLoggedIn(state: boolean): void {
  isLoggedIn = state
  refreshMenu()
}

function refreshMenu(): void {
  if (!tray || !callbacks) return
  const cb = callbacks
  const autoEnabled = getAutoLaunchEnabled()

  const signOutItem: Electron.MenuItemConstructorOptions = {
    label: 'Sign Out',
    click: () => cb.onSignOut(),
  }

  const checkUpdatesItem: Electron.MenuItemConstructorOptions | null = cb.onCheckForUpdates
    ? { label: 'Check for Updates…', click: () => cb.onCheckForUpdates?.() }
    : null

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Show / Hide Widget', click: () => cb.onToggleWidget() },
    { label: 'Open History', click: () => cb.onOpenHistory() },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: autoEnabled,
      click: (item) => cb.onAutoLaunchChange(item.checked),
    },
    ...(checkUpdatesItem ? [checkUpdatesItem] : []),
    { type: 'separator' },
    ...(isLoggedIn ? [signOutItem] : []),
    { label: 'Quit NudgePeek', role: 'quit' },
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template))
}
