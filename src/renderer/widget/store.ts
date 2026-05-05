import { create } from 'zustand'

export interface PhotoFrame {
  photoId: string
  signedUrl: string
  senderName: string
  sentAt: string
}

interface WidgetState {
  currentPhoto: PhotoFrame | null
  prevPhoto: PhotoFrame | null
  showPrev: boolean
  setPhoto: (photo: PhotoFrame) => void
  clearPrev: () => void
}

export const useWidgetStore = create<WidgetState>((set) => ({
  currentPhoto: null,
  prevPhoto: null,
  showPrev: false,

  setPhoto: (photo) =>
    set((s) => ({
      prevPhoto: s.currentPhoto,
      currentPhoto: photo,
      showPrev: s.currentPhoto !== null,
    })),

  clearPrev: () => set({ prevPhoto: null, showPrev: false }),
}))
