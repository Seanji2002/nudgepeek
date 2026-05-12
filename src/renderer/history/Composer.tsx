import React, { useRef, useState } from 'react'
import { uploadPhoto, downscaleImage } from '../shared/api.js'
import { useHistoryStore } from './store.js'
import CameraCapture from './CameraCapture.js'
import styles from './Composer.module.css'

interface Props {
  userId: string
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
      <circle cx="18" cy="18" r="3" />
      <path d="m16 18 1.5 1.5L20 17" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.4 19.4 0 0 1 5.17-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.4 19.4 0 0 1-3.17 4.18" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export default function Composer({ userId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { groupKey, isSending, setSending, sendError, setSendError } = useHistoryStore()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [hideMode, setHideMode] = useState(false)

  function triggerPicker() {
    fileInputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!groupKey) {
      setSendError('Vault locked — sign in again to unlock photo encryption.')
      return
    }

    setSendError(null)
    setSending(true)
    try {
      const blob = await downscaleImage(file, 1600, 0.85)
      await uploadPhoto(blob, userId, groupKey, hideMode)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[nudgepeek] send photo failed:', err)
      setSendError(msg || 'Could not send photo')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.root}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/avif"
        className={styles.hiddenInput}
        onChange={handleFile}
        tabIndex={-1}
        aria-hidden
      />

      <div className={styles.btnRow}>
        <button
          className={styles.cameraBtn}
          onClick={() => setCameraOpen(true)}
          disabled={isSending}
          title="Take a photo"
        >
          <CameraIcon />
        </button>

        <button
          type="button"
          className={`${styles.toggleBtn} ${hideMode ? styles.toggleBtnActive : ''}`}
          onClick={() => setHideMode((v) => !v)}
          disabled={isSending}
          aria-pressed={hideMode}
          title={hideMode ? 'Hidden mode on — recipient taps to reveal' : 'Hide until tapped'}
        >
          <EyeOffIcon />
        </button>

        <button
          className={`${styles.sendBtn} ${isSending ? styles.sending : ''}`}
          onClick={triggerPicker}
          disabled={isSending}
          title={
            isSending
              ? 'Sending…'
              : hideMode
                ? 'Send a hidden photo from file'
                : 'Send a photo from file'
          }
          aria-label={hideMode ? 'Send hidden photo from file' : 'Send photo from file'}
        >
          {isSending ? <span className={styles.btnSpinner} /> : <SendIcon />}
        </button>
      </div>

      {cameraOpen && (
        <CameraCapture
          userId={userId}
          onClose={() => setCameraOpen(false)}
          onSendStart={() => {
            setSendError(null)
            setSending(true)
          }}
          onSendEnd={() => setSending(false)}
          onSendError={(msg) => setSendError(msg)}
          onFallbackToFile={() => {
            setCameraOpen(false)
            fileInputRef.current?.click()
          }}
        />
      )}

      {sendError && (
        <div className={styles.errorToast} role="alert" onClick={() => setSendError(null)}>
          {sendError}
        </div>
      )}
    </div>
  )
}
