import { Notification } from 'electron'

export function showPhotoNotification(
  senderName: string,
  hidden: boolean,
  onClickShowWidget: () => void,
): void {
  if (!Notification.isSupported()) return

  const notif = new Notification({
    title: senderName + ' shared a photo',
    body: hidden ? 'Hidden — tap to reveal' : 'Tap to view',
    silent: false,
  })

  notif.once('click', () => {
    onClickShowWidget()
  })

  notif.show()
}
