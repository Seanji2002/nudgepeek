import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  deriveKEK,
  genGroupKey,
  genKeypair,
  genSalt,
  sealGroupKey,
  wrapPrivateKey,
} from './crypto.js'
import type { OwnCryptoMaterial } from './api.js'

vi.mock('./api.js', () => ({
  fetchOwnCryptoMaterial: vi.fn(),
  fetchOwnGrant: vi.fn(),
  vaultExists: vi.fn(),
  writeOwnCryptoMaterial: vi.fn(),
  writeGrant: vi.fn(),
}))

import * as api from './api.js'
import {
  cacheGroupKey,
  clearLocalVault,
  loadGroupKeyFromCache,
  provisionVaultOnSignin,
} from './vault.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const PASSWORD = 'hunter2'

// Pre-computed crypto material reused by every test that simulates an
// account whose keypair is already provisioned. Avoids re-running Argon2id
// per test.
interface Fixture {
  publicKey: Uint8Array
  privateKey: Uint8Array
  encryptedPrivateKey: Uint8Array
  privateKeyNonce: Uint8Array
  kdfSalt: Uint8Array
  groupKey: Uint8Array
  sealedGrant: Uint8Array
}
let fix: Fixture

beforeAll(async () => {
  const salt = await genSalt()
  const kek = await deriveKEK(PASSWORD, salt)
  const kp = await genKeypair()
  const wrapped = await wrapPrivateKey(kp.privateKey, kek)
  const groupKey = await genGroupKey()
  const sealedGrant = await sealGroupKey(groupKey, kp.publicKey)
  fix = {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    encryptedPrivateKey: wrapped.ciphertext,
    privateKeyNonce: wrapped.nonce,
    kdfSalt: salt,
    groupKey,
    sealedGrant,
  }
})

// Always-available window stub. Each test gets a fresh set of spies via
// resetVaultStubs() in beforeEach so we can assert call counts cleanly.
interface VaultStubs {
  getVault: Mock<() => Promise<Uint8Array | null>>
  setVault: Mock<(key: Uint8Array) => Promise<void>>
  clearVault: Mock<() => Promise<void>>
}

function resetVaultStubs(): VaultStubs {
  const stubs: VaultStubs = {
    getVault: vi.fn().mockResolvedValue(null),
    setVault: vi.fn().mockResolvedValue(undefined),
    clearVault: vi.fn().mockResolvedValue(undefined),
  }
  ;(globalThis as unknown as { window: { nudgeHistory: VaultStubs } }).window = {
    nudgeHistory: stubs,
  }
  return stubs
}

function emptyMaterial(over: Partial<OwnCryptoMaterial> = {}): OwnCryptoMaterial {
  return {
    publicKey: null,
    encryptedPrivateKey: null,
    privateKeyNonce: null,
    kdfSalt: null,
    isAdmin: false,
    approved: false,
    ...over,
  }
}

function existingMaterial(over: Partial<OwnCryptoMaterial> = {}): OwnCryptoMaterial {
  return {
    publicKey: fix.publicKey,
    encryptedPrivateKey: fix.encryptedPrivateKey,
    privateKeyNonce: fix.privateKeyNonce,
    kdfSalt: fix.kdfSalt,
    isAdmin: false,
    approved: false,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('provisionVaultOnSignin — fresh keypair', () => {
  it('first admin signin: provisions keypair, mints group key, caches', async () => {
    const stubs = resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      emptyMaterial({ isAdmin: true, approved: true }),
    )

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') throw new Error('unreachable')
    expect(result.groupKey.length).toBe(32)

    // Wrote a keypair to the profile.
    expect(api.writeOwnCryptoMaterial).toHaveBeenCalledTimes(1)
    const [writtenUserId, writtenMaterial] = (api.writeOwnCryptoMaterial as Mock).mock.calls[0]
    expect(writtenUserId).toBe(USER_ID)
    expect(writtenMaterial.publicKey.length).toBe(32)
    expect(writtenMaterial.encryptedPrivateKey.length).toBeGreaterThan(0)

    // Wrote a vault grant to themselves.
    expect(api.writeGrant).toHaveBeenCalledTimes(1)
    const [grantUser, , grantedBy] = (api.writeGrant as Mock).mock.calls[0]
    expect(grantUser).toBe(USER_ID)
    expect(grantedBy).toBe(USER_ID)

    // Cached on disk.
    expect(stubs.setVault).toHaveBeenCalledWith(result.groupKey)
  })

  it('first non-admin signin: provisions keypair, no grant, no cache', async () => {
    const stubs = resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      emptyMaterial({ isAdmin: false, approved: false }),
    )

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('pending-approval')
    expect(api.writeOwnCryptoMaterial).toHaveBeenCalledTimes(1)
    expect(api.writeGrant).not.toHaveBeenCalled()
    expect(stubs.setVault).not.toHaveBeenCalled()
  })
})

