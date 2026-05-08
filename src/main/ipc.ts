// IPC channel name constants shared by main and preload processes.
// All values are plain strings so they inline safely into preload bundles.

export const IPC_INVOKE = {
  DIALOG_OPEN_IMAGE: 'dialog:open-image',
  AUTH_GET_STORED_SESSION: 'auth:get-stored-session',
  AUTOLAUNCH_GET_STATUS: 'autolaunch:get-status',
  SUPABASE_CONFIG_GET: 'supabase:config-get',
  SUPABASE_CONFIG_SET: 'supabase:config-set',
  SUPABASE_CONFIG_CLEAR: 'supabase:config-clear',
} as const

export const IPC_FROM_RENDERER = {
  AUTH_SESSION_UPDATE: 'auth:session-update',
  PHOTO_INCOMING: 'photo:incoming',
  WINDOW_HIDE_WIDGET: 'window:hide-widget',
  AUTOLAUNCH_SET: 'autolaunch:set',
} as const

export const IPC_TO_RENDERER = {
  PHOTO_DISPLAY: 'photo:display',
  AUTH_FORCE_SIGNOUT: 'auth:force-signout',
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
  signedUrl: string
  senderName: string
  senderUserId: string
  sentAt: string
  fromCurrentUser: boolean
}

export interface DisplayPhotoPayload {
  photoId: string
  signedUrl: string
  senderName: string
  sentAt: string
}
