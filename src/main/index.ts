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
import {
  initVaultStorage,
  saveGroupKey,
  loadGroupKey,
  loadAllGroupKeys,
  clearGroupKey,
  clearAllGroupKeys,
} from './vault.js'
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
import {
  showPhotoNotification,
  showSummaryNotification,
  showInfoNotification,
} from './notifications.js'
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

  // ─── Auto-update (production builds only) ───────────────────────────────
  // The renderer drives the user flow: a popup asks before downloading and
  // again before installing. autoInstallOnAppQuit stays off so quitting from
  // the tray never silently restarts the user mid-action.
  //
  // `manualCheckPending` distinguishes the startup auto-check (silent on
  // up-to-date / error) from a user-triggered "Check for Updates…" click
  // (needs visible feedback either way).
  let manualCheckPending = false

  const triggerManualUpdateCheck = () => {
    if (!app.isPackaged) {
      showInfoNotification('Updates disabled in dev', 'Auto-updates only run in packaged builds.')
      return
    }
    manualCheckPending = true
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] manual checkForUpdates failed:', err)
      if (manualCheckPending) {
        manualCheckPending = false
        showInfoNotification(
          "Couldn't check for updates",
          'Check your internet connection and try again.',
        )
      }
    })
  }

  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      if (manualCheckPending) {
        manualCheckPending = false
        showInfoNotification("Couldn't check for updates", err.message || 'Unknown error.')
      }
    })

    autoUpdater.on('update-available', (info) => {
      manualCheckPending = false // the modal is the user-facing feedback
      getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.UPDATE_AVAILABLE, {
        version: info.version,
      })
    })

    autoUpdater.on('update-not-available', () => {
      if (manualCheckPending) {
        manualCheckPending = false
        showInfoNotification(
          "You're up to date",
          `NudgePeek ${app.getVersion()} is the latest version.`,
        )
      }
    })

    autoUpdater.on('download-progress', (p) => {
      getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.UPDATE_PROGRESS, {
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      manualCheckPending = false
      getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.UPDATE_DOWNLOADED, {
        version: info.version,
      })
    })

    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates failed:', err)
    })
  }

  createTray({
    onToggleWidget: toggleWidget,
    onOpenHistory: showHistoryWindow,
    onAutoLaunchChange: setAutoLaunch,
    onSignOut: () => {
      clearSession()
      clearAllGroupKeys()
      setTrayLoggedIn(false)
      hideWidget()
      getHistoryWindow()?.webContents.send(IPC_TO_RENDERER.AUTH_FORCE_SIGNOUT)
    },
    onCheckForUpdates: app.isPackaged ? triggerManualUpdateCheck : undefined,
  })

  // ─── IPC: updater (renderer drives the flow) ────────────────────────────
  ipcMain.handle(IPC_INVOKE.UPDATER_DOWNLOAD, () => autoUpdater.downloadUpdate())
  ipcMain.handle(IPC_INVOKE.UPDATER_INSTALL, () => autoUpdater.quitAndInstall())

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
      // Only auto-show the widget when the user hasn't explicitly hidden it.
      // Supabase fires session updates on every token refresh (~hourly), and
      // we don't want those background refreshes to keep popping the widget
      // back open after the user has closed it.
      if (!getWidgetWindow()?.isVisible() && (getPref('widgetVisible') ?? true)) {
        showWidget()
      }
    } else {
      clearSession()
      clearAllGroupKeys()
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
      groupId: payload.groupId,
      groupName: payload.groupName,
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
    clearAllGroupKeys()
    setTrayLoggedIn(false)
    hideWidget()
    return true
  })

  // ─── IPC: vault (per-group group keys) ──────────────────────────────────
  ipcMain.handle(IPC_INVOKE.VAULT_GET_GROUP, (_e, groupId: string): Uint8Array | null => {
    if (typeof groupId !== 'string' || !groupId) return null
    return loadGroupKey(groupId)
  })

  ipcMain.handle(IPC_INVOKE.VAULT_GET_ALL, (): Record<string, Uint8Array> => {
    const map = loadAllGroupKeys()
    const out: Record<string, Uint8Array> = {}
    for (const [k, v] of map) out[k] = v
    return out
  })

  ipcMain.handle(
    IPC_INVOKE.VAULT_SET_GROUP,
    (_e, payload: { groupId: string; key: Uint8Array }) => {
      if (!payload || typeof payload.groupId !== 'string' || !payload.groupId) {
        throw new Error('groupId must be a non-empty string')
      }
      if (!(payload.key instanceof Uint8Array) || payload.key.length === 0) {
        throw new Error('vault key must be a non-empty Uint8Array')
      }
      saveGroupKey(payload.groupId, payload.key)
    },
  )

  ipcMain.handle(IPC_INVOKE.VAULT_CLEAR_GROUP, (_e, groupId: string) => {
    if (typeof groupId === 'string' && groupId) clearGroupKey(groupId)
  })

  ipcMain.handle(IPC_INVOKE.VAULT_CLEAR_ALL, () => {
    clearAllGroupKeys()
  })
})

// Keep running when all windows are closed (lives in tray)
app.on('window-all-closed', () => {
  // Intentionally do nothing — app persists in tray
})

app.on('activate', () => {
  showHistoryWindow()
})
