import React, { useEffect, useRef } from 'react'
import { useWidgetStore } from './store.js'
import styles from './WidgetApp.module.css'

function formatAge(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

function CameraIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function isFrameHidden(frame: { photoId: string; hidden: boolean }, revealedId: string | null) {
  return frame.hidden && frame.photoId !== revealedId
}

function EyeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function WidgetApp() {
  const {
    queue,
    currentPhoto,
    prevPhoto,
    showPrev,
    revealedId,
    enqueue,
    seedQueue,
    ackCurrent,
    clearPrev,
    revealCurrent,
  } = useWidgetStore()
  const prevTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const api = window.nudgeWidget
    if (!api) return

    function payloadToFrame(payload: DisplayPhotoPayload) {
      const blob = new Blob([payload.photoBytes as BlobPart], { type: 'image/jpeg' })
      return {
        photoId: payload.photoId,
        displayUrl: URL.createObjectURL(blob),
        senderName: payload.senderName,
        sentAt: payload.sentAt,
        hidden: payload.hidden,
      }
    }

    const removeIncoming = api.onPhotoDisplay((payload) => {
      enqueue(payloadToFrame(payload))
    })

    const removeSeed = api.onSeedQueue((payload) => {
      seedQueue(payload.photos.map(payloadToFrame))
    })

    return () => {
      removeIncoming()
      removeSeed()
      if (prevTimerRef.current) clearTimeout(prevTimerRef.current)
    }
  }, [enqueue, seedQueue])

  const handleClose = () => window.nudgeWidget?.hideWidget()

  const handleAck = () => {
    ackCurrent()
    if (prevTimerRef.current) clearTimeout(prevTimerRef.current)
    prevTimerRef.current = setTimeout(() => clearPrev(), 450)
  }

  const currentHidden = currentPhoto ? isFrameHidden(currentPhoto, revealedId) : false
  const prevHidden = prevPhoto ? isFrameHidden(prevPhoto, revealedId) : false
  const remaining = Math.max(0, queue.length - 1)

  return (
    <div className={styles.container}>
      {/* Drag handle — sits above everything except close button */}
      <div className={styles.dragBar} />

      {currentPhoto ? (
        <>
          {/* Previous photo fades out during transition */}
          {prevPhoto && showPrev && (
            <img
              key={`prev-${prevPhoto.photoId}`}
              className={`${styles.photo} ${styles.photoOut} ${prevHidden ? styles.photoHidden : ''}`}
              src={prevPhoto.displayUrl}
              alt=""
              draggable={false}
            />
          )}

          {/* Current photo fades in. Acts as the ack button (whole photo is
              clickable). The reveal layer below absorbs the click first for
              hidden photos. */}
          <img
            key={`cur-${currentPhoto.photoId}`}
            className={`${styles.photo} ${styles.photoIn} ${styles.photoClickable} ${currentHidden ? styles.photoHidden : ''}`}
            src={currentPhoto.displayUrl}
            alt={`Photo from ${currentPhoto.senderName}`}
            draggable={false}
            onClick={handleAck}
            role="button"
            aria-label="Mark as read and show next"
            title="Click to mark as read"
          />

          {/* Reveal layer — covers the photo area, sits below close button */}
          {currentHidden && (
            <button
              type="button"
              className={styles.revealLayer}
              onClick={revealCurrent}
              aria-label="Reveal hidden photo"
            >
              <EyeIcon />
              <span className={styles.revealLabel}>Hidden — click to reveal</span>
            </button>
          )}

          {remaining > 0 && <div className={styles.queueBadge}>+{remaining} more</div>}

          {/* Top gradient so close button is always visible */}
          <div className={styles.topGradient} />

          {/* Bottom overlay with sender info */}
          <div className={styles.bottomOverlay}>
            <div className={styles.avatarCircle}>
              {currentPhoto.senderName.charAt(0).toUpperCase()}
            </div>
            <div className={styles.metaText}>
              <span className={styles.senderName}>{currentPhoto.senderName}</span>
              <span className={styles.sentTime}>{formatAge(currentPhoto.sentAt)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <CameraIcon />
          </span>
          <p className={styles.emptyText}>Waiting for a photo…</p>
        </div>
      )}

      <button className={styles.closeBtn} onClick={handleClose} aria-label="Hide widget">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  )
}
