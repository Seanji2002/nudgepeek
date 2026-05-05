import React, { useRef } from 'react'
import { uploadPhoto, downscaleImage } from '../shared/api.js'
import { useHistoryStore } from './store.js'
import styles from './Composer.module.css'

interface Props {
  userId: string
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
      <circle cx="18" cy="18" r="3" />
      <path d="m16 18 1.5 1.5L20 17" />
    </svg>
  )
}

export default function Composer({ userId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isSending, setSending, sendError, setSendError } = useHistoryStore()

  function triggerPicker() {
    fileInputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so same file can be re-sent

    setSendError(null)
    setSending(true)
    try {
      const blob = await downscaleImage(file, 1600, 0.85)
      await uploadPhoto(blob, userId)
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Could not send photo')
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

      <button
        className={`${styles.sendBtn} ${isSending ? styles.sending : ''}`}
        onClick={triggerPicker}
        disabled={isSending}
        title="Send a photo"
      >
        {isSending ? (
          <span className={styles.btnSpinner} />
        ) : (
          <SendIcon />
        )}
        <span>{isSending ? 'Sending…' : 'Send Photo'}</span>
      </button>

      {sendError && (
        <div
          className={styles.errorToast}
          role="alert"
          onClick={() => setSendError(null)}
        >
          {sendError}
        </div>
      )}
    </div>
  )
}
