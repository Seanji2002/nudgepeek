# Supabase Setup

One-time setup for a NudgePeek backend. Do this before distributing the app.

A single Supabase project can host **many groups**. A user signs up once, then creates or joins as many groups as they want from inside the app. Each group has its own end-to-end encryption key — leaking one group's data doesn't leak any other group's.

---

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project (the free tier is fine).

Copy your **Project URL** and **anon/public key** from **Settings → API** — you'll paste these into the app on first launch (or bake them into a `.env` file for development; see `CONTRIBUTING.md`).

---

## 2. Configure Auth settings

In **Authentication → Sign In / Providers → Email**:

- **Allow new users to sign up**: **on** (default).
- **Confirm email**: **off**.

NudgePeek lets users sign up with just a name + password — internally it synthesises emails like `alice@users.nudgepeek.app` that can't receive mail, so confirmation links would dead-letter. (Older builds used `@nudgepeek.local`; Supabase Auth now rejects reserved TLDs, so we use a real-looking subdomain instead.)

---

## 3. Enable the `pg_cron` extension

The auto-cleanup job in step 4 uses Postgres cron. Enable the extension once: **Database → Extensions → `pg_cron` → Enable**.

---

## 4. Run the schema

Open the **SQL Editor** and run the block below. It creates every table, function, RLS policy, realtime publication, and storage bucket the app needs.

