import _sodium from 'libsodium-wrappers'

type Sodium = typeof _sodium

let readyPromise: Promise<Sodium> | null = null

async function sodium(): Promise<Sodium> {
  if (!readyPromise) {
    readyPromise = _sodium.ready.then(() => _sodium)
  }
  return readyPromise
}

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export interface WrappedSecret {
  ciphertext: Uint8Array
  nonce: Uint8Array
}

export const SALT_BYTES = 16

export async function genSalt(): Promise<Uint8Array> {
  const s = await sodium()
  return s.randombytes_buf(SALT_BYTES)
}

export async function genGroupKey(): Promise<Uint8Array> {
  const s = await sodium()
  return s.randombytes_buf(s.crypto_secretbox_KEYBYTES)
}

export async function genKeypair(): Promise<KeyPair> {
  const s = await sodium()
  const kp = s.crypto_box_keypair()
  return { publicKey: kp.publicKey, privateKey: kp.privateKey }
}

export async function deriveKEK(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
}

export async function wrapPrivateKey(
  privateKey: Uint8Array,
  kek: Uint8Array,
): Promise<WrappedSecret> {
  const s = await sodium()
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const ciphertext = s.crypto_secretbox_easy(privateKey, nonce, kek)
  return { ciphertext, nonce }
}

export async function unwrapPrivateKey(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  kek: Uint8Array,
): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_secretbox_open_easy(ciphertext, nonce, kek)
}

export async function sealGroupKey(
  groupKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_box_seal(groupKey, recipientPublicKey)
}

export async function unsealGroupKey(
  sealed: Uint8Array,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_box_seal_open(sealed, publicKey, privateKey)
}

export async function encryptPhoto(plain: Uint8Array, groupKey: Uint8Array): Promise<Uint8Array> {
  const s = await sodium()
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const ciphertext = s.crypto_secretbox_easy(plain, nonce, groupKey)
  const payload = new Uint8Array(nonce.length + ciphertext.length)
  payload.set(nonce, 0)
  payload.set(ciphertext, nonce.length)
  return payload
}

export async function decryptPhoto(
  payload: Uint8Array,
  groupKey: Uint8Array,
): Promise<Uint8Array> {
  const s = await sodium()
  const n = s.crypto_secretbox_NONCEBYTES
  if (payload.length < n + s.crypto_secretbox_MACBYTES) {
    throw new Error('Ciphertext too short')
  }
  const nonce = payload.subarray(0, n)
  const ciphertext = payload.subarray(n)
  return s.crypto_secretbox_open_easy(ciphertext, nonce, groupKey)
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
