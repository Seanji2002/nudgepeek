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
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  approved      boolean not null default false,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
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

You can now sign in to NudgePeek with your email + password. The **Admin** button in the header opens the pending-approvals modal, where you'll approve or reject everyone else.

---

## 6. Useful operations

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

Once these steps are complete, share your **Project URL** + **anon key** with group members. They paste them into NudgePeek's first-launch setup screen, sign up with a name + password, and wait for you to approve them.
