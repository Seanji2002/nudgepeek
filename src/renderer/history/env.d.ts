interface StoredSession {
  accessToken: string
  refreshToken: string
}

interface IncomingPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  senderUserId: string
  groupId: string
  groupName: string
  sentAt: string
  hidden: boolean
  fromCurrentUser: boolean
}

interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  groupId: string
  groupName: string
  sentAt: string
  hidden: boolean
}

interface SeedQueuePayload {
  photos: DisplayPhotoPayload[]
}

interface UpdateInfoPayload {
  version: string
}

interface UpdateProgressPayload {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
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
  getGroupKey: (groupId: string) => Promise<Uint8Array | null>
  getAllGroupKeys: () => Promise<Record<string, Uint8Array>>
  setGroupKey: (groupId: string, key: Uint8Array) => Promise<void>
  clearGroupKey: (groupId: string) => Promise<void>
  clearAllVaults: () => Promise<void>
  sendSeedQueue: (payload: SeedQueuePayload) => void
  onWidgetAck: (callback: (photoId: string) => void) => () => void
  onPowerResume: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (payload: UpdateInfoPayload) => void) => () => void
  onUpdateProgress: (callback: (payload: UpdateProgressPayload) => void) => () => void
  onUpdateDownloaded: (callback: (payload: UpdateInfoPayload) => void) => () => void
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
}

interface Window {
  nudgeHistory: NudgeHistoryApi
}
