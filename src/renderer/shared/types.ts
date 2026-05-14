export interface Profile {
  id: string
  displayName: string
  createdAt: string
}

export interface Photo {
  id: string
  senderId: string
  groupId: string
  storagePath: string
  hidden: boolean
  createdAt: string
}

export interface PhotoWithMeta extends Photo {
  senderName: string
  signedUrl: string
}

export interface UnreadPhotoWithMeta extends PhotoWithMeta {
  groupName: string
}

export interface Comment {
  id: string
  photoId: string
  userId: string
  body: string
  createdAt: string
  updatedAt: string | null
}

export interface CommentWithMeta extends Comment {
  authorName: string
}

export type GroupRole = 'owner' | 'admin' | 'member'

export interface GroupSummary {
  id: string
  name: string
  inviteCode: string | null
  role: GroupRole
  approved: boolean
}

export interface GroupMember {
  userId: string
  displayName: string
  role: GroupRole
  approved: boolean
  createdAt: string
}

export interface PendingGroupRequest {
  userId: string
  displayName: string
  createdAt: string
}
