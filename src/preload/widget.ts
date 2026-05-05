import { contextBridge, ipcRenderer } from 'electron'

const PHOTO_DISPLAY = 'photo:display'
const HIDE_WIDGET = 'window:hide-widget'

contextBridge.exposeInMainWorld('nudgeWidget', {
  onPhotoDisplay: (callback: (payload: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on(PHOTO_DISPLAY, handler)
    return () => ipcRenderer.off(PHOTO_DISPLAY, handler)
  },

  hideWidget: () => {
    ipcRenderer.send(HIDE_WIDGET)
  },
})
