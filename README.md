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

Output (the installer) is placed in `releases/` (configured in `electron-builder.yml`).

> **Note on icons:** Before distributing, replace the placeholder files in `resources/` with production-quality icons:
> - `resources/icon.png` — 512×512 or 1024×1024 app icon (used for macOS DMG and Linux)
> - `resources/icon.ico` — Windows icon (ICO format with multiple sizes embedded)
> - `resources/trayTemplate.png` + `trayTemplate@2x.png` — 16×16 and 32×32 macOS template images (white, transparent background)
>
> On macOS, Electron will show a Gatekeeper warning the first time unsigned apps run. Tell recipients: right-click → Open → Open to bypass it once.

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
