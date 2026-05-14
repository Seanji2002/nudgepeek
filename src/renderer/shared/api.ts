import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.js'
import { identifierToEmail } from './identity.js'
import { encryptPhoto, fromBase64, sealGroupKey, toBase64 } from './crypto.js'
import type {
  CommentWithMeta,
  GroupMember,
  GroupRole,
  GroupSummary,
  PendingGroupRequest,
  PhotoWithMeta,
  UnreadPhotoWithMeta,
} from './types.js'

// ── Photos ──────────────────────────────────────────────────────────────────

export async function listPhotos(groupId: string, limit = 50): Promise<PhotoWithMeta[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(
      'id, sender_id, group_id, storage_path, hidden, created_at, profiles:sender_id(display_name)',
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  if (!data) return []

  const results = await Promise.all(
    data.map(async (row) => {
      const { data: urlData } = await supabase.storage
        .from('photos')
        .createSignedUrl(row.storage_path as string, 3600)

      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles

      return {
        id: row.id as string,
        senderId: row.sender_id as string,
        groupId: row.group_id as string,
        storagePath: row.storage_path as string,
        hidden: (row.hidden as boolean | null) ?? false,
        createdAt: row.created_at as string,
        senderName: (profile as { display_name?: string } | null)?.display_name ?? 'Unknown',
        signedUrl: urlData?.signedUrl ?? '',
      } satisfies PhotoWithMeta
    }),
  )

  return results
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function uploadPhoto(
  blob: Blob,
  senderId: string,
  groupId: string,
  groupKey: Uint8Array,
  hidden = false,
): Promise<void> {
  const plain = new Uint8Array(await blob.arrayBuffer())
  const payload = await encryptPhoto(plain, groupKey)
  const filename = `${groupId}/${senderId}/${crypto.randomUUID()}.bin`

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(filename, payload, { contentType: 'application/octet-stream', upsert: false })

  if (uploadError) throw uploadError

  const { error: insertError } = await supabase
    .from('photos')
    .insert({ sender_id: senderId, group_id: groupId, storage_path: filename, hidden })

  if (insertError) {
    await supabase.storage.from('photos').remove([filename])
    throw insertError
  }
}

export async function downscaleImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('canvas.toBlob returned null'))
          resolve(blob)
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// ── Comments ────────────────────────────────────────────────────────────────

const COMMENT_SELECT =
  'id, photo_id, user_id, body, created_at, updated_at, profiles:user_id(display_name)'

interface CommentRow {
  id: string
  photo_id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string | null
  profiles: { display_name?: string } | { display_name?: string }[] | null
}

function rowToCommentWithMeta(row: CommentRow): CommentWithMeta {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return {
    id: row.id,
    photoId: row.photo_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: profile?.display_name ?? 'Unknown',
  }
}

export async function listComments(photoId: string): Promise<CommentWithMeta[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => rowToCommentWithMeta(row as CommentRow))
}

export async function postComment(
  photoId: string,
  userId: string,
  body: string,
): Promise<CommentWithMeta> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ photo_id: photoId, user_id: userId, body: body.trim() })
    .select(COMMENT_SELECT)
    .single()
  if (error) throw error
  return rowToCommentWithMeta(data as CommentRow)
}

export async function updateComment(commentId: string, body: string): Promise<CommentWithMeta> {
  const { data, error } = await supabase
    .from('comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .select(COMMENT_SELECT)
    .single()
  if (error) throw error
  return rowToCommentWithMeta(data as CommentRow)
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

export async function fetchAuthorName(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
  return (data as { display_name?: string } | null)?.display_name ?? 'Unknown'
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function signUpWithName(
  name: string,
  password: string,
): Promise<{ session: Session | null }> {
  const email = identifierToEmail(name)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name.trim() } },
  })
  if (error) throw error
  return { session: data.session }
}

// ── Profile crypto material ────────────────────────────────────────────────

