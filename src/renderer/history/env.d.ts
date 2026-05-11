interface StoredSession {
  accessToken: string
  refreshToken: string
}

interface IncomingPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  senderUserId: string
  sentAt: string
  hidden: boolean
  fromCurrentUser: boolean
}

interface StoredSupabaseConfig {
  url: string
  anonKey: string
}

interface NudgeHistoryApi {
  getStoredSession: () => Promise<StoredSession | null>
  updateSession: (session: StoredSession | null) => void
  openImageDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
  sendIncomingPhoto: (payload: IncomingPhotoPayload) => void
  onForceSignout: (callback: () => void) => () => void
  getAutoLaunchStatus: () => Promise<{ enabled: boolean }>
  setAutoLaunch: (enabled: boolean) => void
  getStoredSupabaseConfig: () => Promise<StoredSupabaseConfig | null>
  setStoredSupabaseConfig: (config: StoredSupabaseConfig) => Promise<true>
  clearStoredSupabaseConfig: () => Promise<true>
  getVault: () => Promise<Uint8Array | null>
  setVault: (key: Uint8Array) => Promise<void>
  clearVault: () => Promise<void>
}

interface Window {
  nudgeHistory: NudgeHistoryApi
}
