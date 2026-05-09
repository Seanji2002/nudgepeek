interface StoredSession {
  accessToken: string
  refreshToken: string
}

interface IncomingPhotoPayload {
  photoId: string
  signedUrl: string
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
}

interface Window {
  nudgeHistory: NudgeHistoryApi
}
