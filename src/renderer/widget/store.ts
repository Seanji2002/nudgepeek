import { create } from 'zustand'

export interface PhotoFrame {
  photoId: string
  signedUrl: string
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

export const useWidgetStore = create<WidgetState>((set) => ({
  currentPhoto: null,
  prevPhoto: null,
  showPrev: false,
  revealedId: null,

  setPhoto: (photo) =>
    set((s) => ({
      prevPhoto: s.currentPhoto,
      currentPhoto: photo,
      showPrev: s.currentPhoto !== null,
      revealedId: null,
    })),

  clearPrev: () => set({ prevPhoto: null, showPrev: false }),

  revealCurrent: () => set((s) => ({ revealedId: s.currentPhoto?.photoId ?? s.revealedId })),
}))
