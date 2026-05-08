# NudgePeek

A lightweight, personal desktop app for intimate photo sharing between a small, fixed group of people — a couple, a close family, or a tight-knit friend group.

One person sends a photo; it silently appears on everyone else's desktop in a small floating window.

---

## How it works

- **Floating widget** — a small frameless window that stays on top of other windows, always visible. Draggable, hideable, auto-positions itself to the bottom-right of the screen.
- **System tray / menubar** — the app lives in the tray and never appears in the taskbar. Closing the widget doesn't quit the app.
- **Instant delivery** — backed by Supabase Realtime; photos arrive in under two seconds.
- **Photo history** — open the history window from the tray to see all past photos in reverse-chronological order.
- **Auto-launch** — starts silently on login so the widget is always there.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)

---

## Dev setup

```bash
# 1. Clone and install
git clone ...
cd nudgepeek
npm install

# 2. Generate placeholder icons (already done if you cloned a full copy)
npm run icons

# 3. Set up Supabase (one-time, see SUPABASE_SETUP.md)

# 4. Start the dev server
npm run dev
```

On first launch the app shows a **Connect your Supabase project** screen — paste your project URL and anon key from **Supabase → Settings → API**. They're saved encrypted in the OS keychain (`safeStorage`) so you only enter them once per machine.

If you'd rather not see that screen during development, copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Env vars are used as a fallback when nothing is stored. Stored config (entered via the in-app form) always wins over `.env`.

> **Windows note:** If you see `Error: Electron failed to install correctly` on first run, the
> Electron binary didn't download during `npm install` (a known intermittent issue). Fix it by
> deleting `node_modules/electron` and re-running `npm install`, or by running
> `node node_modules/electron/install.js` directly.

The app opens with:
- A system tray icon
- The history window (shown automatically on launch; re-open via right-click tray → **Open History**)
- The floating widget (hidden until you log in and receive a photo)

---

## Building distributable installers

```bash
# Build for the current OS
npm run dist

# Build specifically for Windows (NSIS installer)
npm run dist:win

# Build specifically for macOS (DMG)
npm run dist:mac
```

Output (the installer) is placed in `release/` (configured in `electron-builder.yml`).

> **Note on icons:** Before distributing, replace the placeholder files in `resources/` with production-quality icons:
> - `resources/icon.png` — 512×512 or 1024×1024 app icon (used for macOS DMG and Linux)
> - `resources/icon.ico` — Windows icon (ICO format with multiple sizes embedded)
> - `resources/trayTemplate.png` + `trayTemplate@2x.png` — 16×16 and 32×32 macOS template images (white, transparent background)

---

## Releases

Pre-built installers are published on the [GitHub Releases page](https://github.com/Seanji2002/nudgepeek/releases).

- **macOS** — download the `.dmg` (universal: works on Intel and Apple Silicon)
- **Windows** — download the `.exe` (NSIS installer, x64)
- **Linux** — download the `.AppImage`, then `chmod +x NudgePeek-*.AppImage` and run it. On Ubuntu 22.04+ you may need `sudo apt install libfuse2` first.

### macOS first-run

Builds are unsigned, so macOS shows: *"NudgePeek can't be opened because Apple cannot check it for malicious software."*

Workaround: right-click the app in Finder → **Open** → **Open**. You only need to do this once per install.

### Windows first-run

SmartScreen shows: *"Windows protected your PC."* Click **More info** → **Run anyway**. Once.

### Auto-updates

Once installed, NudgePeek checks GitHub Releases on each launch. When a newer version is published, it downloads in the background and installs the next time you quit the app.

---

## Cutting a release (maintainer only)

```bash
# from a clean working tree on main
npm version patch              # bumps package.json + creates a v-prefixed tag
git push && git push --tags
```

GitHub Actions runs the [release workflow](.github/workflows/release.yml) across macOS, Windows, and Linux runners and creates a **draft** GitHub release with all three installers attached. Review the draft, smoke-test an artifact, then click **Publish release** to make it visible — at which point installed clients will start auto-updating.

> **CI secrets are optional now.** The app prompts users to paste their own Supabase URL + anon key on first launch, so a released build doesn't need any creds baked in. If you *do* want a default to ship in the bundle (so users without a setup never see the form), set these as repository secrets in GitHub (Settings → Secrets and variables → Actions):
> - `VITE_SUPABASE_URL`
> - `VITE_SUPABASE_ANON_KEY`
>
> When set, they're used as a fallback. The user can still override by clicking **Use a different project** on the login screen.

---

## Configuring the Supabase project

Each install picks up its Supabase credentials at runtime:

1. **In-app form (default).** First launch shows a **Connect your Supabase project** screen. The user pastes the project URL and anon key from **Supabase → Settings → API**. Values are stored encrypted in the OS keychain via Electron's `safeStorage`. To switch to a different project later, click **Use a different project** on the login screen.
2. **`.env` fallback (optional).** If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present at build time (or in dev), they're used when nothing has been stored. Anything entered via the in-app form takes priority.

This means a single signed installer can be shared across groups — each group runs their own Supabase project and pastes their own credentials on first launch.

---

## Setting up a group

There is no in-app sign-up. One person hosts the Supabase project for the group; everyone else points their NudgePeek install at it.

**Host (one-time):**

1. Create a Supabase project (free tier is fine).
2. Run the schema in `SUPABASE_SETUP.md` (profiles, photos, comments, RLS, realtime, storage bucket).
3. In **Authentication → Users → Add user**, create one account per group member.
4. Update each member's display name in the `profiles` table.
5. Share the **Project URL**, **anon key**, and each person's email + password with the group.

**Each member:**

1. Install NudgePeek.
2. On first launch, paste the Project URL and anon key into the setup form.
3. Sign in with their own email + password.

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Electron 31 |
| UI | React 18 + TypeScript + CSS Modules |
| Build | electron-vite + electron-builder |
| Backend | Supabase (Auth, Storage, Realtime, PostgreSQL) |
| State | Zustand |
