import { create } from 'zustand'
import type { GroupSummary, PhotoWithMeta } from '../shared/types.js'
import type { UserKeypair } from '../shared/vault.js'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

interface HistoryState {
  user: AuthUser | null
  keypair: UserKeypair | null
  myGroups: GroupSummary[]
  currentGroupId: string | null
  groupKeys: Map<string, Uint8Array>
  photos: PhotoWithMeta[]
  isLoading: boolean
  isSending: boolean
  sendError: string | null

  setUser: (user: AuthUser | null) => void
  setKeypair: (keypair: UserKeypair | null) => void
  setMyGroups: (groups: GroupSummary[]) => void
  setCurrentGroup: (groupId: string | null) => void
  setGroupKeys: (keys: Map<string, Uint8Array>) => void
  upsertGroupKey: (groupId: string, key: Uint8Array) => void
  setPhotos: (photos: PhotoWithMeta[]) => void
  prependPhoto: (photo: PhotoWithMeta) => void
  setLoading: (v: boolean) => void
  setSending: (v: boolean) => void
  setSendError: (msg: string | null) => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  user: null,
  keypair: null,
  myGroups: [],
  currentGroupId: null,
  groupKeys: new Map(),
  photos: [],
  isLoading: false,
  isSending: false,
  sendError: null,

  setUser: (user) => set({ user }),
  setKeypair: (keypair) => set({ keypair }),
  setMyGroups: (myGroups) => set({ myGroups }),
  setCurrentGroup: (currentGroupId) => set({ currentGroupId }),
  setGroupKeys: (groupKeys) => set({ groupKeys }),
  upsertGroupKey: (groupId, key) =>
    set((s) => {
      const next = new Map(s.groupKeys)
      next.set(groupId, key)
      return { groupKeys: next }
    }),
  setPhotos: (photos) => set({ photos }),
  prependPhoto: (photo) => set((s) => ({ photos: [photo, ...s.photos] })),
  setLoading: (isLoading) => set({ isLoading }),
  setSending: (isSending) => set({ isSending }),
  setSendError: (sendError) => set({ sendError }),
}))
