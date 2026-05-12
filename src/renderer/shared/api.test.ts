import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptPhoto, genGroupKey, toBase64 } from './crypto.js'

// Hoisted spy registry so the vi.mock factory below can reference it.
const supabaseSpies = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('./supabase.js', () => ({
  supabase: {
    from: supabaseSpies.from,
    storage: { from: supabaseSpies.storageFrom },
    rpc: supabaseSpies.rpc,
  },
}))

import { approveProfile, uploadPhoto } from './api.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const TARGET_ID = '00000000-0000-0000-0000-000000000002'

beforeEach(() => {
  supabaseSpies.from.mockReset()
  supabaseSpies.storageFrom.mockReset()
  supabaseSpies.rpc.mockReset()
})

describe('uploadPhoto', () => {
  it('encrypts the blob, uploads as a .bin to the user folder, then inserts a row', async () => {
    const groupKey = await genGroupKey()
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const blob = new Blob([plaintext as BlobPart])

    const upload = vi.fn().mockResolvedValue({ error: null })
    const remove = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })
    supabaseSpies.storageFrom.mockReturnValue({ upload, remove })
    supabaseSpies.from.mockReturnValue({ insert })

    await uploadPhoto(blob, USER_ID, groupKey, false)

    expect(upload).toHaveBeenCalledTimes(1)
    const [filename, payload, opts] = upload.mock.calls[0]
    expect(filename).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]+\\.bin$`))
    expect(opts).toEqual({ contentType: 'application/octet-stream', upsert: false })
    expect(payload).toBeInstanceOf(Uint8Array)

    // The uploaded bytes must NOT contain the plaintext anywhere.
    const payloadStr = Array.from(payload as Uint8Array).join(',')
    expect(payloadStr).not.toContain(Array.from(plaintext).join(','))

    // And they must decrypt back to the original.
    const decrypted = await decryptPhoto(payload as Uint8Array, groupKey)
    expect(Array.from(decrypted)).toEqual(Array.from(plaintext))

    // The DB row references the same filename.
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({
      sender_id: USER_ID,
      storage_path: filename,
      hidden: false,
    })

    // Rollback never fires on success.
    expect(remove).not.toHaveBeenCalled()
  })

  it('rolls back the storage upload if the DB insert fails', async () => {
    const groupKey = await genGroupKey()
    const blob = new Blob([new Uint8Array([1, 2, 3]) as BlobPart])
    const upload = vi.fn().mockResolvedValue({ error: null })
    const remove = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: new Error('rls denied') })
    supabaseSpies.storageFrom.mockReturnValue({ upload, remove })
    supabaseSpies.from.mockReturnValue({ insert })

    await expect(uploadPhoto(blob, USER_ID, groupKey)).rejects.toThrow(/rls denied/)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0][0]).toEqual([upload.mock.calls[0][0]])
  })

  it('forwards the upload error if storage rejects', async () => {
    const groupKey = await genGroupKey()
    const blob = new Blob([new Uint8Array([1, 2, 3]) as BlobPart])
    const upload = vi.fn().mockResolvedValue({ error: new Error('bucket full') })
    const insert = vi.fn().mockResolvedValue({ error: null })
    supabaseSpies.storageFrom.mockReturnValue({ upload })
    supabaseSpies.from.mockReturnValue({ insert })

    await expect(uploadPhoto(blob, USER_ID, groupKey)).rejects.toThrow(/bucket full/)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('approveProfile', () => {
  // Pre-built once: a base64-encoded X25519 public key for the target user.
  let targetPublicKeyB64: string
  beforeAll(async () => {
    const { genKeypair } = await import('./crypto.js')
    const kp = await genKeypair()
    targetPublicKeyB64 = toBase64(kp.publicKey)
  })

  it('throws a clear error when the target has no public_key', async () => {
    // fetchPublicKey: from('profiles').select('public_key').eq('id', $1).single()
    const single = vi.fn().mockResolvedValue({ data: { public_key: null }, error: null })
    const selectEq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq: selectEq })
    supabaseSpies.from.mockReturnValue({ select })

    const groupKey = await genGroupKey()
    await expect(approveProfile(TARGET_ID, groupKey, USER_ID)).rejects.toThrow(
      /has not signed in from the new app build/i,
    )
  })

  it('happy path: seals the group key, upserts the grant, then flips approved', async () => {
    // fetchPublicKey chain
    const single = vi
      .fn()
      .mockResolvedValue({ data: { public_key: targetPublicKeyB64 }, error: null })
    const selectEq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq: selectEq })

    // writeGrant: from('vault_grants').upsert(...)
    const upsert = vi.fn().mockResolvedValue({ error: null })

    // Final update: from('profiles').update({approved:true}).eq('id', $1)
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })

    supabaseSpies.from.mockImplementation((table: string) => {
      if (table === 'vault_grants') return { upsert }
      if (table === 'profiles') return { select, update }
      throw new Error(`unexpected table: ${table}`)
    })

    const groupKey = await genGroupKey()
    await approveProfile(TARGET_ID, groupKey, USER_ID)

    // Sealed group key written to vault_grants targeted at the new user.
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toMatchObject({
      user_id: TARGET_ID,
      granted_by: USER_ID,
    })
    expect(typeof upsert.mock.calls[0][0].sealed_group_key).toBe('string')
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'user_id' })

    // approved=true flipped via the update chain on the same target.
    expect(update).toHaveBeenCalledWith({ approved: true })
    expect(updateEq).toHaveBeenCalledWith('id', TARGET_ID)
  })

  it('does not flip approved if writing the grant fails', async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { public_key: targetPublicKeyB64 }, error: null })
    const selectEq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq: selectEq })
    const upsert = vi.fn().mockResolvedValue({ error: new Error('rls denied') })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })

    supabaseSpies.from.mockImplementation((table: string) => {
      if (table === 'vault_grants') return { upsert }
      if (table === 'profiles') return { select, update }
      throw new Error(`unexpected table: ${table}`)
    })

    const groupKey = await genGroupKey()
    await expect(approveProfile(TARGET_ID, groupKey, USER_ID)).rejects.toThrow(/rls denied/)
    expect(update).not.toHaveBeenCalled()
  })
})
