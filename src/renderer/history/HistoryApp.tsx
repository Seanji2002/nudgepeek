import React, { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase.js'
import { listPhotos, getSignedUrl } from '../shared/api.js'
import { useHistoryStore, type AuthUser } from './store.js'
import Login from './Login.js'
import Feed from './Feed.js'
import Composer from './Composer.js'
import styles from './styles.module.css'

export default function HistoryApp() {
  const { user, setUser, setPhotos, prependPhoto, setLoading } = useHistoryStore()
  const [authChecked, setAuthChecked] = useState(false)

  const applySession = useCallback(
    async (session: Session) => {
      window.nudgeHistory.updateSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      })

      // Upsert the profile so it always exists (handles first sign-in)
      await supabase
        .from('profiles')
        .upsert(
          { id: session.user.id, display_name: session.user.email?.split('@')[0] ?? 'User' },
          { onConflict: 'id', ignoreDuplicates: true },
        )

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .maybeSingle()

      const authUser: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? '',
        displayName:
          (profile as { display_name?: string } | null)?.display_name ??
          session.user.email ??
          'Unknown',
      }
      setUser(authUser)

      setLoading(true)
      try {
        setPhotos(await listPhotos(50))
      } finally {
        setLoading(false)
      }
    },
    [setUser, setPhotos, setLoading],
  )

  // ─── Restore session on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      // 1. Check if Supabase already has a session in localStorage
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session && !cancelled) {
        await applySession(session)
      } else if (!session) {
        // 2. Try to restore from main-process safeStorage
        const stored = await window.nudgeHistory.getStoredSession()
        if (stored && !cancelled) {
          const { data, error } = await supabase.auth.setSession({
            access_token: stored.accessToken,
            refresh_token: stored.refreshToken,
          })
          if (!error && data.session && !cancelled) {
            await applySession(data.session)
          }
        }
      }

      if (!cancelled) setAuthChecked(true)
    }

    init()
    return () => {
      cancelled = true
    }
  }, [applySession])

  // ─── Sync token refreshes to main ────────────────────────────────────
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
        window.nudgeHistory.updateSession({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        })
      } else if (event === 'SIGNED_OUT') {
        window.nudgeHistory.updateSession(null)
        setUser(null)
        setPhotos([])
      }
    })
    return () => subscription.unsubscribe()
  }, [setUser, setPhotos])

  // ─── Force sign-out from tray menu ───────────────────────────────────
  useEffect(() => {
    const remove = window.nudgeHistory.onForceSignout(async () => {
      await supabase.auth.signOut()
    })
    return remove
  }, [])

  // ─── Realtime subscription (active only when logged in) ───────────────
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('nudgepeek-photos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos' },
        async (payload) => {
          const row = payload.new as {
            id: string
            sender_id: string
            storage_path: string
            created_at: string
          }

          const [profileRes, signedUrl] = await Promise.all([
            supabase.from('profiles').select('display_name').eq('id', row.sender_id).single(),
            getSignedUrl(row.storage_path),
          ])

          const senderName =
            (profileRes.data as { display_name?: string } | null)?.display_name ?? 'Unknown'

          prependPhoto({
            id: row.id,
            senderId: row.sender_id,
            storagePath: row.storage_path,
            createdAt: row.created_at,
            senderName,
            signedUrl,
          })

          window.nudgeHistory.sendIncomingPhoto({
            photoId: row.id,
            signedUrl,
            senderName,
            senderUserId: row.sender_id,
            sentAt: row.created_at,
            fromCurrentUser: row.sender_id === user.id,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, prependPhoto])

  // ─── Render ───────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!user) {
    return <Login onSuccess={applySession} />
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>N</span>
          <span className={styles.logoText}>NudgePeek</span>
        </div>
        <div className={styles.headerActions}>
          <Composer userId={user.id} />
          <div className={styles.avatar} title={`${user.displayName} · ${user.email}`}>
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Feed />
      </main>
    </div>
  )
}
