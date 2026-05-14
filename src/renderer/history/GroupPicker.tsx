import React, { useState } from 'react'
import CreateGroupModal from './CreateGroupModal.js'
import JoinGroupModal from './JoinGroupModal.js'
import styles from './GroupPicker.module.css'

interface Props {
  userId: string
  publicKey: Uint8Array
  onGroupReady: (groupId: string) => Promise<void>
  onSignOut: () => Promise<void>
  pendingCount?: number
}

export default function GroupPicker({
  userId,
  publicKey,
  onGroupReady,
  onSignOut,
  pendingCount = 0,
}: Props) {
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle')

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>Join the conversation</h1>
        <p className={styles.subtitle}>
          You&apos;re signed in but not in any group yet. Create one to start sharing photos, or
          join someone else&apos;s with an invite code.
        </p>

        <div className={styles.choices}>
          <button
            type="button"
            className={styles.choiceCard}
            onClick={() => setMode('create')}
            data-variant="primary"
          >
            <span className={styles.choiceIcon} aria-hidden>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </span>
            <span className={styles.choiceTitle}>Create a group</span>
            <span className={styles.choiceBody}>
              You become the owner. Share the invite code with anyone you&apos;d like to add.
            </span>
          </button>

          <button type="button" className={styles.choiceCard} onClick={() => setMode('join')}>
            <span className={styles.choiceIcon} aria-hidden>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </span>
            <span className={styles.choiceTitle}>Join with a code</span>
            <span className={styles.choiceBody}>
              Paste an invite code shared with you. The owner approves your request.
            </span>
          </button>
        </div>

        {pendingCount > 0 && (
          <p className={styles.pendingHint}>
            {pendingCount === 1
              ? "You have 1 pending join request awaiting the group owner's approval."
              : `You have ${pendingCount} pending join requests awaiting approval.`}
          </p>
        )}

        <button type="button" className={styles.signOutLink} onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {mode === 'create' && (
        <CreateGroupModal
          userId={userId}
          publicKey={publicKey}
          onClose={() => setMode('idle')}
          onCreated={async (groupId) => {
            setMode('idle')
            await onGroupReady(groupId)
          }}
        />
      )}

      {mode === 'join' && (
        <JoinGroupModal
          onClose={() => setMode('idle')}
          onJoined={async () => {
            setMode('idle')
          }}
        />
      )}
    </div>
  )
}
