# Supabase Setup

One-time setup for a NudgePeek backend. Do this before distributing the app to your group.

---

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project (the free tier is fine).

Copy your **Project URL** and **anon/public key** from **Settings → API** — you'll paste these into the app on first launch (or bake them into a `.env` file for development; see `CONTRIBUTING.md`).

---

## 2. Configure Auth settings

In **Authentication → Sign In / Providers → Email**:

- **Allow new users to sign up**: **on** (default).
- **Confirm email**: **off**.

NudgePeek lets group members sign up with just a name + password — internally it synthesises emails like `alice@nudgepeek.local` that can't receive mail, so confirmation links would dead-letter.

---

## 3. Enable the `pg_cron` extension

The auto-cleanup job in step 5 uses Postgres cron. Enable the extension once: **Database → Extensions → `pg_cron` → Enable**.

---

## 4. Run the schema

Open the **SQL Editor** and run the block below. It creates every table, function, RLS policy, realtime publication, and storage bucket the app needs.

```sql
-- ── profiles ────────────────────────────────────────────────────────────────
-- Per-user crypto material (public_key, encrypted_private_key, private_key_nonce,
-- kdf_salt) is populated on first sign-in from the app. See "Encryption" below.
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null default '',
  approved              boolean not null default false,
  is_admin              boolean not null default false,
  public_key            text,
  encrypted_private_key text,
  private_key_nonce     text,
  kdf_salt              text,
  created_at            timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is inserted.
-- New profiles default to approved=false, is_admin=false; an admin
-- approves them via the in-app Admin panel.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── photos ──────────────────────────────────────────────────────────────────
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null,
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ── comments ────────────────────────────────────────────────────────────────
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (length(btrim(body)) > 0 and length(body) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index comments_photo_id_created_at_idx
  on public.comments (photo_id, created_at);


-- ── vault_grants ────────────────────────────────────────────────────────────
-- A single shared group key encrypts every photo. Each approved member has a
-- row here with the group key sealed to their X25519 public key (libsodium
-- crypto_box_seal). An admin writes a member's row at approval time.
-- sealed_group_key is base64-encoded bytes (libsodium crypto_box_seal output).
create table public.vault_grants (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  sealed_group_key text not null,
  granted_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now()
);


-- ── helpers ─────────────────────────────────────────────────────────────────
-- Security-definer helper so RLS policies can ask "is the caller an admin?"
-- without recursing through profile RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Reject = delete the auth user. Cascades through FKs to drop the profile
-- (and any photos / comments). Refuses on already-approved users so a
-- misclick can't wipe a real member; remove approved members via the
-- Supabase dashboard instead.
create or replace function public.reject_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject users';
  end if;
  if exists (select 1 from public.profiles where id = target_id and approved) then
    raise exception 'Cannot reject an already-approved user. Use the Supabase dashboard.';
  end if;
  delete from auth.users where id = target_id;
end;
$$;

grant execute on function public.reject_user(uuid) to authenticated;

-- Daily cleanup: drop photos (and their files + cascading comments) older
-- than 3 days. Runs as the function owner so it can bypass RLS.
create or replace function public.delete_old_photos()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  old_paths text[];
begin
  select array_agg(storage_path) into old_paths
  from public.photos
  where created_at < now() - interval '3 days';

  if old_paths is null or array_length(old_paths, 1) = 0 then
    return;
  end if;

  delete from storage.objects
  where bucket_id = 'photos' and name = any(old_paths);

  delete from public.photos
  where created_at < now() - interval '3 days';
end;
$$;


-- ── RLS: profiles ───────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Any authenticated user can read all profiles (used to resolve display names).
create policy "profiles: read by authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Users upsert their own profile on first sign-in.
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Users update their own profile (e.g. display_name).
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins update any profile — used to flip approved = true.
create policy "profiles: admin update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());


-- ── RLS: photos ─────────────────────────────────────────────────────────────
alter table public.photos enable row level security;

-- Any approved user can read all photos.
create policy "photos: read by approved"
  on public.photos for select
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );

-- Approved users can insert photos where they are the sender.
create policy "photos: insert own"
  on public.photos for insert
  with check (
    auth.uid() = sender_id
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );


-- ── RLS: comments ───────────────────────────────────────────────────────────
alter table public.comments enable row level security;

create policy "comments: read by approved"
  on public.comments for select
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );

create policy "comments: insert own"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );

create policy "comments: update own"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "comments: delete own"
  on public.comments for delete
  using (auth.uid() = user_id);


-- ── RLS: vault_grants ───────────────────────────────────────────────────────
alter table public.vault_grants enable row level security;

-- Members read only their own grant.
create policy "vault_grants: read own"
  on public.vault_grants for select
  using (auth.uid() = user_id);

-- Admins write grants for any user (used at approval time).
create policy "vault_grants: admin insert"
  on public.vault_grants for insert
  with check (public.is_admin());

create policy "vault_grants: admin update"
  on public.vault_grants for update
  using (public.is_admin())
  with check (public.is_admin());


-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.photos;
alter publication supabase_realtime add table public.comments;


-- ── Storage bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "storage photos: read by approved"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );

-- Users upload only into their own folder (sender_id/filename.jpg).
create policy "storage photos: insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles where id = auth.uid() and approved)
  );


-- ── Cron: daily cleanup at 03:15 UTC ────────────────────────────────────────
select cron.schedule(
  'delete-old-photos',
  '15 3 * * *',
  $$ select public.delete_old_photos(); $$
);
```

