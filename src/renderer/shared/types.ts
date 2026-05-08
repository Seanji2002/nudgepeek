export interface Profile {
  id: string
  displayName: string
  createdAt: string
}

export interface Photo {
  id: string
  senderId: string
  storagePath: string
  createdAt: string
}

export interface PhotoWithMeta extends Photo {
  senderName: string
  signedUrl: string
  commentCount: number
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
