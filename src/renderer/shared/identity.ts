// Supabase Auth rejects emails on reserved TLDs (.local, .invalid, etc.) so
// we use a real-looking subdomain. "Confirm email" is off in the auth config
// so nothing is ever actually sent to this address.
export const SYNTHETIC_EMAIL_DOMAIN = 'users.nudgepeek.app'

export function nameToSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

export function isValidName(raw: string): boolean {
  const slug = nameToSlug(raw)
  return slug.length >= 3 && slug.length <= 32 && /^[a-z]/.test(slug)
}

export function identifierToEmail(input: string): string {
  const trimmed = input.trim()
  if (trimmed.includes('@')) return trimmed
  return `${nameToSlug(trimmed)}@${SYNTHETIC_EMAIL_DOMAIN}`
}
