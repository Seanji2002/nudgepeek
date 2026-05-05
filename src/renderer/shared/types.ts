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
}
