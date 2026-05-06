import { supabase } from './supabase.js'
import type { PhotoWithMeta } from './types.js'

export async function listPhotos(limit = 50): Promise<PhotoWithMeta[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, sender_id, storage_path, created_at, profiles:sender_id(display_name)')
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
