import React, { useEffect, useState } from 'react'
import styles from './UpdatePrompt.module.css'

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'dismissed' | 'error'

const RELEASES_URL = 'https://github.com/Seanji2002/nudgepeek/releases/latest'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB'
  const mb = n / (1024 * 1024)
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function UpdatePrompt() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [version, setVersion] = useState<string>('')
  const [percent, setPercent] = useState<number>(0)
  const [transferred, setTransferred] = useState<number>(0)
  const [total, setTotal] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const api = window.nudgeHistory
    if (!api) return

    const removeAvailable = api.onUpdateAvailable((payload) => {
      setVersion(payload.version)
      // Don't override a dismissed state — user already said no this session.
      setPhase((p) => (p === 'dismissed' || p === 'downloaded' ? p : 'available'))
    })

    const removeProgress = api.onUpdateProgress((payload) => {
      setPercent(payload.percent)
      setTransferred(payload.transferred)
      setTotal(payload.total)
      setPhase((p) => (p === 'downloaded' ? p : 'downloading'))
    })

    const removeDownloaded = api.onUpdateDownloaded((payload) => {
      setVersion(payload.version)
      setPercent(100)
      setPhase('downloaded')
    })

    const removeError = api.onUpdateError((payload) => {
      // Only react if we're currently in a flow — the tray "Check for
      // updates" path has its own notification for failures.
      setPhase((p) => {
        if (p === 'downloading' || p === 'available' || p === 'downloaded') {
          setErrorMessage(payload.message)
          return 'error'
        }
        return p
      })
    })

    return () => {
      removeAvailable()
      removeProgress()
      removeDownloaded()
      removeError()
    }
  }, [])

  if (phase === 'idle' || phase === 'dismissed') return null

  const handleDismiss = () => setPhase('dismissed')

  const handleDownload = async () => {
    setPhase('downloading')
    try {
      await window.nudgeHistory.downloadUpdate()
    } catch (err) {
      console.error('[update-prompt] downloadUpdate failed:', err)
      setPhase('available')
    }
  }

  const handleInstall = async () => {
    try {
      await window.nudgeHistory.installUpdate()
    } catch (err) {
      console.error('[update-prompt] installUpdate failed:', err)
    }
  }

  let title = ''
  let body: React.ReactNode = null
  let actions: React.ReactNode = null

  if (phase === 'available') {
    title = 'Update available'
    body = (
      <p className={styles.versionLine}>
        Version <span className={styles.versionTag}>{version}</span> is ready to download.
      </p>
    )
    actions = (
      <>
        <button type="button" className={styles.linkBtn} onClick={handleDismiss}>
          Later
        </button>
        <button type="button" className={styles.primaryBtn} onClick={handleDownload}>
          Update now
        </button>
      </>
    )
  } else if (phase === 'downloading') {
    title = 'Downloading update'
    const shown = Math.max(0, Math.min(100, percent))
    body = (
      <>
        <p className={styles.versionLine}>
          Downloading <span className={styles.versionTag}>{version}</span>…
        </p>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${shown}%` }} />
        </div>
        <div className={styles.progressMeta}>
          <span>{shown.toFixed(0)}%</span>
          <span>
            {formatBytes(transferred)} / {formatBytes(total)}
          </span>
        </div>
      </>
    )
    actions = null
  } else if (phase === 'downloaded') {
    title = 'Update ready'
    body = (
      <p className={styles.versionLine}>
        NudgePeek will close and reopen at version{' '}
        <span className={styles.versionTag}>{version}</span>.
      </p>
    )
    actions = (
      <>
        <button type="button" className={styles.linkBtn} onClick={handleDismiss}>
          Later
        </button>
        <button type="button" className={styles.primaryBtn} onClick={handleInstall}>
          Install &amp; Restart
        </button>
      </>
    )
  } else {
    // error
    title = "Couldn't apply update"
    body = (
      <>
        <p className={styles.versionLine}>
          The auto-updater hit a problem trying to install version{' '}
          <span className={styles.versionTag}>{version || 'latest'}</span>.
        </p>
        <p className={styles.errorMsg}>{errorMessage}</p>
        <p className={styles.versionLine}>
          You can download the new version directly from GitHub and reinstall it manually.
        </p>
      </>
    )
    actions = (
      <>
        <button type="button" className={styles.linkBtn} onClick={handleDismiss}>
          Dismiss
        </button>
        <a
          className={styles.primaryBtn}
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          onClick={handleDismiss}
        >
          Open releases
        </a>
      </>
    )
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && handleDismiss()}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.body}>{body}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  )
}
