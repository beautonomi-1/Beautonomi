-- CI-only prelude for a bare `supabase/postgres` image.
--
-- Hosted Supabase provisions these objects through the Auth (GoTrue) and Storage
-- services; the bare image ships only a legacy auth schema and no storage tables.
-- Everything here is the standard upstream definition — no application logic.
-- Never run this against a hosted project.

-- auth.jwt() / auth.uid() / auth.role() as provided by GoTrue.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- Columns GoTrue has added to auth.users since the legacy schema in the image.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists phone_confirmed_at timestamptz;
alter table auth.users add column if not exists phone_change text default '';
alter table auth.users add column if not exists phone_change_token varchar(255) default '';
alter table auth.users add column if not exists phone_change_sent_at timestamptz;
alter table auth.users add column if not exists email_change_token_new varchar(255);
alter table auth.users add column if not exists email_change_token_current varchar(255) default '';
alter table auth.users add column if not exists email_change_confirm_status smallint default 0;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists reauthentication_token varchar(255) default '';
alter table auth.users add column if not exists reauthentication_sent_at timestamptz;
alter table auth.users add column if not exists is_sso_user boolean not null default false;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists is_anonymous boolean not null default false;

create table if not exists auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data->>'email')) stored,
  id uuid primary key default gen_random_uuid(),
  unique (provider_id, provider)
);

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  factor_id uuid,
  not_after timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  tag text
);

-- Storage schema objects referenced by RLS policies in migrations.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $$;
create or replace function storage.filename(name text) returns text language plpgsql as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[array_length(_parts,1)]; end $$;
create or replace function storage.extension(name text) returns text language plpgsql as $$
declare _parts text[]; _filename text; begin select string_to_array(name, '/') into _parts; select _parts[array_length(_parts,1)] into _filename; return reverse(split_part(reverse(_filename), '.', 1)); end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
