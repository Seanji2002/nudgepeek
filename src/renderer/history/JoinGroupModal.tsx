import React, { FormEvent, useEffect, useState } from 'react'
import { joinGroupByCode } from '../shared/api.js'
import styles from './GroupModal.module.css'

interface Props {
  onClose: () => void
  onJoined: (info: { groupId: string; groupName: string }) => void | Promise<void>
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

export default function JoinGroupModal({ onClose, onJoined }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      setError('Invite code looks too short')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const info = await joinGroupByCode(clean)
      setSuccess(info.groupName)
      await onJoined(info)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('not found')) {
        setError("That invite code isn't valid. Double-check with the group owner.")
      } else {
        setError(msg || 'Could not join group')
      }
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.head}>
          <h2 className={styles.title}>Join a group</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={busy}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {success ? (
          <div className={styles.body}>
            <p className={styles.successBlock}>
              <strong>Request sent to {success}.</strong>
              <br />
              The owner or an admin needs to approve you before you can see photos.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={onClose}>
                Got it
              </button>
            </div>
          </div>
        ) : (
          <form className={styles.body} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="np-join-code">
                Invite code
              </label>
              <input
                id="np-join-code"
                className={`${styles.input} ${styles.codeInput}`}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="MOON-7F2A"
                maxLength={32}
                required
                autoFocus
                spellCheck={false}
                autoCapitalize="characters"
                disabled={busy}
              />
              <p className={styles.hint}>
                Ask the group owner for the code. They can find it in the group menu.
              </p>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={busy || code.trim().length < 4}
              >
                {busy ? <span className={styles.btnSpinner} /> : 'Request to join'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