export interface OwnCryptoMaterial {
  publicKey: Uint8Array | null
  encryptedPrivateKey: Uint8Array | null
  privateKeyNonce: Uint8Array | null
  kdfSalt: Uint8Array | null
}

export async function fetchOwnCryptoMaterial(userId: string): Promise<OwnCryptoMaterial> {
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key, encrypted_private_key, private_key_nonce, kdf_salt')
    .eq('id', userId)
    .single()
  if (error) throw error
  const row = data as {
    public_key: string | null
    encrypted_private_key: string | null
    private_key_nonce: string | null
    kdf_salt: string | null
  }
  return {
    publicKey: row.public_key ? fromBase64(row.public_key) : null,
    encryptedPrivateKey: row.encrypted_private_key ? fromBase64(row.encrypted_private_key) : null,
    privateKeyNonce: row.private_key_nonce ? fromBase64(row.private_key_nonce) : null,
    kdfSalt: row.kdf_salt ? fromBase64(row.kdf_salt) : null,
  }
}

export async function writeOwnCryptoMaterial(
  userId: string,
  material: {
    publicKey: Uint8Array
    encryptedPrivateKey: Uint8Array
    privateKeyNonce: Uint8Array
    kdfSalt: Uint8Array
  },
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      public_key: toBase64(material.publicKey),
      encrypted_private_key: toBase64(material.encryptedPrivateKey),
      private_key_nonce: toBase64(material.privateKeyNonce),
      kdf_salt: toBase64(material.kdfSalt),
    })
    .eq('id', userId)
  if (error) throw error
}

export async function fetchPublicKey(userId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', userId)
    .single()
  if (error) throw error
  const pk = (data as { public_key: string | null } | null)?.public_key
  return pk ? fromBase64(pk) : null
}

// ── Group vault grants ──────────────────────────────────────────────────────

export interface SealedGrant {
  groupId: string
  sealedGroupKey: Uint8Array
}

export async function fetchAllOwnGrants(userId: string): Promise<SealedGrant[]> {
  const { data, error } = await supabase
    .from('vault_grants')
    .select('group_id, sealed_group_key')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map((row) => ({
    groupId: (row as { group_id: string }).group_id,
    sealedGroupKey: fromBase64((row as { sealed_group_key: string }).sealed_group_key),
  }))
}

// ── Group membership / management ───────────────────────────────────────────

interface GroupMembershipRow {
  group_id: string
  role: GroupRole
  approved: boolean
  groups: {
    name: string
    invite_code: string
  } | null
}

export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role, approved, groups:group_id(name, invite_code)')
    .eq('user_id', userId)
    .eq('approved', true)
  if (error) throw error
  return (data ?? []).map((row) => {
    const r = row as unknown as GroupMembershipRow
    const groupRow = Array.isArray(r.groups) ? r.groups[0] : r.groups
    return {
      id: r.group_id,
      name: groupRow?.name ?? '',
      // Only owner/admin can see invite_code via RLS read on groups; for
      // members, the field comes back blank-but-present so we surface null.
      inviteCode: r.role === 'owner' || r.role === 'admin' ? (groupRow?.invite_code ?? null) : null,
      role: r.role,
      approved: r.approved,
    } satisfies GroupSummary
  })
}

export interface PendingMembership {
  groupId: string
  groupName: string
}

export async function listPendingOwnRequests(userId: string): Promise<PendingMembership[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, groups:group_id(name)')
    .eq('user_id', userId)
    .eq('approved', false)
  if (error) throw error
  return (data ?? []).map((row) => {
    const r = row as unknown as { group_id: string; groups: { name: string } | { name: string }[] }
    const g = Array.isArray(r.groups) ? r.groups[0] : r.groups
    return { groupId: r.group_id, groupName: g?.name ?? '' }
  })
}

export async function createGroup(
  name: string,
  inviteCode: string,
  sealedSelf: Uint8Array,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_invite_code: inviteCode,
    p_sealed_self: toBase64(sealedSelf),
  })
  if (error) throw error
  return data as string
}

