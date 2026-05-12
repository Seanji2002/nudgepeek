import React, { useCallback, useEffect, useRef, useState } from 'react'
import { uploadPhoto } from '../shared/api.js'
import { useHistoryStore } from './store.js'
import styles from './CameraCapture.module.css'

interface Props {
  userId: string
  onClose: () => void
  onSendStart: () => void
  onSendEnd: () => void
  onSendError: (msg: string) => void
  onFallbackToFile: () => void
}

type Phase = 'live' | 'review'

const MAX_DIM = 1600
const JPEG_QUALITY = 0.85

export default function CameraCapture({
  userId,
  onClose,
  onSendStart,
  onSendEnd,
  onSendError,
  onFallbackToFile,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('live')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const capturedBlobRef = useRef<Blob | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [hideMode, setHideMode] = useState(false)
  const groupKey = useHistoryStore((s) => s.groupKey)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        if (cancelled) return
        const name = err instanceof Error ? ((err as { name?: string }).name ?? '') : ''
        const msg = err instanceof Error ? err.message : String(err)
        if (
          name === 'NotAllowedError' ||
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('notallowed')
        ) {
          setCamError('Camera permission denied. Check your browser/OS settings and try again.')
        } else if (
          name === 'NotFoundError' ||
          name === 'DevicesNotFoundError' ||
          msg.toLowerCase().includes('notfound') ||
          msg.toLowerCase().includes('not found')
        ) {
          setCamError(
            'No camera found. If you are on WSL2, cameras are not available — use "Pick from file" below instead.',
          )
        } else if (name === 'NotReadableError') {
          setCamError(
            'Camera is in use by another app. Close other apps using the camera and try again.',
          )
        } else {
          setCamError(`Could not start camera: ${msg}`)
        }
      }
    }

    startCamera()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [stopStream])

  function capture() {
    const video = videoRef.current
    if (!video) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return

    const ratio = Math.min(MAX_DIM / vw, MAX_DIM / vh, 1)
    const w = Math.round(vw * ratio)
    const h = Math.round(vh * ratio)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, w, h)
    setPreviewUrl(canvas.toDataURL('image/jpeg', JPEG_QUALITY))

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        capturedBlobRef.current = blob
        stopStream()
        setPhase('review')
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  }

  function retake() {
    setPreviewUrl(null)
    capturedBlobRef.current = null
    setPhase('live')

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(() => {
        setCamError('Could not restart camera.')
      })
  }

  async function send() {
    const blob = capturedBlobRef.current
    if (!blob) return
    if (!groupKey) {
      onSendError('Vault locked — sign in again to unlock photo encryption.')
      return
    }

    setSending(true)
    onSendStart()
    try {
      await uploadPhoto(blob, userId, groupKey, hideMode)
      onClose()
    } catch (err: unknown) {
      onSendError(err instanceof Error ? err.message : 'Could not send photo')
    } finally {
      setSending(false)
      onSendEnd()
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} title="Close" disabled={sending}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.viewport}>
          {camError ? (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>
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
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="15" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </span>
              <p>{camError}</p>
              <button className={styles.fallbackBtn} onClick={onFallbackToFile}>
                Pick from file instead
              </button>
            </div>
          ) : phase === 'live' ? (
            <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
          ) : (
            <>
              <img
                className={`${styles.preview} ${hideMode ? styles.previewHidden : ''}`}
                src={previewUrl ?? undefined}
                alt="Captured photo preview"
              />
              {hideMode && (
                <div className={styles.hiddenOverlay} aria-hidden>
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.4 19.4 0 0 1 5.17-5.94" />
                    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.4 19.4 0 0 1-3.17 4.18" />
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                  <span className={styles.hiddenLabel}>Hidden — recipient taps to reveal</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.controls}>
          {!camError && phase === 'live' && (
            <button className={styles.captureBtn} onClick={capture} title="Capture photo">
              <span className={styles.captureRing} />
            </button>
          )}

          {phase === 'review' && (
            <>
              <button
                type="button"
                className={`${styles.toggleBtn} ${hideMode ? styles.toggleBtnActive : ''}`}
                onClick={() => setHideMode((v) => !v)}
                disabled={sending}
                aria-pressed={hideMode}
                title={hideMode ? 'Hidden mode on — recipient taps to reveal' : 'Hide until tapped'}
              >
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
              </button>
              <button className={styles.secondaryBtn} onClick={retake} disabled={sending}>
                Retake
              </button>
              <button className={styles.primaryBtn} onClick={send} disabled={sending}>
                {sending ? <span className={styles.btnSpinner} /> : null}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
