import { Notification } from 'electron'

export function showPhotoNotification(senderName: string, onClickShowWidget: () => void): void {
  if (!Notification.isSupported()) return

  const notif = new Notification({
    title: senderName + ' shared a photo',
    body: 'Tap to view',
    silent: false,
  })

  notif.once('click', () => {
    onClickShowWidget()
  })

  notif.show()
}