```sql
-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per signed-up user. Holds per-user crypto material (X25519 keypair).
-- A profile is project-wide; group membership lives in `group_members`.
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null default '',
  public_key            text,
  encrypted_private_key text,
  private_key_nonce     text,
  kdf_salt              text,
  created_at            timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is inserted.
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


-- ── groups ──────────────────────────────────────────────────────────────────
-- One row per group. invite_code is a short shareable string; the owner can
-- rotate it via regenerate_invite_code(). Group creator is the owner.
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (char_length(invite_code) between 4 and 32),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index groups_invite_code_idx on public.groups (invite_code);


-- ── group_members ───────────────────────────────────────────────────────────
-- One row per (user, group) tying a user to a group with a role and approval
-- state. A pending join request is a row with approved=false.
create type public.group_role as enum ('owner', 'admin', 'member');

create table public.group_members (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  group_id   uuid not null references public.groups(id)   on delete cascade,
  role       public.group_role not null default 'member',
  approved   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
create index group_members_group_approved_idx
  on public.group_members (group_id, approved);


-- ── photos ──────────────────────────────────────────────────────────────────
-- group_id scopes every photo to exactly one group. storage_path layout is
-- `{group_id}/{sender_id}/{uuid}.bin`; storage RLS parses the first segment
-- to enforce group isolation at the bucket level too.
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid not null references public.groups(id)   on delete cascade,
  storage_path  text not null,
  hidden        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index photos_group_created_at_idx
  on public.photos (group_id, created_at desc);


-- ── comments ────────────────────────────────────────────────────────────────
-- No group_id column; a comment inherits its group via photos.group_id.
-- RLS does the join.
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
-- One row per (user, group) holding that group's symmetric key sealed to the
-- member's X25519 public key (libsodium crypto_box_seal). Owner/admin writes
-- a member's row at approval time via approve_group_member().
create table public.vault_grants (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  group_id         uuid not null references public.groups(id)   on delete cascade,
  sealed_group_key text not null,
  granted_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  primary key (user_id, group_id)
);


-- ── photo_reads ─────────────────────────────────────────────────────────────
-- Per-user "I've seen this photo" marker. Cascading FK on photo_id means the
-- daily cleanup cron sweeps these too.
create table public.photo_reads (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  photo_id  uuid not null references public.photos(id)   on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (user_id, photo_id)
);

-- Auto-mark the sender's own photo as read on insert.
create or replace function public.auto_ack_own_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.photo_reads (user_id, photo_id)
  values (new.sender_id, new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger photos_auto_ack
  after insert on public.photos
  for each row execute procedure public.auto_ack_own_photo();


-- ── helpers ─────────────────────────────────────────────────────────────────
-- security definer to avoid recursing through group_members RLS.
create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
     where user_id = auth.uid() and group_id = p_group and approved
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;

create or replace function public.is_group_admin(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
     where user_id = auth.uid() and group_id = p_group
       and approved and role in ('owner','admin')
  );
$$;

grant execute on function public.is_group_admin(uuid) to authenticated;

create or replace function public.is_group_owner(p_group uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
     where user_id = auth.uid() and group_id = p_group
       and approved and role = 'owner'
  );
$$;

grant execute on function public.is_group_owner(uuid) to authenticated;


-- ── RPCs ────────────────────────────────────────────────────────────────────

-- Create a new group. Caller becomes the owner; the client mints a fresh
-- symmetric group key, seals it to themselves, and passes the sealed bytes.
create or replace function public.create_group(
  p_name        text,
  p_invite_code text,
  p_sealed_self text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if char_length(p_name) < 1 or char_length(p_name) > 60 then
    raise exception 'Group name must be 1-60 characters';
  end if;
  if char_length(p_invite_code) < 4 or char_length(p_invite_code) > 32 then
    raise exception 'Invite code must be 4-32 characters';
  end if;

  insert into public.groups (name, invite_code, created_by)
       values (p_name, p_invite_code, auth.uid())
    returning id into v_group_id;

  insert into public.group_members (user_id, group_id, role, approved)
       values (auth.uid(), v_group_id, 'owner', true);

  insert into public.vault_grants (user_id, group_id, sealed_group_key, granted_by)
       values (auth.uid(), v_group_id, p_sealed_self, auth.uid());

  return v_group_id;
end;
$$;

grant execute on function public.create_group(text, text, text) to authenticated;


-- Request to join a group via its invite code. Inserts a pending
-- group_members row; owner/admin sees it and approves via the app.
create or replace function public.join_group_by_code(p_code text)
returns table (group_id uuid, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select * into v_group from public.groups where invite_code = p_code;
  if not found then
    raise exception 'Invite code not found';
  end if;

  insert into public.group_members (user_id, group_id, role, approved)
       values (auth.uid(), v_group.id, 'member', false)
  on conflict (user_id, group_id) do nothing;

  return query select v_group.id, v_group.name;
end;
$$;

grant execute on function public.join_group_by_code(text) to authenticated;


-- Approve a pending member. Caller must be owner/admin of the group. The
-- client has already sealed the group key to the new member's public key.
create or replace function public.approve_group_member(
  p_group             uuid,
  p_user              uuid,
  p_sealed_group_key  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Only group owner/admin can approve members';
  end if;

  insert into public.vault_grants (user_id, group_id, sealed_group_key, granted_by)
       values (p_user, p_group, p_sealed_group_key, auth.uid())
  on conflict (user_id, group_id) do update
       set sealed_group_key = excluded.sealed_group_key,
           granted_by       = excluded.granted_by;

  update public.group_members
     set approved = true
   where user_id = p_user and group_id = p_group;
end;
$$;

grant execute on function public.approve_group_member(uuid, uuid, text) to authenticated;


-- Reject a pending (not-yet-approved) member. Drops the group_members row.
create or replace function public.reject_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Only group owner/admin can reject members';
  end if;
  delete from public.group_members
   where user_id = p_user and group_id = p_group and not approved;
end;
$$;

grant execute on function public.reject_group_member(uuid, uuid) to authenticated;


-- Owner-only: promote an approved member to admin.
create or replace function public.promote_group_admin(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group) then
    raise exception 'Only group owner can promote admins';
  end if;
  update public.group_members
     set role = 'admin'
   where user_id = p_user and group_id = p_group and approved and role = 'member';
end;
$$;

grant execute on function public.promote_group_admin(uuid, uuid) to authenticated;


-- Owner-only: demote an admin back to member.
create or replace function public.demote_group_admin(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group) then
    raise exception 'Only group owner can demote admins';
  end if;
  update public.group_members
     set role = 'member'
   where user_id = p_user and group_id = p_group and approved and role = 'admin';
end;
$$;

grant execute on function public.demote_group_admin(uuid, uuid) to authenticated;


-- Owner-only: rotate the invite code. Past joiners are unaffected; new
-- joiners with the old code get rejected.
create or replace function public.regenerate_invite_code(p_group uuid, p_new_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group) then
    raise exception 'Only group owner can regenerate invite code';
  end if;
  if char_length(p_new_code) < 4 or char_length(p_new_code) > 32 then
    raise exception 'Invite code must be 4-32 characters';
  end if;
  update public.groups set invite_code = p_new_code where id = p_group;
end;
$$;

grant execute on function public.regenerate_invite_code(uuid, text) to authenticated;


-- Return the caller's unread photos (oldest first) across ALL groups they're
-- a member of, joined with sender + group display info. security invoker so
-- the photos RLS does the per-group filtering implicitly.
create or replace function public.list_unread_photos(p_limit int default 50)
returns table (
  id           uuid,
  sender_id    uuid,
  group_id     uuid,
  storage_path text,
  hidden       boolean,
  created_at   timestamptz,
  sender_name  text,
  group_name   text
)
language sql
security invoker
stable
set search_path = public
as $$
  select p.id, p.sender_id, p.group_id, p.storage_path, p.hidden, p.created_at,
         coalesce(pr.display_name, 'Unknown') as sender_name,
         coalesce(g.name, '')                 as group_name
    from public.photos   p
    left join public.profiles pr on pr.id = p.sender_id
    left join public.groups   g  on g.id  = p.group_id
   where not exists (
     select 1 from public.photo_reads r
      where r.photo_id = p.id and r.user_id = auth.uid()
   )
   order by p.created_at asc
   limit p_limit;
$$;

grant execute on function public.list_unread_photos(int) to authenticated;


-- Daily cleanup: drop photos (and their files + cascading comments + reads)
-- older than 3 days. Runs as the function owner so it can bypass RLS.
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

create policy "profiles: read by authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);


-- ── RLS: groups ─────────────────────────────────────────────────────────────
alter table public.groups enable row level security;

-- Members can read the groups they belong to.
create policy "groups: read by member"
  on public.groups for select
  using (public.is_group_member(id));

-- Writes only via RPCs (create_group, regenerate_invite_code). No direct
-- insert/update/delete policy — RPCs are SECURITY DEFINER and bypass RLS.


-- ── RLS: group_members ──────────────────────────────────────────────────────
alter table public.group_members enable row level security;

-- Own rows always readable.
create policy "group_members: read own"
  on public.group_members for select
  using (user_id = auth.uid());

-- Owner/admin can read every row in their group (for the admin panel).
create policy "group_members: read by admin"
  on public.group_members for select
  using (public.is_group_admin(group_id));

-- Writes only via RPCs.


-- ── RLS: photos ─────────────────────────────────────────────────────────────
alter table public.photos enable row level security;

create policy "photos: read by group member"
  on public.photos for select
  using (public.is_group_member(group_id));

create policy "photos: insert own group"
  on public.photos for insert
  with check (
    auth.uid() = sender_id
    and public.is_group_member(group_id)
  );


-- ── RLS: comments ───────────────────────────────────────────────────────────
alter table public.comments enable row level security;

create policy "comments: read by group member"
  on public.comments for select
  using (
    exists (
      select 1 from public.photos p
       where p.id = comments.photo_id
         and public.is_group_member(p.group_id)
    )
  );

create policy "comments: insert own"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.photos p
       where p.id = comments.photo_id
         and public.is_group_member(p.group_id)
    )
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

-- Members read only their own grants (one per group).
create policy "vault_grants: read own"
  on public.vault_grants for select
  using (auth.uid() = user_id);

-- Writes only via RPCs (create_group, approve_group_member).


-- ── RLS: photo_reads ────────────────────────────────────────────────────────
alter table public.photo_reads enable row level security;

create policy "photo_reads: read own"
  on public.photo_reads for select
  using (auth.uid() = user_id);

create policy "photo_reads: insert own"
  on public.photo_reads for insert
  with check (auth.uid() = user_id);


-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.photos;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.group_members;


-- ── Storage bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Path layout: {group_id}/{sender_id}/{uuid}.bin
-- Storage RLS parses the first folder segment as the group id and the
-- second as the sender id.
create policy "storage photos: read by group member"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

create policy "storage photos: insert own group folder"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
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

## 5. First launch

Unlike the old single-group setup, **no SQL bootstrap is required**. There's no project-wide admin to flag. You just:

1. Open the app, paste your Project URL + anon key into the setup screen.
2. Sign up with a name + password. The app generates your X25519 keypair on first sign-in and writes it to `profiles`.
3. The empty-state screen offers **Create a group** or **Join a group**. Pick **Create**, give it a name — you're the owner.
4. Copy the invite code shown in the group menu and share it out-of-band (text, Signal, in person) with anyone you want to add.
5. They open the app, sign up, click **Join a group**, paste the code → they appear as a pending request in your admin panel.
6. Approve them. The app seals the group key to their public key behind the scenes; they can decrypt photos from then on.

You can repeat steps 3–6 to create more groups. Each group has its own independent encryption key.

---

## 6. Encryption

Photos are encrypted client-side before upload. Each **group** has its own 32-byte symmetric key (XChaCha20-Poly1305 from libsodium) which encrypts every photo posted to that group. Each approved member has their own copy of every group key they belong to, sealed to their X25519 public key (libsodium `crypto_box_seal`) and stored in `vault_grants`. A leaked database or storage bucket reveals only random bytes.

**Bootstrap order per group:**

1. **Group creation**. The creator's app mints a fresh 32-byte key, seals it to their own public key, and calls `create_group` — which atomically inserts the `groups` row, the `group_members` row (`owner`, approved), and the creator's own `vault_grants` row. The creator now has the key locally.
2. **Join request**. A signed-up user pastes the invite code; the app calls `join_group_by_code` which inserts a pending `group_members` row (`approved=false`). No key access yet.
3. **Approval**. The owner or an admin's app pulls the pending user's `public_key`, seals the group's symmetric key to it, and calls `approve_group_member`, which writes the new `vault_grants` row and flips `approved=true`.
4. **Decrypt**. On next refresh the approved user's app fetches their `vault_grants` row for the group, unseals it with their own private key, and caches the resulting symmetric key on disk (in a per-group `vault.enc` file wrapped with the OS keychain).

**Recovery if a member forgets their password**: they cannot recover their private key. The owner/admin deletes the member's auth user via the Supabase dashboard; the member re-signs up and the owner/admin re-approves them per group. Past photos remain decryptable for every other member.

**Removing a member**: deleting the member's auth user revokes their access to fetch new sealed keys, but the key for any group they were in is unchanged. If you need to genuinely rotate the key after a member leaves, you must currently re-create the group (cheap) — there is no in-place key rotation in this release.

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

-- Rename a member (dashboard-created users default to the email local-part;
-- self-signup users keep the name they typed):
update public.profiles set display_name = 'Alice' where id = '<uuid>';

-- See all groups and their owners:
select g.id, g.name, g.invite_code, p.display_name as owner_name, g.created_at
  from public.groups g
  join public.profiles p on p.id = g.created_by
 order by g.created_at desc;

-- See pending join requests for every group:
select g.name as group_name, p.display_name as user_name, gm.created_at
  from public.group_members gm
  join public.groups   g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
 where not gm.approved
 order by gm.created_at desc;

-- Permanently delete a group (cascades to its photos, comments, reads, grants):
delete from public.groups where id = '<group-uuid>';

-- Permanently remove a user (cascades to their profile, group memberships,
-- grants, photos, etc.):
delete from auth.users where id = '<user-uuid>';
```

