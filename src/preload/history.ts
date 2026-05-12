import { contextBridge, ipcRenderer } from 'electron'

const CHANNELS = {
  GET_SESSION: 'auth:get-stored-session',
  SESSION_UPDATE: 'auth:session-update',
  FORCE_SIGNOUT: 'auth:force-signout',
  OPEN_IMAGE: 'dialog:open-image',
  PHOTO_INCOMING: 'photo:incoming',
  AUTOLAUNCH_GET: 'autolaunch:get-status',
  AUTOLAUNCH_SET: 'autolaunch:set',
  SUPABASE_CONFIG_GET: 'supabase:config-get',
  SUPABASE_CONFIG_SET: 'supabase:config-set',
  SUPABASE_CONFIG_CLEAR: 'supabase:config-clear',
  VAULT_GET: 'vault:get',
  VAULT_SET: 'vault:set',
  VAULT_CLEAR: 'vault:clear',
  HISTORY_SEED_QUEUE: 'photo:history-seeds',
  WIDGET_ACK_FORWARD: 'widget:ack-forward',
  POWER_RESUME: 'power:resume',
  UPDATE_AVAILABLE: 'updater:update-available',
  UPDATE_PROGRESS: 'updater:progress',
  UPDATE_DOWNLOADED: 'updater:downloaded',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
} as const

contextBridge.exposeInMainWorld('nudgeHistory', {
  getStoredSession: () => ipcRenderer.invoke(CHANNELS.GET_SESSION),

  updateSession: (session: unknown) => ipcRenderer.send(CHANNELS.SESSION_UPDATE, session),

  openImageDialog: () => ipcRenderer.invoke(CHANNELS.OPEN_IMAGE),

  sendIncomingPhoto: (payload: unknown) => ipcRenderer.send(CHANNELS.PHOTO_INCOMING, payload),

  onForceSignout: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(CHANNELS.FORCE_SIGNOUT, handler)
    return () => ipcRenderer.off(CHANNELS.FORCE_SIGNOUT, handler)
  },

  getAutoLaunchStatus: () => ipcRenderer.invoke(CHANNELS.AUTOLAUNCH_GET),

  setAutoLaunch: (enabled: boolean) => ipcRenderer.send(CHANNELS.AUTOLAUNCH_SET, enabled),

  getStoredSupabaseConfig: () => ipcRenderer.invoke(CHANNELS.SUPABASE_CONFIG_GET),

  setStoredSupabaseConfig: (config: { url: string; anonKey: string }) =>
    ipcRenderer.invoke(CHANNELS.SUPABASE_CONFIG_SET, config),

  clearStoredSupabaseConfig: () => ipcRenderer.invoke(CHANNELS.SUPABASE_CONFIG_CLEAR),

  getVault: () => ipcRenderer.invoke(CHANNELS.VAULT_GET) as Promise<Uint8Array | null>,

  setVault: (key: Uint8Array) => ipcRenderer.invoke(CHANNELS.VAULT_SET, key) as Promise<void>,

  clearVault: () => ipcRenderer.invoke(CHANNELS.VAULT_CLEAR) as Promise<void>,

  sendSeedQueue: (payload: unknown) => ipcRenderer.send(CHANNELS.HISTORY_SEED_QUEUE, payload),

  onWidgetAck: (callback: (photoId: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { photoId: string }) =>
      callback(payload.photoId)
    ipcRenderer.on(CHANNELS.WIDGET_ACK_FORWARD, handler)
    return () => ipcRenderer.off(CHANNELS.WIDGET_ACK_FORWARD, handler)
  },

  onPowerResume: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(CHANNELS.POWER_RESUME, handler)
    return () => ipcRenderer.off(CHANNELS.POWER_RESUME, handler)
  },

  onUpdateAvailable: (callback: (payload: { version: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { version: string }) =>
      callback(payload)
    ipcRenderer.on(CHANNELS.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.off(CHANNELS.UPDATE_AVAILABLE, handler)
  },

  onUpdateProgress: (
    callback: (payload: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void,
  ) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      payload: { percent: number; bytesPerSecond: number; transferred: number; total: number },
    ) => callback(payload)
    ipcRenderer.on(CHANNELS.UPDATE_PROGRESS, handler)
    return () => ipcRenderer.off(CHANNELS.UPDATE_PROGRESS, handler)
  },

  onUpdateDownloaded: (callback: (payload: { version: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { version: string }) =>
      callback(payload)
    ipcRenderer.on(CHANNELS.UPDATE_DOWNLOADED, handler)
    return () => ipcRenderer.off(CHANNELS.UPDATE_DOWNLOADED, handler)
  },

  downloadUpdate: () => ipcRenderer.invoke(CHANNELS.UPDATER_DOWNLOAD) as Promise<void>,

  installUpdate: () => ipcRenderer.invoke(CHANNELS.UPDATER_INSTALL) as Promise<void>,
})
