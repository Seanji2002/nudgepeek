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

export default function Composer({ userId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isSending, setSending, sendError, setSendError } = useHistoryStore()
  const [cameraOpen, setCameraOpen] = useState(false)

  function triggerPicker() {
    fileInputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setSendError(null)
    setSending(true)
    try {
      const blob = await downscaleImage(file, 1600, 0.85)
      await uploadPhoto(blob, userId)
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
          className={`${styles.sendBtn} ${isSending ? styles.sending : ''}`}
          onClick={triggerPicker}
          disabled={isSending}
          title="Send a photo from file"
        >
          {isSending ? <span className={styles.btnSpinner} /> : <SendIcon />}
          <span>{isSending ? 'Sending…' : 'Send Photo'}</span>
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
