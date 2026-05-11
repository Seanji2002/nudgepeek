import React, { useState } from 'react'
import { useHistoryStore } from './store.js'
import CommentThread from './CommentThread.js'
import { useDecryptedPhoto } from './useDecryptedPhoto.js'
import type { PhotoWithMeta } from '../shared/types.js'
import styles from './Feed.module.css'

interface Props {
  userId: string
}

function formatRelativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function PhotoIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
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

export default function Feed({ userId }: Props) {
  const { photos, isLoading } = useHistoryStore()
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  function reveal(id: string) {
    setRevealed((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className={styles.centeredState}>
        <div className={styles.emptyIcon}>
          <PhotoIcon />
        </div>
        <p className={styles.emptyTitle}>No photos yet</p>
        <span className={styles.emptyHint}>Hit Send to share your first one</span>
      </div>
    )
  }

  return (
    <div className={styles.feed}>
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          userId={userId}
          revealed={revealed.has(photo.id)}
          onReveal={() => reveal(photo.id)}
        />
      ))}
    </div>
  )
}

interface PhotoCardProps {
  photo: PhotoWithMeta
  userId: string
  revealed: boolean
  onReveal: () => void
}

function PhotoCard({ photo, userId, revealed, onReveal }: PhotoCardProps) {
  const { src, error } = useDecryptedPhoto(photo.signedUrl)
  const isHidden = photo.hidden && !revealed
  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        {src ? (
          <img
            src={src}
            alt={`Photo from ${photo.senderName}`}
            className={`${styles.image} ${isHidden ? styles.imageHidden : ''}`}
            loading="lazy"
          />
        ) : (
          <div className={styles.imagePlaceholder}>
            {error ? `Decryption failed: ${error}` : 'Decrypting…'}
          </div>
        )}
        {isHidden && src && (
          <button
            type="button"
            className={styles.revealOverlay}
            onClick={onReveal}
            aria-label="Reveal hidden photo"
          >
            <EyeIcon />
            <span className={styles.revealLabel}>Hidden — click to reveal</span>
          </button>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.avatarSmall}>{photo.senderName.charAt(0).toUpperCase()}</div>
        <span className={styles.sender}>{photo.senderName}</span>
        <span className={styles.time}>{formatRelativeTime(photo.createdAt)}</span>
      </div>
      <CommentThread photoId={photo.id} userId={userId} />
    </article>
  )
}
