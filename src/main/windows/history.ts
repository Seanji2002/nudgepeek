import { BrowserWindow } from 'electron'
import { join } from 'path'

let historyWindow: BrowserWindow | null = null

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

  // Hide instead of close so the renderer keeps its realtime subscription alive
  historyWindow.on('close', (e) => {
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
