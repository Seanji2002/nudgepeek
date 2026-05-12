# NudgePeek

A lightweight, personal desktop app for intimate photo sharing between a small, fixed group of people — a couple, a close family, or a tight-knit friend group.

One person sends a photo; it silently appears on everyone else's desktop in a small floating window.

> Ready to install or run a group? See [`SETUP.md`](SETUP.md).

---

## How it works

- **Floating widget** — a small frameless window that stays on top of other windows, always visible. Draggable, hideable, auto-positions itself to the bottom-right of the screen.
- **System tray / menubar** — the app lives in the tray and never appears in the taskbar. Closing the widget doesn't quit the app.
- **Instant delivery** — backed by Supabase Realtime; photos arrive in under two seconds.
- **End-to-end encrypted photos** — every photo is encrypted on your machine before upload (see [Encryption](#encryption) below). The server only ever sees random bytes.
- **Photo history** — open the history window from the tray to see all past photos in reverse-chronological order, with inline comments under each photo.
- **Auto-launch** — starts silently on login so the widget is always there.

---

## Encryption

Photos are encrypted client-side before they ever leave your machine. A breach of the Supabase database and storage bucket yields random bytes, not images.

- **One shared group key** encrypts every photo (XChaCha20-Poly1305 from libsodium). Each photo is encrypted with a fresh nonce on your device and uploaded as opaque bytes; the server never sees a JPEG.
- **Each member has their own X25519 keypair.** The private key is encrypted with a key derived from your password (Argon2id) before it's stored, so only you can decrypt it.
- **Joining the group is a sealed handoff.** When the host approves you, their client seals the group key to your public key and writes a row to `vault_grants`. From that point you can decrypt every photo, including ones sent before you joined.
- **Local key cache.** After the first successful sign-in the unlocked group key is cached in your OS keychain (macOS Keychain / Windows DPAPI / Linux libsecret), so subsequent app launches don't need your password. Signing out clears it.
- **Comments and metadata are not encrypted.** Sender, timestamp, hidden-flag, and comment text are visible in the database — only photo content is encrypted.
- **Forgotten password = lost access.** Nobody — not the host, not Supabase — can recover your private key. The host deletes the account, you sign up again, and the host re-approves you. Past photos stay readable for every other member.

What an attacker who exfiltrated the entire Supabase project would have to do to read a single photo: brute-force one member's password through Argon2id (interactive cost), use the derived key to unwrap that member's private key, then unseal the group key from their `vault_grants` row. There is no shortcut on the server side.

---

## Contributing

Building from source, filing bugs, or sending pull requests? See [`CONTRIBUTING.md`](CONTRIBUTING.md).
