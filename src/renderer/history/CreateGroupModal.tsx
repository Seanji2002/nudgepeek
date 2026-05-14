import React, { FormEvent, useEffect, useState } from 'react'
import { createGroup } from '../shared/api.js'
import { cacheGroupKey, mintNewGroupKey, sealKeyForOwnPublicKey } from '../shared/vault.js'
import { useHistoryStore } from './store.js'
import styles from './GroupModal.module.css'

interface Props {
  userId: string
  publicKey: Uint8Array
  onClose: () => void
  onCreated: (groupId: string) => void | Promise<void>
}

// 4 letters + dash + 4 alphanumerics, e.g. "MOON-7F2A". Avoids ambiguous chars
// like 0/O, 1/I. Generated client-side; the RPC enforces uniqueness via the
// invite_code unique index and returns an error on conflict so the user can
// regenerate.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function pickFrom(alphabet: string, length: number): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length]
  return out
}

export function randomInviteCode(): string {
  return `${pickFrom(LETTERS, 4)}-${pickFrom(ALNUM, 4)}`
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

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15A9 9 0 0 1 5.64 18.36L1 14" />
    </svg>
  )
}

export default function CreateGroupModal({ userId, publicKey, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(() => randomInviteCode())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upsertGroupKey = useHistoryStore((s) => s.upsertGroupKey)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Group name is required')
      return
    }
    if (cleanName.length > 60) {
      setError('Group name must be 60 characters or fewer')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const groupKey = await mintNewGroupKey()
      const sealed = await sealKeyForOwnPublicKey(groupKey, publicKey)
      const groupId = await createGroup(cleanName, code, sealed)
      upsertGroupKey(groupId, groupKey)
      await cacheGroupKey(groupId, groupKey)
      await onCreated(groupId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Invite code collision is the only common retryable error.
      if (msg.toLowerCase().includes('invite_code')) {
        setError('That invite code is taken — regenerate and try again.')
      } else {
        setError(msg || 'Could not create group')
      }
      setBusy(false)
    }
    // On success we leave busy=true so the spinner stays until the parent
    // unmounts us in onCreated.
  }

  void userId

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.head}>
          <h2 className={styles.title}>Create a group</h2>
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

        <form className={styles.body} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-group-name">
              Group name
            </label>
            <input
              id="np-group-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Family, Friends, Roommates…"
              maxLength={60}
              required
              autoFocus
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-invite-code">
              Invite code
            </label>
            <div className={styles.codeRow}>
              <input
                id="np-invite-code"
                className={`${styles.input} ${styles.codeInput}`}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={32}
                disabled={busy}
                spellCheck={false}
                autoCapitalize="characters"
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setCode(randomInviteCode())}
                disabled={busy}
                title="Regenerate"
                aria-label="Regenerate invite code"
              >
                <RefreshIcon />
              </button>
            </div>
            <p className={styles.hint}>
              Share this code with anyone you want to invite. You can rotate it later from the group
              menu.
            </p>
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={busy || !name.trim() || code.length < 4}
            >
              {busy ? <span className={styles.btnSpinner} /> : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
