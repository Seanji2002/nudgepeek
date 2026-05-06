import React from 'react'
import ReactDOM from 'react-dom/client'
import HistoryApp from './HistoryApp.js'
import { missingEnv } from '../shared/supabase.js'
import './global.css'

function MissingEnvError() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '2rem',
        fontFamily: 'sans-serif',
        background: '#0f0f14',
        color: '#f87171',
        textAlign: 'center',
        gap: '0.75rem',
      }}
    >
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <strong style={{ fontSize: '1rem' }}>Missing Supabase environment variables</strong>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: 340, margin: 0 }}>
        Copy{' '}
        <code style={{ background: '#1e1e2e', padding: '0 4px', borderRadius: 4 }}>
          .env.example
        </code>{' '}
        to <code style={{ background: '#1e1e2e', padding: '0 4px', borderRadius: 4 }}>.env</code>{' '}
        and fill in your <strong style={{ color: '#cbd5e1' }}>VITE_SUPABASE_URL</strong> and{' '}
        <strong style={{ color: '#cbd5e1' }}>VITE_SUPABASE_ANON_KEY</strong>, then restart the dev
        server.
      </p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{missingEnv ? <MissingEnvError /> : <HistoryApp />}</React.StrictMode>,
)
