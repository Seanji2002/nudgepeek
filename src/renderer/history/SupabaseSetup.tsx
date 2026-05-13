import React, { FormEvent, useState } from 'react'
import { envSupabaseAnonKey, envSupabaseUrl, initSupabase } from '../shared/supabase.js'
import styles from './SupabaseSetup.module.css'

interface Props {
  onReady: () => void
}

const hasEnvDefaults = Boolean(envSupabaseUrl && envSupabaseAnonKey)

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
  } catch {
    return false
  }
}

export default function SupabaseSetup({ onReady }: Props) {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanUrl = url.trim().replace(/\/+$/, '')
    const cleanKey = anonKey.trim()

    if (!isValidUrl(cleanUrl)) {
      setError('Project URL must be a valid https:// URL')
      return
    }
    if (cleanKey.length < 20) {
      setError('Anon key looks too short — paste the full key from Settings → API')
      return
    }

    setSaving(true)
    try {
      await window.nudgeHistory.setStoredSupabaseConfig({ url: cleanUrl, anonKey: cleanKey })
      initSupabase(cleanUrl, cleanKey)
      onReady()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Could not save credentials')
    } finally {
      setSaving(false)
    }
  }

  function handleUseDefault() {
    if (!hasEnvDefaults || saving) return
    setError(null)
    initSupabase(envSupabaseUrl!, envSupabaseAnonKey!)
    onReady()
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logoMark}>N</div>
        <h1 className={styles.title}>Connect your Supabase project</h1>
        <p className={styles.subtitle}>
          NudgePeek runs on your own Supabase backend. Paste your project URL and anon key — they’re
          stored encrypted on this device.
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-supabase-url">
              Project URL
            </label>
            <input
              id="np-supabase-url"
              className={styles.input}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              required
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              disabled={saving}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-supabase-anon-key">
              Anon / public key
            </label>
            <textarea
              id="np-supabase-anon-key"
              className={`${styles.input} ${styles.textarea}`}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
              required
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              rows={3}
              disabled={saving}
            />
          </div>

          <p className={styles.hint}>
            Find both in your Supabase dashboard under <strong>Settings → API</strong>. See
            SUPABASE_SETUP.md for the schema your project needs.
          </p>

          {error && (
            <p className={styles.errorMsg} role="alert">
              {error}
            </p>
          )}

          <button
            className={styles.submitBtn}
            type="submit"
            disabled={saving || !url.trim() || !anonKey.trim()}
          >
            {saving ? <span className={styles.btnSpinner} /> : 'Connect'}
          </button>

          {hasEnvDefaults && (
            <button
              type="button"
              className={styles.defaultBtn}
              onClick={handleUseDefault}
              disabled={saving}
            >
              Use default credentials
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
