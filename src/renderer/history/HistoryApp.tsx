import React, { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase.js'
import {
  fetchAuthorName,
  getSignedUrl,
  listPhotos,
  listUnreadPhotos,
  markPhotoRead,
} from '../shared/api.js'
import { clearLocalVault, loadGroupKeyFromCache } from '../shared/vault.js'
import { decryptPhoto } from '../shared/crypto.js'
import { useHistoryStore, type AuthUser } from './store.js'
import { commentBus } from './commentBus.js'
import Login from './Login.js'
import Feed from './Feed.js'
import Composer from './Composer.js'
import PendingApproval from './PendingApproval.js'
import AdminPanel from './AdminPanel.js'
import UpdatePrompt from './UpdatePrompt.js'
import styles from './styles.module.css'

// Fetch unread photos for the caller, decrypt them, and push the batch to
// the widget as a canonical seed of its queue. Called on signin, resume,
// and visibility change. Best-effort — failures are logged, not surfaced.
async function seedWidgetQueue(groupKey: Uint8Array): Promise<void> {
  try {
    const unread = await listUnreadPhotos(50)
    const decrypted = await Promise.all(
      unread.map(async (p) => {
        const resp = await fetch(p.signedUrl)
        if (!resp.ok) throw new Error(`fetch ${resp.status} for ${p.id}`)
        const cipher = new Uint8Array(await resp.arrayBuffer())
        const photoBytes = await decryptPhoto(cipher, groupKey)
        return {
          photoId: p.id,
          photoBytes,
          senderName: p.senderName,
          sentAt: p.createdAt,
          hidden: p.hidden,
        }
      }),
    )
    window.nudgeHistory.sendSeedQueue({ photos: decrypted })
  } catch (err) {
    console.error('[seedWidgetQueue] failed:', err)
  }
}

interface HistoryAppProps {
  onSwitchProject: () => Promise<void>
}

export default function HistoryApp({ onSwitchProject }: HistoryAppProps) {
  const { user, setUser, setGroupKey, setPhotos, prependPhoto, setLoading } = useHistoryStore()
  const [authChecked, setAuthChecked] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  const applySession = useCallback(
    async (session: Session) => {
      window.nudgeHistory.updateSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      })

      // Upsert the profile so it always exists (handles first sign-in).
      // Prefer the display_name captured at signup over the synthetic
      // email's local-part.
      const metaName = (session.user.user_metadata as { display_name?: string } | null)
        ?.display_name
      await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: metaName ?? session.user.email?.split('@')[0] ?? 'User',
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, approved, is_admin')
        .eq('id', session.user.id)
        .maybeSingle()

      const profileRow = profile as {
        display_name?: string
        approved?: boolean
        is_admin?: boolean
      } | null

      const authUser: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? '',
        displayName: profileRow?.display_name ?? session.user.email ?? 'Unknown',
        approved: profileRow?.approved ?? false,
        isAdmin: profileRow?.is_admin ?? false,
      }
      setUser(authUser)

      if (!authUser.approved) return

      // Ensure the group key is loaded. Login.tsx sets it on fresh signin;
      // on session-restore we try the safeStorage cache. Cache miss means we
      // need the password — sign back out and let the Login screen prompt.
      let key = useHistoryStore.getState().groupKey
      if (!key) {
        key = await loadGroupKeyFromCache()
        if (key) {
          setGroupKey(key)
        } else {
          await supabase.auth.signOut()
          return
        }
      }

      setLoading(true)
      try {
        setPhotos(await listPhotos(50))
      } finally {
        setLoading(false)
      }

      // Hydrate the widget's unread queue. This is the path that makes
      // photos sent while the laptop was closed show up after wake.
      void seedWidgetQueue(key)
    },
    [setUser, setGroupKey, setPhotos, setLoading],
  )

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

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
        void clearLocalVault()
        setUser(null)
        setGroupKey(null)
        setPhotos([])
      }
    })
    return () => subscription.unsubscribe()
  }, [setUser, setGroupKey, setPhotos])

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
            hidden: boolean | null
            created_at: string
          }

          const hidden = row.hidden ?? false

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
            hidden,
            createdAt: row.created_at,
            senderName,
            signedUrl,
          })

          const currentKey = useHistoryStore.getState().groupKey
          if (!currentKey) {
            console.warn('[realtime] vault locked — skipping widget delivery for', row.id)
            return
          }

          try {
            const resp = await fetch(signedUrl)
            if (!resp.ok) throw new Error(`fetch ${resp.status}`)
            const cipher = new Uint8Array(await resp.arrayBuffer())
            const photoBytes = await decryptPhoto(cipher, currentKey)
            window.nudgeHistory.sendIncomingPhoto({
              photoId: row.id,
              photoBytes,
              senderName,
              senderUserId: row.sender_id,
              sentAt: row.created_at,
              hidden,
              fromCurrentUser: row.sender_id === user.id,
            })
          } catch (err) {
            console.error('[realtime] failed to decrypt incoming photo:', err)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, prependPhoto])

  // ─── Realtime: comments (open threads stay in sync) ───────────────────
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('nudgepeek-comments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        async (payload) => {
          const row = payload.new as {
            id: string
            photo_id: string
            user_id: string
            body: string
            created_at: string
            updated_at: string | null
          }
          const authorName = await fetchAuthorName(row.user_id)
          commentBus.emit({
            kind: 'insert',
            comment: {
              id: row.id,
              photoId: row.photo_id,
              userId: row.user_id,
              body: row.body,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              authorName,
            },
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comments' },
        async (payload) => {
          const row = payload.new as {
            id: string
            photo_id: string
            user_id: string
            body: string
            created_at: string
            updated_at: string | null
          }
          const authorName = await fetchAuthorName(row.user_id)
          commentBus.emit({
            kind: 'update',
            comment: {
              id: row.id,
              photoId: row.photo_id,
              userId: row.user_id,
              body: row.body,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              authorName,
            },
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        (payload) => {
          const row = payload.old as { id: string; photo_id: string }
          if (!row?.id || !row?.photo_id) return
          commentBus.emit({ kind: 'delete', id: row.id, photoId: row.photo_id })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  // ─── Re-seed widget queue on power-resume / window-visible ──────────
  // Both signals can fire when the user comes back to the app; debounce so
  // a quick resume+focus combo only triggers a single fetch.
  useEffect(() => {
    if (!user?.approved) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const key = useHistoryStore.getState().groupKey
        if (key) void seedWidgetQueue(key)
      }, 2000)
    }

    const removeResume = window.nudgeHistory.onPowerResume(trigger)
    const onVis = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      removeResume()
      document.removeEventListener('visibilitychange', onVis)
      if (timer) clearTimeout(timer)
    }
  }, [user?.id, user?.approved])

  // ─── Widget ack → mark photo read in the DB ───────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const remove = window.nudgeHistory.onWidgetAck((photoId) => {
      markPhotoRead(photoId, user.id).catch((err) => {
        console.error('[ack] markPhotoRead failed for', photoId, err)
      })
    })
    return remove
  }, [user?.id])

  // ─── Render ───────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <>
        <UpdatePrompt />
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <UpdatePrompt />
        <Login onSuccess={applySession} onSwitchProject={onSwitchProject} />
      </>
    )
  }

  if (!user.approved) {
    return (
      <>
        <UpdatePrompt />
        <PendingApproval onSignOut={handleSignOut} />
      </>
    )
  }

  return (
    <div className={styles.app}>
      <UpdatePrompt />
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>N</span>
          <span className={styles.logoText}>NudgePeek</span>
        </div>
        <div className={styles.headerActions}>
          <Composer userId={user.id} />
          {user.isAdmin && (
            <button
              type="button"
              className={styles.adminBtn}
              onClick={() => setAdminOpen(true)}
              title="Pending approvals"
            >
              Admin
            </button>
          )}
          <div className={styles.avatar} title={`${user.displayName} · ${user.email}`}>
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Feed userId={user.id} />
      </main>
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </div>
  )
}
