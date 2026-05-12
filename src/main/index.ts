import { app, BrowserWindow, ipcMain, dialog, session, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'
import { initPrefs, getPref } from './store.js'
import { initSessionStorage, saveSession, loadSession, clearSession } from './session.js'
import {
  initSupabaseConfigStorage,
  saveSupabaseConfig,
  loadSupabaseConfig,
  clearSupabaseConfig,
} from './supabaseConfig.js'
import { initVaultStorage, saveVault, loadVault, clearVault } from './vault.js'
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
import { showPhotoNotification, showSummaryNotification } from './notifications.js'
import {
  IPC_FROM_RENDERER,
  IPC_INVOKE,
  IPC_TO_RENDERER,
  type StoredSession,
  type StoredSupabaseConfig,
  type IncomingPhotoPayload,
  type DisplayPhotoPayload,
  type SeedQueuePayload,
  type WidgetAckPayload,
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
  initVaultStorage()

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
      clearVault()
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
      clearVault()
      setTrayLoggedIn(false)
      hideWidget()
    }
  })

  // ─── IPC: incoming photo (history renderer → main → widget + notification)
  // Self-photos skip the widget entirely (the DB auto-acks them via trigger,
  // so they'd never appear in the unread queue anyway).
  ipcMain.on(IPC_FROM_RENDERER.PHOTO_INCOMING, (_e, payload: IncomingPhotoPayload) => {
    if (payload.fromCurrentUser) return

    const displayPayload: DisplayPhotoPayload = {
      photoId: payload.photoId,
      photoBytes: payload.photoBytes,
      senderName: payload.senderName,
      sentAt: payload.sentAt,
      hidden: payload.hidden,
    }
    getWidgetWindow()?.webContents.send(IPC_TO_RENDERER.PHOTO_DISPLAY, displayPayload)

    if (!getWidgetWindow()?.isVisible()) showWidget()

    showPhotoNotification(payload.senderName, payload.hidden, () => {
      showWidget()
      getWidgetWindow()?.focus()
    })
  })

  // ─── IPC: history → main → widget (bulk seed of unread queue) ───────────
  ipcMain.on(IPC_FROM_RENDERER.HISTORY_SEED_QUEUE, (_e, payload: SeedQueuePayload) => {
    const photos = payload?.photos ?? []
    getWidgetWindow()?.webContents.send(IPC_TO_RENDERER.PHOTO_SEED_QUEUE, { photos })

    if (photos.length === 0) return

    if (!getWidgetWindow()?.isVisible()) showWidget()

    if (photos.length === 1) {
      showPhotoNotification(photos[0].senderName, photos[0].hidden, () => {
        showWidget()
        getWidgetWindow()?.focus()
      })
    } else {
      showSummaryNotification(
        photos.length,
        photos.map((p) => p.senderName),
        () => {
          showWidget()
          getWidgetWindow()?.focus()
        },
      )
    }
  })

  // ─── IPC: widget → main → history (ack a photo) ─────────────────────────
  ipcMain.on(IPC_FROM_RENDERER.WIDGET_ACK, (_e, payload: WidgetAckPayload) => {
    if (!payload?.photoId) return
    getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.WIDGET_ACK_FORWARD, payload)
  })

  // ─── Power resume → tell history to re-seed the widget queue ────────────
  // macOS can fire 'resume' multiple times in quick succession; 1s leading
  // debounce avoids hammering history.
  let lastResumeAt = 0
  powerMonitor.on('resume', () => {
    const now = Date.now()
    if (now - lastResumeAt < 1000) return
    lastResumeAt = now
    getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.POWER_RESUME)
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
    clearVault()
    setTrayLoggedIn(false)
    hideWidget()
    return true
  })

  // ─── IPC: vault (group key) ─────────────────────────────────────────────
  ipcMain.handle(IPC_INVOKE.VAULT_GET, (): Uint8Array | null => {
    return loadVault()
  })

  ipcMain.handle(IPC_INVOKE.VAULT_SET, (_e, key: Uint8Array) => {
    if (!(key instanceof Uint8Array) || key.length === 0) {
      throw new Error('vault key must be a non-empty Uint8Array')
    }
    saveVault(key)
  })

  ipcMain.handle(IPC_INVOKE.VAULT_CLEAR, () => {
    clearVault()
  })
})

// Keep running when all windows are closed (lives in tray)
app.on('window-all-closed', () => {
  // Intentionally do nothing — app persists in tray
})

app.on('activate', () => {
  showHistoryWindow()
})
