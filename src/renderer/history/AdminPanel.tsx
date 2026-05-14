import React, { useEffect, useState } from 'react'
import {
  approveGroupMember,
  demoteGroupAdmin,
  listGroupMembers,
  listPendingJoinRequests,
  promoteGroupAdmin,
  rejectGroupMember,
} from '../shared/api.js'
import { useHistoryStore } from './store.js'
import type { GroupMember, PendingGroupRequest } from '../shared/types.js'
import styles from './AdminPanel.module.css'

interface Props {
  groupId: string
  isOwner: boolean
  onClose: () => void
  onChanged: () => Promise<void>
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

export default function AdminPanel({ groupId, isOwner, onClose, onChanged }: Props) {
  const [pending, setPending] = useState<PendingGroupRequest[] | null>(null)
  const [members, setMembers] = useState<GroupMember[] | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const groupKeys = useHistoryStore((s) => s.groupKeys)
  const user = useHistoryStore((s) => s.user)
  const groupKey = groupKeys.get(groupId)

  async function reload() {
    const [pendingRows, memberRows] = await Promise.all([
      listPendingJoinRequests(groupId),
      listGroupMembers(groupId),
    ])
    setPending(pendingRows)
    setMembers(memberRows)
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([listPendingJoinRequests(groupId), listGroupMembers(groupId)])
      .then(([pendingRows, memberRows]) => {
        if (cancelled) return
        setPending(pendingRows)
        setMembers(memberRows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(messageOf(e))
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function approve(id: string) {
    if (!groupKey || !user) {
      setError('Vault locked for this group — sign in again before approving.')
      return
    }
    setWorking(id)
    setError(null)
    try {
      await approveGroupMember(groupId, id, groupKey)
      await reload()
      await onChanged()
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
      await rejectGroupMember(groupId, id)
      await reload()
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      setWorking(null)
    }
  }

  async function promote(id: string) {
    setWorking(id)
    setError(null)
    try {
      await promoteGroupAdmin(groupId, id)
      await reload()
    } catch (e: unknown) {
      setError(messageOf(e))
    } finally {
      setWorking(null)
    }
  }

  async function demote(id: string) {
    setWorking(id)
    setError(null)
    try {
      await demoteGroupAdmin(groupId, id)
      await reload()
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
          <h2 className={styles.title}>Group admin</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.sectionLabel}>Pending requests</div>
          {pending === null ? (
            <div className={styles.loadingRow}>
              <span className={styles.spinner} />
            </div>
          ) : pending.length === 0 ? (
            <p className={styles.empty}>No pending requests.</p>
          ) : (
            <ul className={styles.list}>
              {pending.map((p) => (
                <li key={p.userId} className={styles.row}>
                  <div className={styles.avatar}>{p.displayName.charAt(0).toUpperCase()}</div>
                  <div className={styles.meta}>
                    <span className={styles.name}>{p.displayName}</span>
                    <span className={styles.time}>{formatRelativeTime(p.createdAt)}</span>
                  </div>
                  {confirmReject === p.userId ? (
                    <div className={styles.actions}>
                      <span className={styles.confirmLabel}>Reject?</span>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => reject(p.userId)}
                        disabled={working === p.userId}
                      >
                        {working === p.userId ? '…' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setConfirmReject(null)}
                        disabled={working === p.userId}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setConfirmReject(p.userId)}
                        disabled={working !== null}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => approve(p.userId)}
                        disabled={working !== null}
                      >
                        {working === p.userId ? '…' : 'Approve'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {members && members.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Members</div>
              <ul className={styles.list}>
                {members.map((m) => (
                  <li key={m.userId} className={styles.row}>
                    <div className={styles.avatar}>{m.displayName.charAt(0).toUpperCase()}</div>
                    <div className={styles.meta}>
                      <span className={styles.name}>{m.displayName}</span>
                      <span className={styles.time}>
                        {m.role} · joined {formatRelativeTime(m.createdAt)}
                      </span>
                    </div>
                    {isOwner && m.userId !== user?.id && m.role === 'member' && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => promote(m.userId)}
                          disabled={working !== null}
                        >
                          {working === m.userId ? '…' : 'Make admin'}
                        </button>
                      </div>
                    )}
                    {isOwner && m.userId !== user?.id && m.role === 'admin' && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => demote(m.userId)}
                          disabled={working !== null}
                        >
                          {working === m.userId ? '…' : 'Demote'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
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
