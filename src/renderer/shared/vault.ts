import {
  deriveKEK,
  genGroupKey,
  genKeypair,
  genSalt,
  sealGroupKey,
  unsealGroupKey,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './crypto.js'
import { fetchAllOwnGrants, fetchOwnCryptoMaterial, writeOwnCryptoMaterial } from './api.js'

export interface UserKeypair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export type ProvisionResult =
  | { kind: 'ready'; keypair: UserKeypair }
  | { kind: 'error'; message: string }

/**
 * Called right after a successful Supabase signin/signup while the password
 * is still in memory. Provisions the user's keypair if missing, then returns
 * the unwrapped keypair so callers can fetch + unseal group keys.
 */
export async function provisionKeypairOnSignin(
  password: string,
  userId: string,
): Promise<ProvisionResult> {
  const material = await fetchOwnCryptoMaterial(userId)

  if (!material.publicKey) {
    // First-time on this account from this build — provision the keypair.
    const salt = await genSalt()
    const kek = await deriveKEK(password, salt)
    const { publicKey, privateKey } = await genKeypair()
    const wrapped = await wrapPrivateKey(privateKey, kek)
    await writeOwnCryptoMaterial(userId, {
      publicKey,
      encryptedPrivateKey: wrapped.ciphertext,
      privateKeyNonce: wrapped.nonce,
      kdfSalt: salt,
    })
    return { kind: 'ready', keypair: { publicKey, privateKey } }
  }

  if (!material.encryptedPrivateKey || !material.privateKeyNonce || !material.kdfSalt) {
    return { kind: 'error', message: 'Profile crypto material is partially missing.' }
  }
  const kek = await deriveKEK(password, material.kdfSalt)
  const privateKey = await unwrapPrivateKey(
    material.encryptedPrivateKey,
    material.privateKeyNonce,
    kek,
  )
  return { kind: 'ready', keypair: { publicKey: material.publicKey, privateKey } }
}

/**
 * Fetch every group key the user has been granted, unseal each with the
 * user's private key, and return as a Map keyed by group_id. Also writes
 * each key to the per-group on-disk cache.
 */
export async function loadAllGroupKeys(
  userId: string,
  keypair: UserKeypair,
): Promise<Map<string, Uint8Array>> {
  const grants = await fetchAllOwnGrants(userId)
  const out = new Map<string, Uint8Array>()
  for (const grant of grants) {
    try {
      const key = await unsealGroupKey(grant.sealedGroupKey, keypair.publicKey, keypair.privateKey)
      out.set(grant.groupId, key)
      await window.nudgeHistory.setGroupKey(grant.groupId, key)
    } catch (err) {
      console.error(`[vault] Failed to unseal group key for ${grant.groupId}:`, err)
    }
  }
  return out
}

/**
 * Generate a fresh 32-byte symmetric key for a brand-new group. The caller
 * seals it to their own public key and passes both to `createGroup` in api.ts.
 */
export async function mintNewGroupKey(): Promise<Uint8Array> {
  return genGroupKey()
}

export async function sealKeyForOwnPublicKey(
  groupKey: Uint8Array,
  ownPublicKey: Uint8Array,
): Promise<Uint8Array> {
  return sealGroupKey(groupKey, ownPublicKey)
}

export async function cacheGroupKey(groupId: string, key: Uint8Array): Promise<void> {
  await window.nudgeHistory.setGroupKey(groupId, key)
}

export async function loadGroupKeyFromCache(groupId: string): Promise<Uint8Array | null> {
  const cached = await window.nudgeHistory.getGroupKey(groupId)
  if (!cached || cached.length === 0) return null
  return cached
}

export async function clearAllLocalVaults(): Promise<void> {
  await window.nudgeHistory.clearAllVaults()
}
