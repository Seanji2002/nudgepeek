import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { getPref, setPref } from '../store.js'

let widgetWindow: BrowserWindow | null = null

export function createWidgetWindow(): BrowserWindow {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  const W = 300
  const H = 340
  const x = getPref('widgetX') ?? sw - W - 20
  const y = getPref('widgetY') ?? sh - H - 20

  widgetWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/widget.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  widgetWindow.setAlwaysOnTop(true, 'floating')
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  widgetWindow.on('moved', () => {
    if (!widgetWindow) return
    const [wx, wy] = widgetWindow.getPosition()
    setPref('widgetX', wx)
    setPref('widgetY', wy)
  })

  // Hide instead of close so the app keeps running
  widgetWindow.on('close', (e) => {
    e.preventDefault()
    widgetWindow?.hide()
    setPref('widgetVisible', false)
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    widgetWindow.loadURL(`${rendererUrl}/widget/index.html`)
  } else {
    widgetWindow.loadFile(join(__dirname, '../renderer/widget/index.html'))
  }

  return widgetWindow
}

export function getWidgetWindow(): BrowserWindow | null {
  return widgetWindow
}

export function showWidget(): void {
  if (!widgetWindow) return
  widgetWindow.showInactive()
  widgetWindow.setAlwaysOnTop(true, 'floating')
  setPref('widgetVisible', true)
}

export function hideWidget(): void {
  widgetWindow?.hide()
  setPref('widgetVisible', false)
}

export function toggleWidget(): void {
  if (!widgetWindow) return
  if (widgetWindow.isVisible()) {
    hideWidget()
  } else {
    showWidget()
  }
}
