# NudgePeek

A lightweight, personal desktop app for intimate photo sharing between a small, fixed group of people — a couple, a close family, or a tight-knit friend group.

One person sends a photo; it silently appears on everyone else's desktop in a small floating window.

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

## Install

Pre-built installers are on the [GitHub Releases page](https://github.com/Seanji2002/nudgepeek/releases).

- **macOS** — download the `.dmg` (universal: works on Intel and Apple Silicon)
- **Windows** — download the `.exe` (NSIS installer, x64)
- **Linux** — download the `.AppImage`, then `chmod +x NudgePeek-*.AppImage` and run it. On Ubuntu 22.04+ you may need `sudo apt install libfuse2` first.

### macOS first-run

Builds are unsigned, so macOS shows: _"NudgePeek can't be opened because Apple cannot check it for malicious software."_

Workaround: right-click the app in Finder → **Open** → **Open**. You only need to do this once per install.

### Windows first-run

SmartScreen shows: _"Windows protected your PC."_ Click **More info** → **Run anyway**. Once.

### Auto-updates

Once installed, NudgePeek checks GitHub Releases on each launch. When a newer version is published, it downloads in the background and installs the next time you quit the app.

---

## First launch

1. NudgePeek shows a **Connect your Supabase project** screen.
2. Paste the **Project URL** and **anon key** that the host of your group sent you.
3. On the next screen, **Sign up** with a name and password — no email needed. Then wait for the host to approve your account; once approved, sign in with the same name and password.

Credentials are stored encrypted in the OS keychain, so you only enter them once per machine. To switch to a different project later, click **Use a different project** on the login screen.

Photos and comments older than **3 days** are deleted automatically.

---

## Setting up a group

One person — the **host** — runs a free Supabase project for the group. Everyone else points NudgePeek at it and signs up from inside the app.

**Host (one-time):**

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Follow [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) to create the schema, RLS policies, storage bucket, daily auto-cleanup job, and bootstrap your own admin account.
3. Share the **Project URL** and **anon key** with the group.

**Each member:**

1. Install NudgePeek.
2. Paste the Project URL and anon key on first launch.
3. Click **Sign up** and pick a name + password.
4. The host approves them from the in-app **Admin** button. After that, they sign in normally.

---

## Contributing

Building from source, filing bugs, or sending pull requests? See [`CONTRIBUTING.md`](CONTRIBUTING.md).
