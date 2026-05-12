// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import {
  decryptPhoto,
  deriveKEK,
  encryptPhoto,
  fromBase64,
  genGroupKey,
  genKeypair,
  genSalt,
  sealGroupKey,
  toBase64,
  unsealGroupKey,
  unwrapPrivateKey,
  wrapPrivateKey,
  SALT_BYTES,
} from './crypto.js'

// Argon2 is slow; share one derived KEK across tests that don't specifically
// care about the password.
let sharedKEK: Uint8Array
let sharedSalt: Uint8Array

beforeAll(async () => {
  sharedSalt = await genSalt()
  sharedKEK = await deriveKEK('correct-horse-battery-staple', sharedSalt)
})

describe('base64 round-trip', () => {
  it('round-trips an empty array', () => {
    expect(fromBase64(toBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })

  it('round-trips ASCII bytes', () => {
    const bytes = new TextEncoder().encode('hello world')
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('round-trips random binary bytes', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })
})

describe('key generation', () => {
  it('genGroupKey returns 32 bytes', async () => {
    const k = await genGroupKey()
    expect(k).toBeInstanceOf(Uint8Array)
    expect(k.length).toBe(32)
  })

  it('genGroupKey returns different keys on each call', async () => {
    const a = await genGroupKey()
    const b = await genGroupKey()
    expect(toBase64(a)).not.toBe(toBase64(b))
  })

  it('genSalt returns SALT_BYTES bytes', async () => {
    const s = await genSalt()
    expect(s.length).toBe(SALT_BYTES)
  })

  it('genKeypair returns matched 32-byte public/private pair', async () => {
    const kp = await genKeypair()
    expect(kp.publicKey.length).toBe(32)
    expect(kp.privateKey.length).toBe(32)
  })
})

describe('deriveKEK', () => {
  it('is deterministic for the same password + salt', async () => {
    const salt = await genSalt()
    const a = await deriveKEK('pw', salt)
    const b = await deriveKEK('pw', salt)
    expect(toBase64(a)).toBe(toBase64(b))
  })

  it('produces different output for the same password with a different salt', async () => {
    const s1 = await genSalt()
    const s2 = await genSalt()
    const a = await deriveKEK('pw', s1)
    const b = await deriveKEK('pw', s2)
    expect(toBase64(a)).not.toBe(toBase64(b))
  })

  it('produces different output for a different password with the same salt', async () => {
    const salt = await genSalt()
    const a = await deriveKEK('pw1', salt)
    const b = await deriveKEK('pw2', salt)
    expect(toBase64(a)).not.toBe(toBase64(b))
  })
})

describe('wrap/unwrap private key', () => {
  it('round-trips a private key with the correct KEK', async () => {
    const { privateKey } = await genKeypair()
    const wrapped = await wrapPrivateKey(privateKey, sharedKEK)
    const unwrapped = await unwrapPrivateKey(wrapped.ciphertext, wrapped.nonce, sharedKEK)
    expect(Array.from(unwrapped)).toEqual(Array.from(privateKey))
  })

  it('fails to unwrap with the wrong KEK', async () => {
    const { privateKey } = await genKeypair()
    const wrapped = await wrapPrivateKey(privateKey, sharedKEK)
    const wrongKek = await genGroupKey()
    await expect(
      unwrapPrivateKey(wrapped.ciphertext, wrapped.nonce, wrongKek),
    ).rejects.toBeDefined()
  })

  it('uses a fresh nonce each wrap', async () => {
    const { privateKey } = await genKeypair()
    const a = await wrapPrivateKey(privateKey, sharedKEK)
    const b = await wrapPrivateKey(privateKey, sharedKEK)
    expect(toBase64(a.nonce)).not.toBe(toBase64(b.nonce))
    expect(toBase64(a.ciphertext)).not.toBe(toBase64(b.ciphertext))
  })
})

describe('seal/unseal group key', () => {
  it('round-trips a group key through a sealed box', async () => {
    const kp = await genKeypair()
    const groupKey = await genGroupKey()
    const sealed = await sealGroupKey(groupKey, kp.publicKey)
    const opened = await unsealGroupKey(sealed, kp.publicKey, kp.privateKey)
    expect(Array.from(opened)).toEqual(Array.from(groupKey))
  })

  it('fails to unseal with the wrong keypair', async () => {
    const kp1 = await genKeypair()
    const kp2 = await genKeypair()
    const groupKey = await genGroupKey()
    const sealed = await sealGroupKey(groupKey, kp1.publicKey)
    await expect(unsealGroupKey(sealed, kp2.publicKey, kp2.privateKey)).rejects.toBeDefined()
  })
})

describe('photo encrypt/decrypt', () => {
  const plain = new TextEncoder().encode('this is a fake jpeg payload — assume binary')

  it('round-trips a photo blob', async () => {
    const key = await genGroupKey()
    const cipher = await encryptPhoto(plain, key)
    const out = await decryptPhoto(cipher, key)
    expect(Array.from(out)).toEqual(Array.from(plain))
  })

  it('prepends a fresh nonce each call (different ciphertext for same plaintext)', async () => {
    const key = await genGroupKey()
    const a = await encryptPhoto(plain, key)
    const b = await encryptPhoto(plain, key)
    expect(toBase64(a)).not.toBe(toBase64(b))
  })

  it('rejects tampered ciphertext', async () => {
    const key = await genGroupKey()
    const cipher = await encryptPhoto(plain, key)
    // Flip a byte in the body, after the 24-byte nonce.
    cipher[30] ^= 0xff
    await expect(decryptPhoto(cipher, key)).rejects.toBeDefined()
  })

  it('rejects decryption with the wrong group key', async () => {
    const key = await genGroupKey()
    const wrong = await genGroupKey()
    const cipher = await encryptPhoto(plain, key)
    await expect(decryptPhoto(cipher, wrong)).rejects.toBeDefined()
  })

  it('rejects a payload shorter than nonce + auth tag', async () => {
    const key = await genGroupKey()
    await expect(decryptPhoto(new Uint8Array(8), key)).rejects.toThrow(/too short/i)
  })
})
