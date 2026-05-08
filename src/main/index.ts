import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import { initPrefs, getPref } from './store.js'
import { initSessionStorage, saveSession, loadSession, clearSession } from './session.js'
import {
  initSupabaseConfigStorage,
  saveSupabaseConfig,
  loadSupabaseConfig,
  clearSupabaseConfig,
} from './supabaseConfig.js'
import {
  createWidgetWindow,
  getWidgetWindow,
  showWidget,
  hideWidget,
  toggleWidget,
} from './windows/widget.js'
import { createHistoryWindow, getHistoryWindow, showHistoryWindow } from './windows/history.js'
import { createTray, setTrayLoggedIn } from './tray.js'
import { setAutoLaunch, getAutoLaunchEnabled } from './autoLaunch.js'
import { showPhotoNotification } from './notifications.js'
import {
  IPC_FROM_RENDERER,
  IPC_INVOKE,
  IPC_TO_RENDERER,
  type StoredSession,
  type StoredSupabaseConfig,
  type IncomingPhotoPayload,
  type DisplayPhotoPayload,
} from './ipc.js'

// ─── Single-instance lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  showHistoryWindow()
})

// ─── Boot ────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  initPrefs()
  initSessionStorage()
  initSupabaseConfigStorage()

  const storedSession = loadSession()

  const historyWin = createHistoryWindow()
  const widgetWin = createWidgetWindow()

  // Always show the history window on launch
  historyWin.once('ready-to-show', () => {
    showHistoryWindow()
  })

  // Show widget on first ready-to-show if we have a prior session
  widgetWin.once('ready-to-show', () => {
    if (storedSession && (getPref('widgetVisible') ?? true)) {
      showWidget()
    }
  })

  createTray({
    onToggleWidget: toggleWidget,
    onOpenHistory: showHistoryWindow,
    onAutoLaunchChange: setAutoLaunch,
    onSignOut: () => {
      clearSession()
      setTrayLoggedIn(false)
      hideWidget()
      getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.AUTH_FORCE_SIGNOUT)
    },
  })

  // ─── Auto-update (production builds only) ───────────────────────────────
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', (err) => console.error('[updater] error:', err))
    autoUpdater.on('update-downloaded', () => {
      console.log('[updater] update downloaded — will install on quit')
    })
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] checkForUpdatesAndNotify failed:', err)
    })
  }

  // ─── IPC: file dialog ───────────────────────────────────────────────────
  ipcMain.handle(IPC_INVOKE.DIALOG_OPEN_IMAGE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? historyWin
    return dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif'] },
      ],
    })
  })

  // ─── IPC: session ───────────────────────────────────────────────────────
  ipcMain.handle(IPC_INVOKE.AUTH_GET_STORED_SESSION, (): StoredSession | null => {
    return loadSession()
  })

  ipcMain.on(IPC_FROM_RENDERER.AUTH_SESSION_UPDATE, (_e, session: StoredSession | null) => {
    if (session) {
      saveSession(session)
      setTrayLoggedIn(true)
      if (!getWidgetWindow()?.isVisible()) showWidget()
    } else {
      clearSession()
      setTrayLoggedIn(false)
      hideWidget()
    }
  })

  // ─── IPC: incoming photo (history renderer → main → widget + notification)
  ipcMain.on(IPC_FROM_RENDERER.PHOTO_INCOMING, (_e, payload: IncomingPhotoPayload) => {
    const displayPayload: DisplayPhotoPayload = {
      photoId: payload.photoId,
      signedUrl: payload.signedUrl,
      senderName: payload.senderName,
      sentAt: payload.sentAt,
    }
    getWidgetWindow()?.webContents.send(IPC_TO_RENDERER.PHOTO_DISPLAY, displayPayload)

    if (!getWidgetWindow()?.isVisible()) showWidget()

    if (!payload.fromCurrentUser) {
      showPhotoNotification(payload.senderName, () => {
        showWidget()
        getWidgetWindow()?.focus()
      })
    }
  })

  // ─── IPC: widget close button ───────────────────────────────────────────
  ipcMain.on(IPC_FROM_RENDERER.WINDOW_HIDE_WIDGET, () => {
    hideWidget()
  })

  // ─── IPC: auto-launch ───────────────────────────────────────────────────
  ipcMain.handle(IPC_INVOKE.AUTOLAUNCH_GET_STATUS, () => ({
    enabled: getAutoLaunchEnabled(),
  }))

  ipcMain.on(IPC_FROM_RENDERER.AUTOLAUNCH_SET, (_e, enabled: boolean) => {
    setAutoLaunch(enabled)
  })

  // ─── IPC: Supabase project config (BYO Supabase) ───────────────────────
  ipcMain.handle(IPC_INVOKE.SUPABASE_CONFIG_GET, (): StoredSupabaseConfig | null => {
    return loadSupabaseConfig()
  })

  ipcMain.handle(IPC_INVOKE.SUPABASE_CONFIG_SET, (_e, config: StoredSupabaseConfig) => {
    if (!config?.url || !config?.anonKey) {
      throw new Error('Both url and anonKey are required')
    }
    saveSupabaseConfig({ url: config.url, anonKey: config.anonKey })
    return true
  })

  ipcMain.handle(IPC_INVOKE.SUPABASE_CONFIG_CLEAR, () => {
    clearSupabaseConfig()
    clearSession()
    setTrayLoggedIn(false)
    hideWidget()
    return true
  })
})

// Keep running when all windows are closed (lives in tray)
app.on('window-all-closed', () => {
  // Intentionally do nothing — app persists in tray
})

app.on('activate', () => {
  showHistoryWindow()
})
