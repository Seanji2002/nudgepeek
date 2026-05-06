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

# 3. Create your .env file
cp .env.example .env
# Edit .env and fill in your Supabase URL and anon key

# 4. Set up Supabase (one-time)
# Follow SUPABASE_SETUP.md

# 5. Start the dev server
npm run dev
```

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

> **First-time setup:** before the first release works end-to-end, set these as repository secrets in GitHub (Settings → Secrets and variables → Actions):
> - `VITE_SUPABASE_URL`
> - `VITE_SUPABASE_ANON_KEY`
>
> Without these, CI will succeed but the released app will silently bundle a placeholder Supabase URL and auth/realtime won't work.

---

## Baking credentials into the build

The `.env` file is **not** bundled automatically. You have two options:

**Option A — ship a `.env` file alongside the installer (simplest)**  
Place a `.env` in the same directory as the installer and instruct users to put it next to the app. For most personal setups, this is fine.

**Option B — embed at build time**  
Create a `.env` with your credentials before running `npm run dist`. Vite will pick up the `VITE_*` variables and bake them into the renderer bundle. The values will be visible to anyone who inspects the JS, which is acceptable for a private personal app with a fixed group.

---

## User management

There is no in-app sign-up. Accounts are created manually in the Supabase dashboard:

1. Go to **Authentication → Users → Add user**
2. Enter email + password
3. Update the display name in the `profiles` table (see `SUPABASE_SETUP.md`)
4. Share the installer and credentials with that person directly

---

## Project structure

```
nudgepeek/
  electron.vite.config.ts   — Vite build config (main / preload / renderer)
  electron-builder.yml      — Packaging config for Windows + macOS
  resources/                — App icons (replace before distributing)
  scripts/
    create-placeholder-icons.js  — Generates dev placeholder PNGs
  src/
    main/                   — Electron main process
      index.ts              — Entry point, IPC wiring, app lifecycle
      tray.ts               — System tray
      windows/
        widget.ts           — Frameless floating widget window
        history.ts          — History / main window
      ipc.ts                — IPC channel constants + TypeScript types
      session.ts            — safeStorage-backed session persistence
      store.ts              — JSON prefs (widget position, etc.)
      notifications.ts      — OS notifications
      autoLaunch.ts         — Login item settings
    preload/
      widget.ts             — contextBridge API for widget renderer
      history.ts            — contextBridge API for history renderer
    renderer/
      shared/
        supabase.ts         — Supabase client
        api.ts              — uploadPhoto, listPhotos, downscaleImage
        types.ts            — Shared TypeScript types
      widget/               — Floating widget React app
      history/              — History window React app (login + feed + composer)
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Electron 31 |
| UI | React 18 + TypeScript + CSS Modules |
| Build | electron-vite + electron-builder |
| Backend | Supabase (Auth, Storage, Realtime, PostgreSQL) |
| State | Zustand |

---

## Known limitations / out of scope

- No photo deletion or editing
- No reactions or comments
- No public sign-up (by design — accounts are provisioned manually)
- No code signing (recipients may see a one-time OS security prompt)
- Auto-launch on Windows only works when running the installed version, not from source
