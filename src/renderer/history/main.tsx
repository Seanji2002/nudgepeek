import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import HistoryApp from './HistoryApp.js'
import SupabaseSetup from './SupabaseSetup.js'
import {
  envSupabaseAnonKey,
  envSupabaseUrl,
  initSupabase,
  isSupabaseInitialized,
} from '../shared/supabase.js'
import './global.css'

type Phase = 'loading' | 'setup' | 'ready'

function Bootstrap() {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const forceSetup = sessionStorage.getItem('np-force-setup') === '1'
      if (forceSetup) {
        sessionStorage.removeItem('np-force-setup')
        if (!cancelled) setPhase('setup')
        return
      }

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

  return <HistoryApp />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
)
