import { create } from 'zustand'
import type { PhotoWithMeta } from '../shared/types.js'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

interface HistoryState {
  user: AuthUser | null
  photos: PhotoWithMeta[]
  isLoading: boolean
  isSending: boolean
  sendError: string | null

  setUser: (user: AuthUser | null) => void
  setPhotos: (photos: PhotoWithMeta[]) => void
  prependPhoto: (photo: PhotoWithMeta) => void
  setLoading: (v: boolean) => void
  setSending: (v: boolean) => void
  setSendError: (msg: string | null) => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  user: null,
  photos: [],
  isLoading: false,
  isSending: false,
  sendError: null,

  setUser: (user) => set({ user }),
  setPhotos: (photos) => set({ photos }),
  prependPhoto: (photo) => set((s) => ({ photos: [photo, ...s.photos] })),
  setLoading: (isLoading) => set({ isLoading }),
  setSending: (isSending) => set({ isSending }),
  setSendError: (sendError) => set({ sendError }),
}))