export async function joinGroupByCode(
  code: string,
): Promise<{ groupId: string; groupName: string }> {
  const { data, error } = await supabase.rpc('join_group_by_code', { p_code: code })
  if (error) throw error
  const rows = (data ?? []) as Array<{ group_id: string; group_name: string }>
  const row = rows[0]
  if (!row) throw new Error('Invite code not found')
  return { groupId: row.group_id, groupName: row.group_name }
}

export async function listPendingJoinRequests(groupId: string): Promise<PendingGroupRequest[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, created_at, profiles:user_id(display_name)')
    .eq('group_id', groupId)
    .eq('approved', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      user_id: string
      created_at: string
      profiles: { display_name: string } | { display_name: string }[] | null
    }
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      userId: r.user_id,
      displayName: p?.display_name ?? 'Unknown',
      createdAt: r.created_at,
    } satisfies PendingGroupRequest
  })
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, approved, created_at, profiles:user_id(display_name)')
    .eq('group_id', groupId)
    .eq('approved', true)
  if (error) throw error
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      user_id: string
      role: GroupRole
      approved: boolean
      created_at: string
      profiles: { display_name: string } | { display_name: string }[] | null
    }
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      userId: r.user_id,
      displayName: p?.display_name ?? 'Unknown',
      role: r.role,
      approved: r.approved,
      createdAt: r.created_at,
    } satisfies GroupMember
  })
}

export async function approveGroupMember(
  groupId: string,
  userId: string,
  groupKey: Uint8Array,
): Promise<void> {
  const publicKey = await fetchPublicKey(userId)
  if (!publicKey) {
    throw new Error(
      "This user hasn't finished setting up their account yet — ask them to sign in once, then try approving again.",
    )
  }
  const sealed = await sealGroupKey(groupKey, publicKey)
  const { error } = await supabase.rpc('approve_group_member', {
    p_group: groupId,
    p_user: userId,
    p_sealed_group_key: toBase64(sealed),
  })
  if (error) throw error
}

export async function rejectGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_group_member', {
    p_group: groupId,
    p_user: userId,
  })
  if (error) throw error
}

export async function promoteGroupAdmin(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_group_admin', {
    p_group: groupId,
    p_user: userId,
  })
  if (error) throw error
}

export async function demoteGroupAdmin(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('demote_group_admin', {
    p_group: groupId,
    p_user: userId,
  })
  if (error) throw error
}

export async function regenerateInviteCode(groupId: string, newCode: string): Promise<void> {
  const { error } = await supabase.rpc('regenerate_invite_code', {
    p_group: groupId,
    p_new_code: newCode,
  })
  if (error) throw error
}

// ── Photo reads (widget queue) ──────────────────────────────────────────────

export async function listUnreadPhotos(limit = 50): Promise<UnreadPhotoWithMeta[]> {
  const { data, error } = await supabase.rpc('list_unread_photos', { p_limit: limit })
  if (error) throw error
  if (!data) return []

  const rows = data as Array<{
    id: string
    sender_id: string
    group_id: string
    storage_path: string
    hidden: boolean | null
    created_at: string
    sender_name: string | null
    group_name: string | null
  }>

  return Promise.all(
    rows.map(async (row) => {
      const { data: urlData } = await supabase.storage
        .from('photos')
        .createSignedUrl(row.storage_path, 3600)
      return {
        id: row.id,
        senderId: row.sender_id,
        groupId: row.group_id,
        storagePath: row.storage_path,
        hidden: row.hidden ?? false,
        createdAt: row.created_at,
        senderName: row.sender_name ?? 'Unknown',
        groupName: row.group_name ?? '',
        signedUrl: urlData?.signedUrl ?? '',
      } satisfies UnreadPhotoWithMeta
    }),
  )
}

export async function markPhotoRead(photoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('photo_reads')
    .upsert({ user_id: userId, photo_id: photoId }, { ignoreDuplicates: true })
  if (error) throw error
}
