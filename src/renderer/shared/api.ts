import { supabase } from './supabase.js'
import type { CommentWithMeta, PhotoWithMeta } from './types.js'

export async function listPhotos(limit = 50): Promise<PhotoWithMeta[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(
      'id, sender_id, storage_path, created_at, profiles:sender_id(display_name), comments(count)',
    )
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
      const countRow = Array.isArray(row.comments) ? row.comments[0] : row.comments

      return {
        id: row.id as string,
        senderId: row.sender_id as string,
        storagePath: row.storage_path as string,
        createdAt: row.created_at as string,
        senderName: (profile as { display_name?: string } | null)?.display_name ?? 'Unknown',
        signedUrl: urlData?.signedUrl ?? '',
        commentCount: (countRow as { count?: number } | null)?.count ?? 0,
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

export async function uploadPhoto(blob: Blob, senderId: string): Promise<void> {
  const filename = `${senderId}/${crypto.randomUUID()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(filename, blob, { contentType: 'image/jpeg', upsert: false })

  if (uploadError) throw uploadError

  const { error: insertError } = await supabase
    .from('photos')
    .insert({ sender_id: senderId, storage_path: filename })

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
