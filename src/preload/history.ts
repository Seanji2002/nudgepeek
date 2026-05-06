import { contextBridge, ipcRenderer } from 'electron'

const CHANNELS = {
  GET_SESSION: 'auth:get-stored-session',
  SESSION_UPDATE: 'auth:session-update',
  FORCE_SIGNOUT: 'auth:force-signout',
  OPEN_IMAGE: 'dialog:open-image',
  PHOTO_INCOMING: 'photo:incoming',
  AUTOLAUNCH_GET: 'autolaunch:get-status',
  AUTOLAUNCH_SET: 'autolaunch:set',
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
})
