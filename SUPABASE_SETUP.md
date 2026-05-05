# Supabase Setup

One-time setup for a NudgePeek backend. Do this before distributing the app to anyone.

---

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project.  
Copy your **Project URL** and **anon/public key** from **Settings → API** into a `.env` file:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5...
```

---

## 2. Create user accounts

Go to **Authentication → Users** in the Supabase dashboard and click **Add user**.  
Create one account per person (email + password). There is no in-app sign-up flow by design.

---

## 3. Run the schema SQL

Open **SQL Editor** in the dashboard and run the following:

```sql
-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  created_at    timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── photos ───────────────────────────────────────────────────────────────────
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);


-- ── RLS: profiles ────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Any authenticated user can read all profiles (needed to resolve sender names)
create policy "profiles: read by authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Users can only update their own profile
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);


-- ── RLS: photos ──────────────────────────────────────────────────────────────
alter table public.photos enable row level security;

-- Any authenticated user can read all photos
create policy "photos: read by authenticated"
  on public.photos for select
  using (auth.role() = 'authenticated');

-- Users can only insert photos where they are the sender
create policy "photos: insert own"
  on public.photos for insert
  with check (auth.uid() = sender_id);
```

---

## 4. Create the storage bucket

Go to **Storage** in the dashboard and create a new bucket named **`photos`**.

- **Public**: OFF (private bucket, access via signed URLs)
- Leave all other settings at defaults

Then add these RLS policies to the storage bucket objects (Storage → Policies → photos bucket):

```sql
-- Any authenticated user can read objects in the photos bucket
create policy "storage photos: read by authenticated"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
  );

-- Users can only upload to their own folder (sender_id/filename.jpg)
create policy "storage photos: insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## 5. Enable Realtime on the photos table

Go to **Database → Replication** (or **Table Editor → photos → Edit**) and enable **Realtime** on the `photos` table for **INSERT** events.

Or run in SQL Editor:

```sql
alter publication supabase_realtime add table public.photos;
```

---

## 6. Set display names for users (optional but recommended)

In the SQL Editor, update each user's display name so it shows correctly in the app:

```sql
update public.profiles
set display_name = 'Alice'
where id = 'paste-user-uuid-here';
```

You can find user UUIDs in **Authentication → Users**.

---

## Done

Once these steps are complete, distribute the built app with a `.env` file containing the project credentials, or bake the env vars into the build (see `README.md`).
