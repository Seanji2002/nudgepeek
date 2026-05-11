interface DisplayPhotoPayload {
  photoId: string
  photoBytes: Uint8Array
  senderName: string
  sentAt: string
  hidden: boolean
}

interface NudgeWidgetApi {
  onPhotoDisplay: (callback: (payload: DisplayPhotoPayload) => void) => () => void
  hideWidget: () => void
}

interface Window {
  nudgeWidget: NudgeWidgetApi
}
