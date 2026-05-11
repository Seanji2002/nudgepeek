import { create } from 'zustand'

export interface PhotoFrame {
  photoId: string
  displayUrl: string
  senderName: string
  sentAt: string
  hidden: boolean
}

interface WidgetState {
  currentPhoto: PhotoFrame | null
  prevPhoto: PhotoFrame | null
  showPrev: boolean
  revealedId: string | null
  setPhoto: (photo: PhotoFrame) => void
  clearPrev: () => void
  revealCurrent: () => void
}

function revoke(url: string | undefined) {
  if (url) URL.revokeObjectURL(url)
}

export const useWidgetStore = create<WidgetState>((set) => ({
  currentPhoto: null,
  prevPhoto: null,
  showPrev: false,
  revealedId: null,

  setPhoto: (photo) =>
    set((s) => {
      // The new "prev" replaces whatever was already in the prev slot, so revoke
      // that older blob URL — its <img> is no longer on screen.
      revoke(s.prevPhoto?.displayUrl)
      return {
        prevPhoto: s.currentPhoto,
        currentPhoto: photo,
        showPrev: s.currentPhoto !== null,
        revealedId: null,
      }
    }),

  clearPrev: () =>
    set((s) => {
      revoke(s.prevPhoto?.displayUrl)
      return { prevPhoto: null, showPrev: false }
    }),

  revealCurrent: () => set((s) => ({ revealedId: s.currentPhoto?.photoId ?? s.revealedId })),
}))
