import React, { FormEvent, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getCurrentSupabaseUrl, supabase } from '../shared/supabase.js'
import { signUpWithName } from '../shared/api.js'
import { provisionKeypairOnSignin, type UserKeypair } from '../shared/vault.js'
import { identifierToEmail, isValidName } from '../shared/identity.js'
import styles from './Login.module.css'

interface Props {
  onSuccess: (session: Session, keypair: UserKeypair) => Promise<void>
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
      let session: Session | null = null
      if (mode === 'signin') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: identifierToEmail(name),
          password,
        })
        if (authError) throw authError
        session = data.session
      } else {
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        if (!isValidName(name)) {
          throw new Error(
            'Name must be at least 3 characters and start with a letter (a–z, 0–9, ., _, - allowed)',
          )
        }
        const result = await signUpWithName(name, password)
        session = result.session
      }

      if (!session) {
        setInfo(
          mode === 'signup'
            ? 'Account created. Check your email to confirm, then sign in.'
            : 'Signed in.',
        )
        return
      }

      const provision = await provisionKeypairOnSignin(password, session.user.id)
      if (provision.kind === 'error') {
        await supabase.auth.signOut()
        throw new Error(provision.message)
      }
      await onSuccess(session, provision.keypair)
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Sign in failed'
      setError(humaniseAuthError(raw))
    } finally {
      setLoading(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>NudgePeek</h1>
        <p className={styles.subtitle}>
          {isSignup ? 'Create an account to get started' : 'Sign in to share photos'}
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