describe('provisionVaultOnSignin — existing keypair', () => {
  it('approved member with grant: unseals + caches', async () => {
    const stubs = resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      existingMaterial({ approved: true }),
    )
    ;(api.fetchOwnGrant as Mock).mockResolvedValue(fix.sealedGrant)

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') throw new Error('unreachable')
    // Unsealed group key matches the original.
    expect(Array.from(result.groupKey)).toEqual(Array.from(fix.groupKey))
    expect(stubs.setVault).toHaveBeenCalledWith(result.groupKey)
    expect(api.writeOwnCryptoMaterial).not.toHaveBeenCalled()
    expect(api.writeGrant).not.toHaveBeenCalled()
  })

  it('unapproved member without grant: pending-approval', async () => {
    resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(existingMaterial({ approved: false }))
    ;(api.fetchOwnGrant as Mock).mockResolvedValue(null)

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('pending-approval')
    expect(api.writeGrant).not.toHaveBeenCalled()
  })

  it('approved non-admin without grant: grant-missing', async () => {
    resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      existingMaterial({ approved: true, isAdmin: false }),
    )
    ;(api.fetchOwnGrant as Mock).mockResolvedValue(null)

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('grant-missing')
    expect(api.vaultExists).not.toHaveBeenCalled()
  })

  it('approved admin without grant + no vault anywhere: auto-mints (first-admin recovery)', async () => {
    const stubs = resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      existingMaterial({ approved: true, isAdmin: true }),
    )
    ;(api.fetchOwnGrant as Mock).mockResolvedValue(null)
    ;(api.vaultExists as Mock).mockResolvedValue(false)

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') throw new Error('unreachable')
    expect(result.groupKey.length).toBe(32)
    expect(api.writeGrant).toHaveBeenCalledTimes(1)
    const [grantUser, , grantedBy] = (api.writeGrant as Mock).mock.calls[0]
    expect(grantUser).toBe(USER_ID)
    expect(grantedBy).toBe(USER_ID)
    expect(stubs.setVault).toHaveBeenCalledWith(result.groupKey)
  })

  it('approved admin without grant + vault exists elsewhere: grant-missing', async () => {
    resetVaultStubs()
    ;(api.fetchOwnCryptoMaterial as Mock).mockResolvedValue(
      existingMaterial({ approved: true, isAdmin: true }),
    )
    ;(api.fetchOwnGrant as Mock).mockResolvedValue(null)
    ;(api.vaultExists as Mock).mockResolvedValue(true)

    const result = await provisionVaultOnSignin(PASSWORD, USER_ID)

    expect(result.kind).toBe('grant-missing')
    expect(api.writeGrant).not.toHaveBeenCalled()
  })
})

describe('cache helpers', () => {
  it('loadGroupKeyFromCache returns null when window.nudgeHistory.getVault returns null', async () => {
    resetVaultStubs()
    expect(await loadGroupKeyFromCache()).toBeNull()
  })

  it('loadGroupKeyFromCache returns null on empty buffer', async () => {
    const stubs = resetVaultStubs()
    stubs.getVault.mockResolvedValue(new Uint8Array(0))
    expect(await loadGroupKeyFromCache()).toBeNull()
  })

  it('loadGroupKeyFromCache returns the cached key', async () => {
    const stubs = resetVaultStubs()
    const key = new Uint8Array([1, 2, 3, 4])
    stubs.getVault.mockResolvedValue(key)
    expect(await loadGroupKeyFromCache()).toBe(key)
  })

  it('cacheGroupKey forwards to setVault', async () => {
    const stubs = resetVaultStubs()
    const key = new Uint8Array([9, 9, 9])
    await cacheGroupKey(key)
    expect(stubs.setVault).toHaveBeenCalledWith(key)
  })

  it('clearLocalVault forwards to clearVault', async () => {
    const stubs = resetVaultStubs()
    await clearLocalVault()
    expect(stubs.clearVault).toHaveBeenCalledTimes(1)
  })
})
