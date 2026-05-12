interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  sentAt: string
  hidden: boolean
}

interface SeedQueuePayload {
  photos: DisplayPhotoPayload[]
}

interface NudgeWidgetApi {
  onPhotoDisplay: (callback: (payload: DisplayPhotoPayload) => void) => () => void
  onSeedQueue: (callback: (payload: SeedQueuePayload) => void) => () => void
  ackPhoto: (photoId: string) => void
  hideWidget: () => void
}

interface Window {
  nudgeWidget: NudgeWidgetApi
}
