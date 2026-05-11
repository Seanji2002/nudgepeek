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
import {
  fetchOwnCryptoMaterial,
  fetchOwnGrant,
  writeGrant,
  writeOwnCryptoMaterial,
} from './api.js'

export type ProvisionResult =
  | { kind: 'ready'; groupKey: Uint8Array }
  | { kind: 'pending-approval' }
  | { kind: 'grant-missing' }

/**
 * Called right after a successful Supabase signin/signup while the password
 * is still in memory. Outcomes:
 *  - ready: group key unlocked, cached on disk
 *  - pending-approval: keypair is provisioned but the user isn't approved yet
 *  - grant-missing: user is approved but no vault grant exists (anomaly —
 *    typically caused by manually flipping `approved` via SQL)
 */
export async function provisionVaultOnSignin(
  password: string,
  userId: string,
): Promise<ProvisionResult> {
  const material = await fetchOwnCryptoMaterial(userId)

  if (!material.publicKey) {
    // First time on this account from the new app build — provision the keypair.
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

    if (material.isAdmin) {
      // Admin bootstrap: mint the group key and seal it to themselves.
      const groupKey = await genGroupKey()
      const sealed = await sealGroupKey(groupKey, publicKey)
      await writeGrant(userId, sealed, userId)
      await cacheGroupKey(groupKey)
      return { kind: 'ready', groupKey }
    }
    return { kind: 'pending-approval' }
  }

  // Keypair already provisioned. Decrypt private key, then try to load the grant.
  if (!material.encryptedPrivateKey || !material.privateKeyNonce || !material.kdfSalt) {
    throw new Error('Profile crypto material is partially missing — contact your admin.')
  }
  const kek = await deriveKEK(password, material.kdfSalt)
  const privateKey = await unwrapPrivateKey(
    material.encryptedPrivateKey,
    material.privateKeyNonce,
    kek,
  )
  const sealed = await fetchOwnGrant(userId)
  if (!sealed) {
    return material.approved ? { kind: 'grant-missing' } : { kind: 'pending-approval' }
  }
  const groupKey = await unsealGroupKey(sealed, material.publicKey, privateKey)
  await cacheGroupKey(groupKey)
  return { kind: 'ready', groupKey }
}

export async function loadGroupKeyFromCache(): Promise<Uint8Array | null> {
  const cached = await window.nudgeHistory.getVault()
  if (!cached || cached.length === 0) return null
  return cached
}

export async function cacheGroupKey(groupKey: Uint8Array): Promise<void> {
  await window.nudgeHistory.setVault(groupKey)
}

export async function clearLocalVault(): Promise<void> {
  await window.nudgeHistory.clearVault()
}
