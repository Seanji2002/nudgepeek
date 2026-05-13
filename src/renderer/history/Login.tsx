import React, { FormEvent, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getCurrentSupabaseUrl, supabase } from '../shared/supabase.js'
import { signUpWithName } from '../shared/api.js'
import { provisionVaultOnSignin } from '../shared/vault.js'
import { identifierToEmail, isValidName } from '../shared/identity.js'
import { useHistoryStore } from './store.js'
import styles from './Login.module.css'

interface Props {
  onSuccess: (session: Session) => Promise<void>
  onSwitchProject: () => Promise<void>
}

type Mode = 'signin' | 'signup'

function projectHostname(): string | null {
  const url = getCurrentSupabaseUrl()
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function humaniseAuthError(raw: string): string {
  if (/User already registered/i.test(raw)) return 'That name is already taken — pick another.'
  if (/Invalid login credentials/i.test(raw)) return 'Wrong name or password.'
  return raw
}

export default function Login({ onSuccess, onSwitchProject }: Props) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const host = projectHostname()

  async function handleSwitchProject() {
    if (switching) return
    setSwitching(true)
    try {
      await onSwitchProject()
    } catch (err) {
      console.error('[login] switch project failed:', err)
      setError('Could not switch project — try again.')
      setSwitching(false)
    }
    // If it succeeded, this component unmounts as Bootstrap re-renders the
    // setup screen, so we don't need to clear `switching`.
  }

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    setInfo(null)
    setConfirmPassword('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: identifierToEmail(name),
          password,
        })
        if (authError) throw authError
        if (data.session) {
          await unlockVault(password, data.session.user.id)
          await onSuccess(data.session)
        }
      } else {
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        if (!isValidName(name)) {
          throw new Error(
            'Name must be at least 3 characters and start with a letter (a–z, 0–9, ., _, - allowed)',
          )
        }
        const { session } = await signUpWithName(name, password)
        if (session) {
          await unlockVault(password, session.user.id)
          await onSuccess(session)
        } else {
          setInfo(
            'Account created. Awaiting admin approval — try signing in once an admin lets you in.',
          )
          setMode('signin')
          setPassword('')
          setConfirmPassword('')
        }
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Sign in failed'
      setError(humaniseAuthError(raw))
    } finally {
      setLoading(false)
    }
  }

  async function unlockVault(pw: string, userId: string) {
    const result = await provisionVaultOnSignin(pw, userId)
    if (result.kind === 'grant-missing') {
      // Approved but no grant in DB. Abort signin so the user doesn't land in
      // an inconsistent app state.
      await supabase.auth.signOut()
      throw new Error(
        'Your account is approved but your vault grant is missing. Ask the admin to re-approve you from the Admin panel.',
      )
    }
    useHistoryStore.getState().setGroupKey(result.kind === 'ready' ? result.groupKey : null)
  }

  const isSignup = mode === 'signup'

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>NudgePeek</h1>
        <p className={styles.subtitle}>
          {isSignup ? 'Create an account to join the group' : 'Sign in to share photos'}
        </p>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={`${styles.tab} ${!isSignup ? styles.tabActive : ''}`}
            onClick={() => switchMode('signin')}
            disabled={loading}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={`${styles.tab} ${isSignup ? styles.tabActive : ''}`}
            onClick={() => switchMode('signup')}
            disabled={loading}
          >
            Sign up
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-name">
              Name
            </label>
            <input
              id="np-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isSignup ? 'alice' : 'alice (or paste your email)'}
              required
              autoComplete={isSignup ? 'username' : 'username'}
              autoFocus
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-password">
              Password
            </label>
            <input
              id="np-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {isSignup && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="np-password-confirm">
                Confirm password
              </label>
              <input
                id="np-password-confirm"
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          )}

          {error && (
            <p className={styles.errorMsg} role="alert">
              {error}
            </p>
          )}

          {info && !error && <p className={styles.infoMsg}>{info}</p>}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? (
              <span className={styles.btnSpinner} />
            ) : isSignup ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className={styles.footer}>
          {host && (
            <span className={styles.footerHost} title={getCurrentSupabaseUrl() ?? ''}>
              Connected to {host}
            </span>
          )}
          <button
            type="button"
            className={styles.footerLink}
            onClick={handleSwitchProject}
            disabled={switching}
          >
            {switching ? 'Switching…' : 'Use a different project'}
          </button>
        </div>
      </div>
    </div>
  )
}
