import { useEffect, useState } from 'react'
import { decryptPhoto } from '../shared/crypto.js'
import { useHistoryStore } from './store.js'

export interface DecryptedPhoto {
  src: string | null
  error: string | null
}

export function useDecryptedPhoto(signedUrl: string, groupId: string): DecryptedPhoto {
  const groupKey = useHistoryStore((s) => s.groupKeys.get(groupId))
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!signedUrl || !groupKey) return

    let cancelled = false
    let createdUrl: string | null = null

    void (async () => {
      try {
        const resp = await fetch(signedUrl)
        if (!resp.ok) throw new Error(`fetch ${resp.status}`)
        const buf = new Uint8Array(await resp.arrayBuffer())
        const plain = await decryptPhoto(buf, groupKey)
        if (cancelled) return
        const blob = new Blob([plain as BlobPart], { type: 'image/jpeg' })
        createdUrl = URL.createObjectURL(blob)
        setSrc(createdUrl)
        setError(null)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [signedUrl, groupKey])

  return { src, error }
}
