import React, { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../shared/supabase.js'
import {
  fetchAuthorName,
  getSignedUrl,
  listMyGroups,
  listPendingOwnRequests,
  listPhotos,
  listUnreadPhotos,
  markPhotoRead,
} from '../shared/api.js'
import { clearAllLocalVaults, loadAllGroupKeys, type UserKeypair } from '../shared/vault.js'
import { decryptPhoto } from '../shared/crypto.js'
import { useHistoryStore, type AuthUser } from './store.js'
import { commentBus } from './commentBus.js'
import Login from './Login.js'
import Feed from './Feed.js'
import Composer from './Composer.js'
import GroupPicker from './GroupPicker.js'
import GroupSelector from './GroupSelector.js'
import AdminPanel from './AdminPanel.js'
import UpdatePrompt from './UpdatePrompt.js'
import styles from './styles.module.css'

const LAST_GROUP_KEY = 'np.lastGroupId'

interface PhotoRowMinimal {
  id: string
  sender_id: string
  group_id: string
  storage_path: string
  hidden: boolean | null
  created_at: string
}

// Fetch unread photos across every group the user belongs to, decrypt them
// per-group, and push the batch to the widget. Called on signin, resume, and
// visibility change.
async function seedWidgetQueue(
  groupKeys: Map<string, Uint8Array>,
  groupNames: Map<string, string>,
): Promise<void> {
  try {
    const unread = await listUnreadPhotos(50)
    const decrypted = await Promise.all(
      unread.map(async (p) => {
        const key = groupKeys.get(p.groupId)
        if (!key) return null
        try {
          const resp = await fetch(p.signedUrl)
          if (!resp.ok) throw new Error(`fetch ${resp.status} for ${p.id}`)
          const cipher = new Uint8Array(await resp.arrayBuffer())
          const photoBytes = await decryptPhoto(cipher, key)
          return {
            photoId: p.id,
            photoBytes,
            senderName: p.senderName,
            groupId: p.groupId,
            groupName: p.groupName || groupNames.get(p.groupId) || '',
            sentAt: p.createdAt,
            hidden: p.hidden,
          }
        } catch (err) {
          console.error('[seedWidgetQueue] decrypt failed for', p.id, err)
          return null
        }
      }),
    )
    window.nudgeHistory.sendSeedQueue({
      photos: decrypted.filter((p): p is NonNullable<typeof p> => p !== null),
    })
  } catch (err) {
    console.error('[seedWidgetQueue] failed:', err)
  }
}

interface HistoryAppProps {
  onSwitchProject: () => Promise<void>
}

export default function HistoryApp({ onSwitchProject }: HistoryAppProps) {
  const {
    user,
    keypair,
    myGroups,
    currentGroupId,
    groupKeys,
    setUser,
    setKeypair,
    setMyGroups,
    setCurrentGroup,
    setGroupKeys,
    setPhotos,
    prependPhoto,
    setLoading,
  } = useHistoryStore()
  const [authChecked, setAuthChecked] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [pendingRequests, setPendingRequests] = useState(0)

  // Pull the user's group list + pending requests, sync to store, return the
  // active group choice (or null if there are none).
  const refreshGroups = useCallback(
    async (userId: string): Promise<string | null> => {
      const [groups, pending] = await Promise.all([
        listMyGroups(userId),
        listPendingOwnRequests(userId),
      ])
      setMyGroups(groups)
      setPendingRequests(pending.length)
      if (groups.length === 0) {
        setCurrentGroup(null)
        return null
      }
      const last = localStorage.getItem(LAST_GROUP_KEY)
      const fromLast = last ? groups.find((g) => g.id === last) : undefined
      const pick = fromLast ?? groups[0]
      return pick.id
    },
    [setMyGroups, setCurrentGroup],
  )

  const switchToGroup = useCallback(
    async (groupId: string) => {
      setCurrentGroup(groupId)
      localStorage.setItem(LAST_GROUP_KEY, groupId)
      setLoading(true)
      try {
        setPhotos(await listPhotos(groupId, 50))
      } catch (err) {
        console.error('[history] listPhotos failed:', err)
        setPhotos([])
      } finally {
        setLoading(false)
      }
    },
    [setCurrentGroup, setLoading, setPhotos],
  )

  const applySession = useCallback(
    async (session: Session, fromLogin?: UserKeypair) => {
      window.nudgeHistory.updateSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      })

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
        .select('display_name')
        .eq('id', session.user.id)
        .maybeSingle()

      const profileRow = profile as { display_name?: string } | null
      const authUser: AuthUser = {
        id: session.user.id,
        email: session.user.email ?? '',
        displayName: profileRow?.display_name ?? session.user.email ?? 'Unknown',
      }
      setUser(authUser)
      if (fromLogin) setKeypair(fromLogin)

      // Group keys: prefer the on-disk cache (always available, no password
      // needed). If the cache is empty AND we have the keypair from a fresh
      // login, unseal from the DB. Otherwise we can't unseal new grants in
      // this session — caller will see them on next sign-in.
      const cached = await window.nudgeHistory.getAllGroupKeys()
      const cachedMap = new Map<string, Uint8Array>()
      for (const [k, v] of Object.entries(cached)) {
        cachedMap.set(k, v instanceof Uint8Array ? v : new Uint8Array(v as ArrayLike<number>))
      }
      let keys = cachedMap
      if (fromLogin) {
        // Refresh from DB so newly-granted groups picked up between sessions
        // are unsealed in time for this signin.
        try {
          keys = await loadAllGroupKeys(session.user.id, fromLogin)
        } catch (err) {
          console.error('[history] loadAllGroupKeys failed; falling back to cache:', err)
          keys = cachedMap
        }
      }
      setGroupKeys(keys)

      const pickId = await refreshGroups(session.user.id)
      if (pickId) {
        await switchToGroup(pickId)
      }
    },
    [setUser, setKeypair, setGroupKeys, refreshGroups, switchToGroup],
  )

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // ─── Restore session on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session && !cancelled) {
        await applySession(session)
      } else if (!session) {
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
        void clearAllLocalVaults()
        localStorage.removeItem(LAST_GROUP_KEY)
        setUser(null)
        setKeypair(null)
        setMyGroups([])
        setCurrentGroup(null)
        setGroupKeys(new Map())
        setPhotos([])
        setPendingRequests(0)
      }
    })
    return () => subscription.unsubscribe()
  }, [setUser, setKeypair, setMyGroups, setCurrentGroup, setGroupKeys, setPhotos])

  // ─── Force sign-out from tray menu ───────────────────────────────────
  useEffect(() => {
    const remove = window.nudgeHistory.onForceSignout(async () => {
      await supabase.auth.signOut()
    })
    return remove
  }, [])

  // ─── Realtime: photos. We subscribe without a group filter (RLS already
  // restricts to groups we belong to) and dispatch by group_id in the
  // handler — current group goes into the feed, other groups go straight
  // to the widget.
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('nudgepeek-photos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos' },
        async (payload) => {
          const row = payload.new as PhotoRowMinimal
          const hidden = row.hidden ?? false

          const [profileRes, signedUrl] = await Promise.all([
            supabase.from('profiles').select('display_name').eq('id', row.sender_id).single(),
            getSignedUrl(row.storage_path),
          ])

          const senderName =
            (profileRes.data as { display_name?: string } | null)?.display_name ?? 'Unknown'

          const state = useHistoryStore.getState()
          const groupName = state.myGroups.find((g) => g.id === row.group_id)?.name ?? ''

          if (row.group_id === state.currentGroupId) {
            prependPhoto({
              id: row.id,
              senderId: row.sender_id,
              groupId: row.group_id,
              storagePath: row.storage_path,
              hidden,
              createdAt: row.created_at,
              senderName,
              signedUrl,
            })
          }

          const key = state.groupKeys.get(row.group_id)
          if (!key) {
            console.warn(
              '[realtime] no group key for',
              row.group_id,
              '— skipping widget delivery for',
              row.id,
            )
            return
          }

          try {
            const resp = await fetch(signedUrl)
            if (!resp.ok) throw new Error(`fetch ${resp.status}`)
            const cipher = new Uint8Array(await resp.arrayBuffer())
            const photoBytes = await decryptPhoto(cipher, key)
            window.nudgeHistory.sendIncomingPhoto({
              photoId: row.id,
              photoBytes,
              senderName,
              senderUserId: row.sender_id,
              groupId: row.group_id,
              groupName,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, prependPhoto])

  // ─── Realtime: comments ───────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // ─── Realtime: group_members (so newly approved groups appear live) ──
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('nudgepeek-group-members')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_members',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          await refreshGroups(user.id)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_members',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          await refreshGroups(user.id)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshGroups])

  // ─── Re-seed widget queue on power-resume / window-visible ──────────
  useEffect(() => {
    if (!user?.id) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const state = useHistoryStore.getState()
        if (state.groupKeys.size === 0) return
        const names = new Map(state.myGroups.map((g) => [g.id, g.name]))
        void seedWidgetQueue(state.groupKeys, names)
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
  }, [user?.id])

  // ─── Seed widget on signin / group key load ───────────────────────────
  useEffect(() => {
    if (!user?.id || groupKeys.size === 0) return
    const names = new Map(myGroups.map((g) => [g.id, g.name]))
    void seedWidgetQueue(groupKeys, names)
  }, [user?.id, groupKeys, myGroups])

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

  if (myGroups.length === 0) {
    // No groups yet — show the empty-state picker. If we don't have a
    // keypair (e.g. session restore without password), GroupPicker still
    // lets the user join with a code; "Create" needs the public key which
    // is in the keypair, so we soft-block that path until next signin.
    return (
      <>
        <UpdatePrompt />
        <GroupPicker
          userId={user.id}
          publicKey={keypair?.publicKey ?? new Uint8Array(0)}
          pendingCount={pendingRequests}
          onSignOut={handleSignOut}
          onGroupReady={async (groupId) => {
            await refreshGroups(user.id)
            await switchToGroup(groupId)
          }}
        />
      </>
    )
  }

  const currentGroup = myGroups.find((g) => g.id === currentGroupId) ?? null
  const isGroupAdmin = currentGroup?.role === 'owner' || currentGroup?.role === 'admin'

  return (
    <div className={styles.app}>
      <UpdatePrompt />
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>N</span>
          <span className={styles.logoText}>NudgePeek</span>
        </div>
        <div className={styles.headerActions}>
          {currentGroup && currentGroupId && <Composer userId={user.id} groupId={currentGroupId} />}
          <GroupSelector
            userId={user.id}
            publicKey={keypair?.publicKey ?? new Uint8Array(0)}
            onSwitchGroup={(id) => {
              void switchToGroup(id)
            }}
            onGroupsChanged={async () => {
              await refreshGroups(user.id)
            }}
          />
          {isGroupAdmin && currentGroupId && (
            <button
              type="button"
              className={styles.adminBtn}
              onClick={() => setAdminOpen(true)}
              title="Group admin"
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
      {adminOpen && currentGroupId && (
        <AdminPanel
          groupId={currentGroupId}
          isOwner={currentGroup?.role === 'owner'}
          onClose={() => setAdminOpen(false)}
          onChanged={async () => {
            await refreshGroups(user.id)
          }}
        />
      )}
    </div>
  )
}
