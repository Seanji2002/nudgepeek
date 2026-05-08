import React, { useEffect, useState } from 'react'
import { deleteComment, listComments, postComment, updateComment } from '../shared/api.js'
import type { CommentWithMeta, PhotoWithMeta } from '../shared/types.js'
import { commentBus } from './commentBus.js'
import styles from './CommentModal.module.css'

interface Props {
  photo: PhotoWithMeta
  userId: string
  onClose: () => void
}

function formatRelativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function CloseIcon() {
  return (
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
  )
}

function SendArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function EditIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

function TrashIcon() {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

export default function CommentModal({ photo, userId, onClose }: Props) {
  const [comments, setComments] = useState<CommentWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listComments(photo.id)
      .then((rows) => {
        if (!cancelled) setComments(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg || 'Could not load comments')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [photo.id])

  useEffect(() => {
    return commentBus.subscribe((event) => {
      if (event.kind === 'insert') {
        if (event.comment.photoId !== photo.id) return
        setComments((prev) =>
          prev.some((c) => c.id === event.comment.id) ? prev : [...prev, event.comment],
        )
      } else if (event.kind === 'update') {
        if (event.comment.photoId !== photo.id) return
        setComments((prev) => prev.map((c) => (c.id === event.comment.id ? event.comment : c)))
      } else {
        if (event.photoId !== photo.id) return
        setComments((prev) => prev.filter((c) => c.id !== event.id))
      }
    })
  }, [photo.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || posting) return

    setPosting(true)
    setError(null)
    const tempId = `temp-${Date.now()}`
    const tempComment: CommentWithMeta = {
      id: tempId,
      photoId: photo.id,
      userId,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      authorName: 'You',
    }
    setComments((prev) => [...prev, tempComment])
    setDraft('')

    try {
      const real = await postComment(photo.id, userId, body)
      setComments((prev) => {
        if (prev.some((c) => c.id === real.id)) {
          return prev.filter((c) => c.id !== tempId)
        }
        return prev.map((c) => (c.id === tempId ? real : c))
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setDraft(body)
      setError(msg || 'Could not post comment')
    } finally {
      setPosting(false)
    }
  }

  function startEdit(comment: CommentWithMeta) {
    setEditingId(comment.id)
    setEditDraft(comment.body)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    const body = editDraft.trim()
    if (!body) return
    const id = editingId
    setEditingId(null)
    setError(null)
    try {
      const updated = await updateComment(id, body)
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Could not update comment')
    }
  }

  async function handleDelete(id: string) {
    const previous = comments
    setComments((prev) => prev.filter((c) => c.id !== id))
    setError(null)
    try {
      await deleteComment(id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setComments(previous)
      setError(msg || 'Could not delete comment')
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <CloseIcon />
        </button>

        <div className={styles.photoWrap}>
          <img
            src={photo.signedUrl}
            alt={`Photo from ${photo.senderName}`}
            className={styles.photo}
          />
        </div>

        <div className={styles.photoMeta}>
          <div className={styles.avatarSmall}>{photo.senderName.charAt(0).toUpperCase()}</div>
          <span className={styles.sender}>{photo.senderName}</span>
          <span className={styles.time}>{formatRelativeTime(photo.createdAt)}</span>
        </div>

        <div className={styles.thread}>
          {loading ? (
            <div className={styles.threadCenter}>
              <div className={styles.spinner} />
            </div>
          ) : comments.length === 0 ? (
            <div className={styles.threadCenter}>
              <span className={styles.emptyHint}>No comments yet</span>
            </div>
          ) : (
            comments.map((comment) => {
              const isOwn = comment.userId === userId
              const isEditing = editingId === comment.id
              return (
                <div key={comment.id} className={styles.commentRow}>
                  <div className={styles.commentAvatar}>
                    {comment.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.commentMain}>
                    <div className={styles.commentHead}>
                      <span className={styles.commentAuthor}>{comment.authorName}</span>
                      <span className={styles.commentTime}>
                        {formatRelativeTime(comment.createdAt)}
                        {comment.updatedAt ? ' · edited' : ''}
                      </span>
                    </div>
                    {isEditing ? (
                      <form className={styles.editRow} onSubmit={saveEdit}>
                        <input
                          className={styles.input}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          maxLength={1000}
                          autoFocus
                        />
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={styles.linkBtnPrimary}
                          disabled={!editDraft.trim()}
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <p className={styles.commentBody}>{comment.body}</p>
                    )}
                  </div>
                  {isOwn && !isEditing && (
                    <div className={styles.commentActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Edit"
                        onClick={() => startEdit(comment)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Delete"
                        onClick={() => handleDelete(comment.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <form className={styles.composer} onSubmit={submit}>
          <input
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            maxLength={1000}
            disabled={posting}
            autoFocus
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={posting || !draft.trim()}
            title="Post"
          >
            {posting ? <span className={styles.btnSpinner} /> : <SendArrowIcon />}
          </button>
        </form>

        {error && (
          <div className={styles.errorToast} role="alert" onClick={() => setError(null)}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