---

## 8. Full reset (nuke everything)

When you want to start over inside the **same** Supabase project, run the two steps below. After they finish, re-run the schema block from section 4. The app's first-launch flow will take care of group creation from there.

> **This destroys all data.** Every photo, comment, profile, group, vault grant, and login is gone. There is no undo.

### Step 1 — Empty + delete the `photos` bucket from the dashboard

Supabase blocks direct SQL deletes on `storage.objects` and `storage.buckets`. The dashboard goes through the Storage API and works without ceremony.

1. Open your Supabase project → **Storage** → click the **`photos`** bucket.
2. **Select all** objects (checkbox at top of the list) → **⋯ → Delete**. Confirm.
3. Go back to the buckets list → next to **`photos`**, click **⋯ → Delete bucket**. Confirm.

If the bucket doesn't exist yet (fresh project, schema never run), skip this step.

### Step 2 — Run the SQL block

```sql
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  FULL RESET — drops every NudgePeek object in this project (db side).   │
-- │  Prereq: bucket already emptied/deleted via the dashboard (step 1).     │
-- │  After running, re-run section 4 (schema).                              │
-- └─────────────────────────────────────────────────────────────────────────┘

-- 1. Stop the cleanup cron so it can't fire mid-wipe.
do $$
begin
  perform cron.unschedule('delete-old-photos');
exception when others then null;
end $$;

-- 2. Drop the storage bucket's leftover policies.
drop policy if exists "storage photos: read by group member"     on storage.objects;
drop policy if exists "storage photos: insert own group folder"  on storage.objects;

-- 3. Drop tables. CASCADE drops their RLS policies, indexes, triggers,
--    and removes them from realtime publications.
drop table if exists public.photo_reads    cascade;
drop table if exists public.vault_grants   cascade;
drop table if exists public.comments       cascade;
drop table if exists public.photos         cascade;
drop table if exists public.group_members  cascade;
drop table if exists public.groups         cascade;
drop table if exists public.profiles       cascade;

-- 4. Drop the enum type used by group_members.role.
drop type if exists public.group_role;

-- 5. Drop helper functions and the auto-profile trigger.
drop function if exists public.handle_new_user()                    cascade;
drop function if exists public.is_group_member(uuid)                cascade;
drop function if exists public.is_group_admin(uuid)                 cascade;
drop function if exists public.is_group_owner(uuid)                 cascade;
drop function if exists public.create_group(text, text, text)       cascade;
drop function if exists public.join_group_by_code(text)             cascade;
drop function if exists public.approve_group_member(uuid, uuid, text) cascade;
drop function if exists public.reject_group_member(uuid, uuid)      cascade;
drop function if exists public.promote_group_admin(uuid, uuid)      cascade;
drop function if exists public.demote_group_admin(uuid, uuid)       cascade;
drop function if exists public.regenerate_invite_code(uuid, text)   cascade;
drop function if exists public.list_unread_photos(int)              cascade;
drop function if exists public.auto_ack_own_photo()                 cascade;
drop function if exists public.delete_old_photos()                  cascade;

-- 6. Delete every auth user. The SQL editor's role can touch auth.users.
delete from auth.users;
```

After the reset:

1. Re-run the full SQL block in **section 4** to recreate the schema.
2. Open the app and sign in — first sign-in will mint a fresh keypair, and the empty-state screen will let you create a new group.

Existing app installs still have cached per-group keys in `{userData}/vaults/`. Sign out from the tray (which clears them) before signing back in, or delete the `vaults/` directory manually.

---

Once these steps are complete, share your **Project URL** + **anon key** with anyone who'll be running the app. They paste them into NudgePeek's first-launch setup screen, sign up, and either create a group of their own or paste an invite code you've shared with them.
