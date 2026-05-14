# Setup

How to install NudgePeek, finish first launch, and set up a group.

---

## Install

Pre-built installers are on the [GitHub Releases page](https://github.com/Seanji2002/nudgepeek/releases).

- **macOS** — download the `.dmg` (universal: works on Intel and Apple Silicon)
- **Windows** — download the `.exe` (NSIS installer, x64)
- **Linux** — download the `.AppImage`, then `chmod +x NudgePeek-*.AppImage` and run it. On Ubuntu 22.04+ you may need `sudo apt install libfuse2` first.

### macOS first-run

Builds aren't issued by an identified Apple developer, so macOS Gatekeeper shows: _"NudgePeek can't be opened because it is from an unidentified developer."_

To allow it once:

1. Open **System Settings** → **Privacy & Security**.
2. Scroll to the bottom — you'll see _"NudgePeek was blocked from use because it is not from an identified developer."_
3. Click **Open Anyway**, then confirm in the next dialog.

From that point on, NudgePeek launches like any other app on every future double-click. You only need to do this once per install.

### Windows first-run

SmartScreen shows: _"Windows protected your PC."_ Click **More info** → **Run anyway**. Once.

### Auto-updates

Once installed, NudgePeek checks GitHub Releases on each launch. When a newer version is published you'll see a prompt — **Update now** downloads it, then **Install & Restart** swaps in the new version.

---

## First launch

1. NudgePeek shows a **Connect your Supabase project** screen.
2. Paste the **Project URL** and **anon key** that the host sent you.
3. **Sign up** with a name and password — no email needed.
4. After signing in, you'll see a **Join the conversation** screen with two options: **Create a group** or **Join with a code**.

Credentials are stored encrypted in the OS keychain, so you only enter them once per machine. To switch to a different Supabase project later, click **Use a different project** on the login screen.

Photos and comments older than **3 days** are deleted automatically.

---

## Setting up a group

A single Supabase project can host **many groups**. Each group has its own end-to-end encryption key, its own members, and its own invite code. You can create or join as many groups as you want from inside the app.

**Host (one-time, per Supabase project):**

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Follow [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) to create the schema, RLS policies, storage bucket, and daily auto-cleanup job.
3. Share the **Project URL** and **anon key** with anyone who'll be running the app.

**Creating a group:**

1. Open NudgePeek, paste the Project URL + anon key, sign up.
2. Pick **Create a group** on the welcome screen, give it a name, and an invite code is auto-generated (e.g. `MOON-7F2A`).
3. You become the group's **owner**. The invite code is visible from the group dropdown in the top-right header — click the clipboard icon to copy, or **Rotate invite code** to regenerate.

**Joining a group:**

1. Get an invite code from a group owner or admin.
2. Open NudgePeek, sign up (or sign in).
3. Pick **Join with a code** and paste the code.
4. The owner or an admin sees a pending request in their **Admin** panel and approves you. After approval, photos and comments for that group decrypt automatically.

**Managing a group (owner / admin):**

- The **Admin** button in the header appears when you're an owner or admin of the currently-active group.
- Owners can promote any member to admin (or demote them back), reject pending join requests, and rotate the invite code at any time.
- Admins can approve or reject pending join requests; they can't promote/demote others or change the invite code.
