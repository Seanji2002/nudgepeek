import React, { useEffect, useState } from 'react'
import { approveProfile, listPendingProfiles, rejectProfile } from '../shared/api.js'
import type { PendingProfile } from '../shared/types.js'
import styles from './AdminPanel.module.css'

interface Props {
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
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
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function AdminPanel({ onClose }: Props) {
  const [pending, setPending] = useState<PendingProfile[] | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listPendingProfiles()
      .then((rows) => {
        if (!cancelled) setPending(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(messageOf(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function approve(id: string) {
    setWorking(id)
    setError(null)
    try {
      await approveProfile(id)
      setPending((prev) => (prev ?? []).filter((p) => p.id !== id))
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      setWorking(null)
    }
  }

  async function reject(id: string) {
    setWorking(id)
    setConfirmReject(null)
    setError(null)
    try {
      await rejectProfile(id)
      setPending((prev) => (prev ?? []).filter((p) => p.id !== id))
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.head}>
          <h2 className={styles.title}>Pending approvals</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          {pending === null ? (
            <div className={styles.loadingRow}>
              <span className={styles.spinner} />
            </div>
          ) : pending.length === 0 ? (
            <p className={styles.empty}>No pending requests.</p>
          ) : (
            <ul className={styles.list}>
              {pending.map((p) => (
                <li key={p.id} className={styles.row}>
                  <div className={styles.avatar}>{p.displayName.charAt(0).toUpperCase()}</div>
                  <div className={styles.meta}>
                    <span className={styles.name}>{p.displayName}</span>
                    <span className={styles.time}>{formatRelativeTime(p.createdAt)}</span>
                  </div>
                  {confirmReject === p.id ? (
                    <div className={styles.actions}>
                      <span className={styles.confirmLabel}>Reject?</span>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => reject(p.id)}
                        disabled={working === p.id}
                      >
                        {working === p.id ? '…' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setConfirmReject(null)}
                        disabled={working === p.id}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setConfirmReject(p.id)}
                        disabled={working !== null}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => approve(p.id)}
                        disabled={working !== null}
                      >
                        {working === p.id ? '…' : 'Approve'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className={styles.error} role="alert" onClick={() => setError(null)}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
