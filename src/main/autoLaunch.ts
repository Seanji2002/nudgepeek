import { app } from 'electron'

export function setAutoLaunch(enable: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

export function getAutoLaunchEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}
