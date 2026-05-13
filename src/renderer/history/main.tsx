import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import HistoryApp from './HistoryApp.js'
import SupabaseSetup from './SupabaseSetup.js'
import {
  envSupabaseAnonKey,
  envSupabaseUrl,
  initSupabase,
  isSupabaseInitialized,
  supabase,
} from '../shared/supabase.js'
import './global.css'

if (navigator.userAgent.includes('Mac')) {
  document.documentElement.dataset.platform = 'darwin'
}

type Phase = 'loading' | 'setup' | 'ready'

function Bootstrap() {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const stored = await window.nudgeHistory.getStoredSupabaseConfig()
        if (cancelled) return
        if (stored?.url && stored?.anonKey) {
          initSupabase(stored.url, stored.anonKey)
          setPhase('ready')
          return
        }
      } catch (err) {
        console.error('[bootstrap] Failed to read stored Supabase config:', err)
      }

      if (envSupabaseUrl && envSupabaseAnonKey) {
        initSupabase(envSupabaseUrl, envSupabaseAnonKey)
        if (!cancelled) setPhase('ready')
        return
      }

      if (!cancelled) setPhase('setup')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // "Use a different project" handler. Sign out of the current Supabase
  // session (clears its localStorage tokens), wipe the stored config/session/
  // vault in main, and re-render the setup screen in place — no page reload.
  const handleSwitchProject = useCallback(async () => {
    if (isSupabaseInitialized()) {
      try {
        await supabase.auth.signOut()
      } catch (err) {
        console.warn('[bootstrap] supabase signOut during switch failed:', err)
      }
    }
    try {
      await window.nudgeHistory.clearStoredSupabaseConfig()
    } catch (err) {
      console.error('[bootstrap] clearStoredSupabaseConfig failed:', err)
      throw err
    }
    setPhase('setup')
  }, [])

  if (phase === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: '#0f0f14',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: '2px solid rgba(124, 106, 247, 0.25)',
            borderTopColor: '#7c6af7',
            animation: 'spin 0.75s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (phase === 'setup' || !isSupabaseInitialized()) {
    return <SupabaseSetup onReady={() => setPhase('ready')} />
  }

  return <HistoryApp onSwitchProject={handleSwitchProject} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
)
