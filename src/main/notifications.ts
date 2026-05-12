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

export function showSummaryNotification(
  count: number,
  senderNames: string[],
  onClickShowWidget: () => void,
): void {
  if (!Notification.isSupported() || count <= 0) return

  const unique = Array.from(new Set(senderNames))
  const shown = unique.slice(0, 3).join(', ')
  const more = unique.length > 3 ? ', …' : ''
  const noun = count === 1 ? 'photo' : 'photos'

  const notif = new Notification({
    title: `${count} new ${noun}`,
    body: unique.length > 0 ? `From ${shown}${more}` : 'Tap to view',
    silent: false,
  })

  notif.once('click', () => {
    onClickShowWidget()
  })

  notif.show()
}
