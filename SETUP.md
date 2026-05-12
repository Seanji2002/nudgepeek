# Setup

How to install NudgePeek, finish first launch, and set up a group.

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

Once installed, NudgePeek checks GitHub Releases on each launch. When a newer version is published you'll see a prompt — **Update now** downloads it, then **Install & Restart** swaps in the new version.

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
