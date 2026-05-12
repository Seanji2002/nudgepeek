import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.js'
import { identifierToEmail } from './identity.js'
import { encryptPhoto, fromBase64, sealGroupKey, toBase64 } from './crypto.js'
import type { CommentWithMeta, PendingProfile, PhotoWithMeta } from './types.js'

export async function listPhotos(limit = 50): Promise<PhotoWithMeta[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, sender_id, storage_path, hidden, created_at, profiles:sender_id(display_name)')
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
  groupKey: Uint8Array,
  hidden = false,
): Promise<void> {
  const plain = new Uint8Array(await blob.arrayBuffer())
  const payload = await encryptPhoto(plain, groupKey)
  const filename = `${senderId}/${crypto.randomUUID()}.bin`

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(filename, payload, { contentType: 'application/octet-stream', upsert: false })

  if (uploadError) throw uploadError

  const { error: insertError } = await supabase
    .from('photos')
    .insert({ sender_id: senderId, storage_path: filename, hidden })

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

export async function listPendingProfiles(): Promise<PendingProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('approved', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    createdAt: row.created_at as string,
  }))
}

export async function approveProfile(
  profileId: string,
  groupKey: Uint8Array,
  grantedBy: string,
): Promise<void> {
  const publicKey = await fetchPublicKey(profileId)
  if (!publicKey) {
    throw new Error(
      'This user has not signed in from the new app build yet. Ask them to sign in once, then try approving again.',
    )
  }
  const sealed = await sealGroupKey(groupKey, publicKey)
  await writeGrant(profileId, sealed, grantedBy)
  const { error } = await supabase.from('profiles').update({ approved: true }).eq('id', profileId)
  if (error) throw error
}

export interface OwnCryptoMaterial {
  publicKey: Uint8Array | null
  encryptedPrivateKey: Uint8Array | null
  privateKeyNonce: Uint8Array | null
  kdfSalt: Uint8Array | null
  isAdmin: boolean
  approved: boolean
}

export async function fetchOwnCryptoMaterial(userId: string): Promise<OwnCryptoMaterial> {
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key, encrypted_private_key, private_key_nonce, kdf_salt, is_admin, approved')
    .eq('id', userId)
    .single()
  if (error) throw error
  const row = data as {
    public_key: string | null
    encrypted_private_key: string | null
    private_key_nonce: string | null
    kdf_salt: string | null
    is_admin: boolean | null
    approved: boolean | null
  }
  return {
    publicKey: row.public_key ? fromBase64(row.public_key) : null,
    encryptedPrivateKey: row.encrypted_private_key ? fromBase64(row.encrypted_private_key) : null,
    privateKeyNonce: row.private_key_nonce ? fromBase64(row.private_key_nonce) : null,
    kdfSalt: row.kdf_salt ? fromBase64(row.kdf_salt) : null,
    isAdmin: row.is_admin ?? false,
    approved: row.approved ?? false,
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

export async function fetchOwnGrant(userId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase
    .from('vault_grants')
    .select('sealed_group_key')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  const sealed = (data as { sealed_group_key: string } | null)?.sealed_group_key
  return sealed ? fromBase64(sealed) : null
}

export async function vaultExists(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_any_vault_grant')
  if (error) throw error
  return data === true
}

export async function writeGrant(
  userId: string,
  sealedGroupKey: Uint8Array,
  grantedBy: string,
): Promise<void> {
  const { error } = await supabase.from('vault_grants').upsert(
    {
      user_id: userId,
      sealed_group_key: toBase64(sealedGroupKey),
      granted_by: grantedBy,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export async function rejectProfile(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_user', { target_id: profileId })
  if (error) throw error
}

export async function listUnreadPhotos(limit = 50): Promise<PhotoWithMeta[]> {
  const { data, error } = await supabase.rpc('list_unread_photos', { p_limit: limit })
  if (error) throw error
  if (!data) return []

  const rows = data as Array<{
    id: string
    sender_id: string
    storage_path: string
    hidden: boolean | null
    created_at: string
    sender_name: string | null
  }>

  return Promise.all(
    rows.map(async (row) => {
      const { data: urlData } = await supabase.storage
        .from('photos')
        .createSignedUrl(row.storage_path, 3600)
      return {
        id: row.id,
        senderId: row.sender_id,
        storagePath: row.storage_path,
        hidden: row.hidden ?? false,
        createdAt: row.created_at,
        senderName: row.sender_name ?? 'Unknown',
        signedUrl: urlData?.signedUrl ?? '',
      } satisfies PhotoWithMeta
    }),
  )
}

export async function markPhotoRead(photoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('photo_reads')
    .upsert({ user_id: userId, photo_id: photoId }, { ignoreDuplicates: true })
  if (error) throw error
}
