import { contextBridge, ipcRenderer } from 'electron'

const PHOTO_DISPLAY = 'photo:display'
const HIDE_WIDGET = 'window:hide-widget'

interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  sentAt: string
  hidden: boolean
}

contextBridge.exposeInMainWorld('nudgeWidget', {
  onPhotoDisplay: (callback: (payload: DisplayPhotoPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: DisplayPhotoPayload) =>
      callback(payload)
    ipcRenderer.on(PHOTO_DISPLAY, handler)
    return () => ipcRenderer.off(PHOTO_DISPLAY, handler)
  },

  hideWidget: () => {
    ipcRenderer.send(HIDE_WIDGET)
  },
})
