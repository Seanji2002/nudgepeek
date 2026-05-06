import React, { FormEvent, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase.js'
import styles from './Login.module.css'

interface Props {
  onSuccess: (session: Session) => Promise<void>
}

export default function Login({ onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw authError
      if (data.session) await onSuccess(data.session)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>NudgePeek</h1>
        <p className={styles.subtitle}>Sign in to share photos</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-email">
              Email
            </label>
            <input
              id="np-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
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
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <p className={styles.errorMsg} role="alert">
              {error}
            </p>
          )}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? <span className={styles.btnSpinner} /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
