import React, { useEffect, useRef, useState } from 'react'
import { regenerateInviteCode } from '../shared/api.js'
import { useHistoryStore } from './store.js'
import CreateGroupModal from './CreateGroupModal.js'
import JoinGroupModal from './JoinGroupModal.js'
import { randomInviteCode } from './CreateGroupModal.js'
import styles from './GroupSelector.module.css'

interface Props {
  userId: string
  publicKey: Uint8Array
  onSwitchGroup: (groupId: string) => void
  onGroupsChanged: () => Promise<void>
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function GroupSelector({
  userId,
  publicKey,
  onSwitchGroup,
  onGroupsChanged,
}: Props) {
  const myGroups = useHistoryStore((s) => s.myGroups)
  const currentGroupId = useHistoryStore((s) => s.currentGroupId)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const current = myGroups.find((g) => g.id === currentGroupId) ?? null

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  async function copyInvite() {
    if (!current?.inviteCode) return
    try {
      await navigator.clipboard.writeText(current.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard write failures are non-fatal; the code is still on screen.
    }
  }

  async function rotateInvite() {
    if (!current || regenerating) return
    setRegenerating(true)
    try {
      const next = randomInviteCode()
      await regenerateInviteCode(current.id, next)
      await onGroupsChanged()
    } catch (err) {
      console.error('[group-selector] regenerate invite code failed:', err)
    } finally {
      setRegenerating(false)
    }
  }

  const isAdmin = current?.role === 'owner' || current?.role === 'admin'

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? `Active group: ${current.name}` : 'Pick a group'}
      >
        <span className={styles.triggerLabel}>{current?.name ?? 'No group'}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {myGroups.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Your groups</div>
              {myGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="menuitem"
                  className={`${styles.groupRow} ${g.id === currentGroupId ? styles.groupRowActive : ''}`}
                  onClick={() => {
                    if (g.id !== currentGroupId) onSwitchGroup(g.id)
                    setOpen(false)
                  }}
                >
                  <span className={styles.groupName}>{g.name}</span>
                  <span className={styles.groupRole}>{g.role}</span>
                  {g.id === currentGroupId && (
                    <span className={styles.activeMark} aria-hidden>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {isAdmin && current?.inviteCode && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Invite code for {current.name}</div>
              <div className={styles.inviteRow}>
                <code className={styles.inviteCode}>{current.inviteCode}</code>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={copyInvite}
                  title="Copy invite code"
                  aria-label="Copy invite code"
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
              {current.role === 'owner' && (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={rotateInvite}
                  disabled={regenerating}
                >
                  {regenerating ? 'Rotating…' : 'Rotate invite code'}
                </button>
              )}
            </div>
          )}

          <div className={styles.section}>
            <button
              type="button"
              role="menuitem"
              className={styles.actionRow}
              onClick={() => {
                setMode('create')
                setOpen(false)
              }}
            >
              <span className={styles.actionLabel}>+ New group</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.actionRow}
              onClick={() => {
                setMode('join')
                setOpen(false)
              }}
            >
              <span className={styles.actionLabel}>Join with code…</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <CreateGroupModal
          userId={userId}
          publicKey={publicKey}
          onClose={() => setMode('idle')}
          onCreated={async (groupId) => {
            setMode('idle')
            await onGroupsChanged()
            onSwitchGroup(groupId)
          }}
        />
      )}

      {mode === 'join' && (
        <JoinGroupModal
          onClose={() => setMode('idle')}
          onJoined={async () => {
            setMode('idle')
            await onGroupsChanged()
          }}
        />
      )}
    </div>
  )
}
