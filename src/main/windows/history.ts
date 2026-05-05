import { app, BrowserWindow } from 'electron'
import { join } from 'path'

let historyWindow: BrowserWindow | null = null
let appIsQuitting = false

app.once('before-quit', () => { appIsQuitting = true })

export function createHistoryWindow(): BrowserWindow {
  historyWindow = new BrowserWindow({
    width: 460,
    height: 640,
    minWidth: 380,
    minHeight: 500,
    show: false,
    backgroundColor: '#0f0f14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/history.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Hide instead of close so the renderer keeps its realtime subscription alive.
  // Skip when the app is actually quitting so Quit NudgePeek works correctly.
  historyWindow.on('close', (e) => {
    if (appIsQuitting) return
    e.preventDefault()
    historyWindow?.hide()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    historyWindow.loadURL(`${rendererUrl}/history/index.html`)
  } else {
    historyWindow.loadFile(join(__dirname, '../renderer/history/index.html'))
  }

  return historyWindow
}

export function getHistoryWindow(): BrowserWindow | null {
  return historyWindow
}

export function showHistoryWindow(): void {
  if (!historyWindow) return
  if (historyWindow.isVisible()) {
    historyWindow.focus()
  } else {
    historyWindow.show()
    historyWindow.focus()
  }
}
