import React, { useState } from 'react'
import { useHistoryStore } from './store.js'
import type { PhotoWithMeta } from '../shared/types.js'
import CommentModal from './CommentModal.js'
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

function CommentIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function Feed({ userId }: Props) {
  const { photos, isLoading } = useHistoryStore()
  const [openPhoto, setOpenPhoto] = useState<PhotoWithMeta | null>(null)

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
    <>
      <div className={styles.feed}>
        {photos.map((photo) => (
          <article
            key={photo.id}
            className={styles.card}
            onClick={() => setOpenPhoto(photo)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpenPhoto(photo)
              }
            }}
          >
            <div className={styles.imageWrap}>
              <img
                src={photo.signedUrl}
                alt={`Photo from ${photo.senderName}`}
                className={styles.image}
                loading="lazy"
              />
            </div>
            <div className={styles.meta}>
              <div className={styles.avatarSmall}>{photo.senderName.charAt(0).toUpperCase()}</div>
              <span className={styles.sender}>{photo.senderName}</span>
              <span className={styles.time}>{formatRelativeTime(photo.createdAt)}</span>
              <button
                type="button"
                className={styles.commentBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenPhoto(photo)
                }}
                title="View comments"
              >
                <CommentIcon />
                <span>{photo.commentCount}</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      {openPhoto && (
        <CommentModal photo={openPhoto} userId={userId} onClose={() => setOpenPhoto(null)} />
      )}
    </>
  )
}
