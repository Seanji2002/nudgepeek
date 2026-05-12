import { contextBridge, ipcRenderer } from 'electron'

const PHOTO_DISPLAY = 'photo:display'
const PHOTO_SEED_QUEUE = 'photo:seed-queue'
const HIDE_WIDGET = 'window:hide-widget'
const WIDGET_ACK = 'widget:ack'

interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  sentAt: string
  hidden: boolean
}

interface SeedQueuePayload {
  photos: DisplayPhotoPayload[]
}

contextBridge.exposeInMainWorld('nudgeWidget', {
  onPhotoDisplay: (callback: (payload: DisplayPhotoPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: DisplayPhotoPayload) =>
      callback(payload)
    ipcRenderer.on(PHOTO_DISPLAY, handler)
    return () => ipcRenderer.off(PHOTO_DISPLAY, handler)
  },

  onSeedQueue: (callback: (payload: SeedQueuePayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: SeedQueuePayload) => callback(payload)
    ipcRenderer.on(PHOTO_SEED_QUEUE, handler)
    return () => ipcRenderer.off(PHOTO_SEED_QUEUE, handler)
  },

  ackPhoto: (photoId: string) => {
    ipcRenderer.send(WIDGET_ACK, { photoId })
  },

  hideWidget: () => {
    ipcRenderer.send(HIDE_WIDGET)
  },
})
