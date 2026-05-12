// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { identifierToEmail, isValidName, nameToSlug, SYNTHETIC_EMAIL_DOMAIN } from './identity.js'

describe('nameToSlug', () => {
  it('lowercases and trims', () => {
    expect(nameToSlug('  Alice  ')).toBe('alice')
  })

  it('preserves a–z, 0–9, dot, underscore, hyphen', () => {
    expect(nameToSlug('a.b_c-1')).toBe('a.b_c-1')
  })

  it('replaces runs of non-allowed chars with a single dot', () => {
    expect(nameToSlug('alice smith!!')).toBe('alice.smith')
  })

  it('strips leading and trailing dots', () => {
    expect(nameToSlug('...alice...')).toBe('alice')
  })

  it('collapses spaces into a single dot', () => {
    expect(nameToSlug('first  last')).toBe('first.last')
  })
})

describe('isValidName', () => {
  it.each([
    ['alice', true],
    ['a-b-c', true],
    ['user_1', true],
    ['ali', true], // exactly 3 chars
    ['ab', false], // too short
    ['1alice', false], // doesn't start with a letter (slug starts with digit)
    ['---', false], // slug becomes empty
    ['', false],
    ['a'.repeat(33), false], // too long
    ['a'.repeat(32), true], // exactly max
  ])('returns %s for %p', (input, expected) => {
    expect(isValidName(input)).toBe(expected)
  })
})

describe('identifierToEmail', () => {
  it('passes through anything containing @ unchanged (modulo trimming)', () => {
    expect(identifierToEmail('  alice@example.com  ')).toBe('alice@example.com')
  })

  it('appends the synthetic domain to a plain name', () => {
    expect(identifierToEmail('Alice')).toBe(`alice@${SYNTHETIC_EMAIL_DOMAIN}`)
  })

  it('normalises a name to its slug before appending', () => {
    expect(identifierToEmail('Alice Smith!')).toBe(`alice.smith@${SYNTHETIC_EMAIL_DOMAIN}`)
  })
})
