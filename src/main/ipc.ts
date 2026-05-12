// IPC channel name constants shared by main and preload processes.
// All values are plain strings so they inline safely into preload bundles.

export const IPC_INVOKE = {
  DIALOG_OPEN_IMAGE: 'dialog:open-image',
  AUTH_GET_STORED_SESSION: 'auth:get-stored-session',
  AUTOLAUNCH_GET_STATUS: 'autolaunch:get-status',
  SUPABASE_CONFIG_GET: 'supabase:config-get',
  SUPABASE_CONFIG_SET: 'supabase:config-set',
  SUPABASE_CONFIG_CLEAR: 'supabase:config-clear',
  VAULT_GET: 'vault:get',
  VAULT_SET: 'vault:set',
  VAULT_CLEAR: 'vault:clear',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
} as const

export const IPC_FROM_RENDERER = {
  AUTH_SESSION_UPDATE: 'auth:session-update',
  PHOTO_INCOMING: 'photo:incoming',
  WINDOW_HIDE_WIDGET: 'window:hide-widget',
  AUTOLAUNCH_SET: 'autolaunch:set',
  WIDGET_ACK: 'widget:ack',
  HISTORY_SEED_QUEUE: 'photo:history-seeds',
} as const

export const IPC_TO_RENDERER = {
  PHOTO_DISPLAY: 'photo:display',
  AUTH_FORCE_SIGNOUT: 'auth:force-signout',
  PHOTO_SEED_QUEUE: 'photo:seed-queue',
  WIDGET_ACK_FORWARD: 'widget:ack-forward',
  POWER_RESUME: 'power:resume',
  UPDATE_AVAILABLE: 'updater:update-available',
  UPDATE_PROGRESS: 'updater:progress',
  UPDATE_DOWNLOADED: 'updater:downloaded',
} as const

export interface StoredSession {
  accessToken: string
  refreshToken: string
}

export interface StoredSupabaseConfig {
  url: string
  anonKey: string
}

export interface IncomingPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  senderUserId: string
  sentAt: string
  hidden: boolean
  fromCurrentUser: boolean
}

export interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  sentAt: string
  hidden: boolean
}

export interface SeedQueuePayload {
  photos: DisplayPhotoPayload[]
}

export interface WidgetAckPayload {
  photoId: string
}

export interface UpdateInfoPayload {
  version: string
}

export interface UpdateProgressPayload {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}
