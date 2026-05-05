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
  fromCurrentUser: boolean
}

interface NudgeHistoryApi {
  getStoredSession: () => Promise<StoredSession | null>
  updateSession: (session: StoredSession | null) => void
  openImageDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
  sendIncomingPhoto: (payload: IncomingPhotoPayload) => void
  onForceSignout: (callback: () => void) => () => void
  getAutoLaunchStatus: () => Promise<{ enabled: boolean }>
  setAutoLaunch: (enabled: boolean) => void
}

interface Window {
  nudgeHistory: NudgeHistoryApi
}