That single block is the entire backend. No follow-up migrations needed.

---

## 5. Bootstrap your host account

NudgePeek's signup flow puts new accounts in a **pending** state. You need at least one approved admin before anyone else can be approved — that's you.

1. **Authentication → Users → Add user** in the dashboard. Pick any email + password (a real one is fine; you'll keep using it). Click **Create user**.
2. The trigger from step 4 auto-created a profile row for you. Find your UUID with:

   ```sql
   select id, email from auth.users;
   ```

3. Approve yourself and grant admin in one go:

   ```sql
   update public.profiles
   set approved = true, is_admin = true, display_name = 'Your Name'
   where id = '<your-user-uuid>';
   ```

You can now sign in to NudgePeek with your email + password. On first sign-in the app will generate your encryption keypair and mint the group key for the vault. The **Admin** button in the header opens the pending-approvals modal, where you'll approve or reject everyone else.

---

## 6. Encryption

Photos are encrypted client-side before upload: a single shared **group key** encrypts every photo (XChaCha20-Poly1305 from libsodium), and each member's copy of the group key is sealed to their X25519 public key in `vault_grants`. A leaked database or storage bucket reveals only random bytes.

**Bootstrap order matters:**

1. The admin signs in first. The app sees `public_key IS NULL`, generates a keypair (private key encrypted with Argon2id-derived key from the admin's password), mints a 32-byte group key, and seals it to the admin's own public key.
2. Each member signs in next. The app generates their keypair the same way and writes `public_key` to their `profiles` row — but they cannot decrypt photos yet.
3. The admin approves each pending member from the Admin panel. Approval now also seals the group key to the member's public key and writes a `vault_grants` row.
4. Members sign in again (or refresh) and can decrypt photos from now on.

**Migrating an existing NudgePeek deployment to encrypted photos:** apply the schema diff in section 4, then run the wipe-and-reset below in the SQL editor. Existing photos cannot be re-encrypted retroactively (no one has the original plaintext).

```sql
-- Wipe all photos (they're plaintext and will be rejected by the new build).
delete from storage.objects where bucket_id = 'photos';
delete from public.photos;

-- Un-approve every non-admin. They'll re-appear in the Admin panel and
-- you re-approve them — at which point the new build seals the group
-- key to each member.
update public.profiles set approved = false where not is_admin;

-- Optional: clear any pre-existing crypto fields if you ran an earlier
-- experiment. Fresh deployments can skip this.
update public.profiles
  set public_key = null,
      encrypted_private_key = null,
      private_key_nonce = null,
      kdf_salt = null;
delete from public.vault_grants;
```

After the SQL: install the new app build on the admin's machine → sign in → admin is bootstrapped. Then each member updates the app → signs in → admin re-approves them from the Admin panel.

**Recovery if a member forgets their password:** they cannot recover their private key. The admin must delete the member's auth user via the dashboard; the member re-signs up and the admin re-approves them. Past photos remain decryptable for every other member.

---

## 7. Useful operations

```sql
-- Run the auto-cleanup right now (handy for verifying it works):
select public.delete_old_photos();

-- See scheduled cron jobs and their last runs:
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;

-- Stop the cleanup schedule:
select cron.unschedule('delete-old-photos');

-- Change the retention window: drop and recreate delete_old_photos() with
-- a different `interval` literal (e.g. `interval '7 days'`), then re-run
-- the cron.schedule call — pg_cron replaces the existing job.

-- Rename a member (e.g. dashboard-created users default to the email
-- local-part; self-signup users keep the name they typed):
update public.profiles set display_name = 'Alice' where id = '<uuid>';

-- See pending signups:
select id, display_name, created_at from public.profiles where not approved;

-- Permanently remove an approved member (rejects can be done in-app, but
-- already-approved members must be deleted from the dashboard or here):
delete from auth.users where id = '<uuid>';
```

---

## 8. Full reset (nuke everything)

When you want to start over inside the **same** Supabase project — drop every NudgePeek table, function, policy, storage object, cron job, and auth user — do these two steps in order. After they finish, re-run the schema block from section 4 and re-bootstrap the host account from section 5.

> **This destroys all data.** Every photo, comment, profile, vault grant, and login is gone. There is no undo. Don't run this against a production project unless that is exactly what you want.

### Step 1 — Empty + delete the `photos` bucket from the dashboard

Supabase blocks direct SQL deletes on `storage.objects` and `storage.buckets` (its `protect_delete` trigger is owned by `supabase_storage_admin`, which the SQL editor isn't a member of). The dashboard goes through the Storage API and works without ceremony.

1. Open your Supabase project → **Storage** → click the **`photos`** bucket.
2. **Select all** objects (checkbox at top of the list) → **⋯ → Delete**. Confirm.
3. Go back to the buckets list → next to **`photos`**, click **⋯ → Delete bucket**. Confirm.

If the bucket doesn't exist yet (fresh project, schema never run), skip this step.

### Step 2 — Run the SQL block

Paste this into the SQL editor. It drops the cron job, the app's tables (cascading their RLS policies, indexes, triggers, and realtime publication entries), the helper functions, and every auth user.

```sql
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  FULL RESET — drops every NudgePeek object in this project (db side).   │
-- │  Prereq: bucket already emptied/deleted via the dashboard (step 1).     │
-- │  After running, re-run section 4 (schema) and section 5 (bootstrap).    │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 1. Stop the cleanup cron so it can't fire mid-wipe. Wrapped in DO so the
--    statement succeeds even if the job was never scheduled.
do $$
begin
  perform cron.unschedule('delete-old-photos');
exception when others then null;
end $$;

-- 2. Drop the storage bucket's RLS policies. (The bucket itself is gone via
--    the dashboard in step 1; these are leftover policies on storage.objects.)
drop policy if exists "storage photos: read by approved"   on storage.objects;
drop policy if exists "storage photos: insert own folder"  on storage.objects;

-- 3. Drop the app's tables. CASCADE drops their RLS policies, indexes,
--    triggers, and removes them from realtime publications.
drop table if exists public.vault_grants cascade;
drop table if exists public.comments     cascade;
drop table if exists public.photos       cascade;
drop table if exists public.profiles     cascade;

-- 4. Drop helper functions and the auto-profile trigger.
drop function if exists public.handle_new_user()    cascade;
drop function if exists public.is_admin()           cascade;
drop function if exists public.reject_user(uuid)    cascade;
drop function if exists public.delete_old_photos()  cascade;

-- 5. Delete every auth user. The SQL editor's role can touch auth.users.
delete from auth.users;
```

After the reset:

1. Re-run the full SQL block in **section 4** to recreate the schema (it `INSERT … ON CONFLICT DO NOTHING`s the `photos` bucket back into existence).
2. Re-do the host bootstrap from **section 5** (create your admin in Authentication → Users, then flip `approved = true, is_admin = true` for that row).
3. Open the app and sign in as the admin — first sign-in will mint a fresh keypair and group key.

Existing app installs still have a cached vault key in their OS keychain pointing at the old group key. They'll get a confusing "decryption failed" on next launch. Have each member sign out from the tray (which calls `clearVault` on the main process) before signing back in, or just delete `vault.enc` from the app's user-data directory manually.

---

Once these steps are complete, share your **Project URL** + **anon key** with group members. They paste them into NudgePeek's first-launch setup screen, sign up with a name + password, and wait for you to approve them.
