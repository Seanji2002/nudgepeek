import { create } from 'zustand'

export interface PhotoFrame {
  photoId: string
  displayUrl: string
  senderName: string
  groupId: string
  groupName: string
  sentAt: string
  hidden: boolean
}

interface WidgetState {
  queue: PhotoFrame[]
  currentPhoto: PhotoFrame | null
  prevPhoto: PhotoFrame | null
  showPrev: boolean
  revealedId: string | null

  // Replace the queue with the canonical set from the server. Keeps the
  // currently-displayed photo's blob URL alive if it survives the new seed,
  // so the user doesn't see a flicker.
  seedQueue: (frames: PhotoFrame[]) => void

  // Append a single photo if not already in the queue.
  enqueue: (frame: PhotoFrame) => void

  // Pop the head, fire the IPC ack, animate it out via prevPhoto.
  ackCurrent: () => void

  // Existing helpers.
  clearPrev: () => void
  revealCurrent: () => void
}

function revoke(url: string | undefined) {
  if (url) URL.revokeObjectURL(url)
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
  queue: [],
  currentPhoto: null,
  prevPhoto: null,
  showPrev: false,
  revealedId: null,

  seedQueue: (incoming) =>
    set((s) => {
      const currentId = s.queue[0]?.photoId
      const nextQueue: PhotoFrame[] = []

      for (const frame of incoming) {
        if (frame.photoId === currentId && s.queue[0]) {
          // Re-use the live frame so its <img> doesn't flicker; drop the new URL.
          revoke(frame.displayUrl)
          nextQueue.push(s.queue[0])
        } else {
          nextQueue.push(frame)
        }
      }

      // Revoke URLs of old queue entries not carried over.
      const keptIds = new Set(nextQueue.map((f) => f.photoId))
      for (const old of s.queue) {
        if (!keptIds.has(old.photoId)) revoke(old.displayUrl)
      }

      const newHeadId = nextQueue[0]?.photoId ?? null
      return {
        queue: nextQueue,
        currentPhoto: nextQueue[0] ?? null,
        prevPhoto: null,
        showPrev: false,
        revealedId: newHeadId === currentId ? s.revealedId : null,
      }
    }),

  enqueue: (frame) =>
    set((s) => {
      if (s.queue.some((f) => f.photoId === frame.photoId)) {
        revoke(frame.displayUrl)
        return s
      }
      const nextQueue = [...s.queue, frame]
      return {
        queue: nextQueue,
        currentPhoto: nextQueue[0] ?? null,
      }
    }),

  ackCurrent: () => {
    const head = get().queue[0]
    if (!head) return
    window.nudgeWidget?.ackPhoto(head.photoId)
    set((s) => {
      revoke(s.prevPhoto?.displayUrl)
      const nextQueue = s.queue.slice(1)
      return {
        queue: nextQueue,
        currentPhoto: nextQueue[0] ?? null,
        prevPhoto: s.queue[0] ?? null,
        showPrev: s.queue[0] !== undefined,
        revealedId: null,
      }
    })
  },

  clearPrev: () =>
    set((s) => {
      revoke(s.prevPhoto?.displayUrl)
      return { prevPhoto: null, showPrev: false }
    }),

  revealCurrent: () => set((s) => ({ revealedId: s.currentPhoto?.photoId ?? s.revealedId })),
}))
