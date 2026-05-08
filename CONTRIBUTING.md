# Contributing

Notes for developers working on NudgePeek.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- A [Supabase](https://supabase.com) project for testing (free tier is sufficient)

---

## Dev setup

```bash
# 1. Clone and install
git clone https://github.com/Seanji2002/nudgepeek
cd nudgepeek
npm install

# 2. Generate placeholder icons (already done if you cloned a full copy)
npm run icons

# 3. Set up Supabase (one-time, see SUPABASE_SETUP.md)

# 4. Start the dev server
npm run dev
```

On first launch the app shows a **Connect your Supabase project** screen — paste your project URL and anon key from **Supabase → Settings → API**. They're saved encrypted in the OS keychain (`safeStorage`) so you only enter them once per machine.

If you'd rather skip that screen during development, copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Env vars are used as a fallback when nothing is stored. Stored config (entered via the in-app form) always wins over `.env`.

> **Windows note:** If you see `Error: Electron failed to install correctly` on first run, the
> Electron binary didn't download during `npm install` (a known intermittent issue). Fix it by
> deleting `node_modules/electron` and re-running `npm install`, or by running
> `node node_modules/electron/install.js` directly.

The app opens with:

- A system tray icon
- The history window (shown automatically on launch; re-open via right-click tray → **Open History**)
- The floating widget (hidden until you log in and receive a photo)

---

## Code checks

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run format         # prettier --write .
npm run format:check   # prettier --check .
```

CI runs typecheck + lint + format:check on every push. Run them locally before pushing.

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
>
> - `resources/icon.png` — 512×512 or 1024×1024 app icon (used for macOS DMG and Linux)
> - `resources/icon.ico` — Windows icon (ICO format with multiple sizes embedded)
> - `resources/trayTemplate.png` + `trayTemplate@2x.png` — 16×16 and 32×32 macOS template images (white, transparent background)

---

## Cutting a release (maintainer only)

```bash
# from a clean working tree on main
npm version patch              # bumps package.json + creates a v-prefixed tag
git push && git push --tags
```

GitHub Actions runs the [release workflow](.github/workflows/release.yml) across macOS, Windows, and Linux runners and creates a **draft** GitHub release with all three installers attached. Review the draft, smoke-test an artifact, then click **Publish release** to make it visible — at which point installed clients will start auto-updating.

> **CI secrets are optional.** The app prompts users to paste their own Supabase URL + anon key on first launch, so a released build doesn't need any creds baked in. If you _do_ want a default to ship in the bundle (so users without a setup never see the form), set these as repository secrets in GitHub (Settings → Secrets and variables → Actions):
>
> - `VITE_SUPABASE_URL`
> - `VITE_SUPABASE_ANON_KEY`
>
> When set, they're used as a fallback. The user can still override by clicking **Use a different project** on the login screen.

---

## Tech stack

| Layer   | Choice                                      |
| ------- | ------------------------------------------- |
| Desktop | Electron 31                                 |
| UI      | React 18 + TypeScript + CSS Modules         |
| Build   | electron-vite + electron-builder            |
| Backend | Supabase (Auth, Storage, Realtime, Postgres) |
| State   | Zustand                                     |
