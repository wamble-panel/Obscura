-- ============================================================================
-- OBSCURA STUDIO — internal management system
-- Full database schema for Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- HOW TO USE
--   1. Open your Supabase project -> SQL Editor -> New query
--   2. Paste this entire file and press RUN
--   3. That's it. Re-running is safe (every statement is idempotent).
--
-- WHAT IT CREATES
--   * profiles + role/permission system (admin & team members)
--   * clients, sessions (orders), gear, rentals, projects, deliveries
--   * finance ledger, team members, payroll
--   * audit log (every insert/update/delete on every table, automatically)
--   * live presence (who is logged in right now)
--   * row level security on everything, driven by permissions
--   * a keep-alive table so the free Supabase project never goes idle
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. HELPERS
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- 2. IDENTITY: profiles, roles, permissions
-- ============================================================================

create table if not exists public.roles (
  key          text primary key,
  label        text not null,
  description  text,
  rank         int  not null default 100,   -- lower = more powerful
  is_system    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.permissions (
  key          text primary key,            -- e.g. 'orders.create'
  module       text not null,               -- e.g. 'orders'
  label        text not null,
  description  text,
  sort         int not null default 100
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  phone         text,
  avatar_url    text,
  role_key      text not null default 'viewer' references public.roles(key),
  is_active     boolean not null default false,
  title         text,                        -- job title shown in Team
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists profiles_role_idx on public.profiles(role_key);
create index if not exists profiles_email_idx on public.profiles(lower(email));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Account state. `is_active` stays the single gate every policy checks; `status`
-- is what the UI shows and is what an admin actually sets.
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspended_by uuid;

do $$ begin
  alter table public.profiles
    add constraint profiles_status_check
    check (status in ('active', 'pending', 'suspended'));
exception when duplicate_object then null; end $$;

-- Existing rows predate `status`, so derive it once from is_active.
update public.profiles
   set status = case when is_active then 'active' else 'pending' end
 where status is null or (is_active and status <> 'active');

-- Keep the two in step whichever one is written, so a suspension takes effect
-- everywhere immediately — including row level security.
create or replace function public.sync_profile_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Callers may set either field; an explicit is_active wins over the
    -- 'pending' default so the first-admin bootstrap keeps working.
    if new.status = 'active' or new.is_active then
      new.status := 'active';
      new.is_active := true;
    else
      new.is_active := false;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.is_active := (new.status = 'active');
  elsif new.is_active is distinct from old.is_active then
    new.status := case when new.is_active then 'active'
                       when old.status = 'suspended' then 'suspended'
                       else 'pending' end;
  end if;

  if new.status = 'suspended' and old.status <> 'suspended' then
    new.suspended_at := now();
  elsif new.status <> 'suspended' then
    new.suspended_at := null;
    new.suspended_reason := null;
    new.suspended_by := null;
  end if;

  return new;
end $$;

drop trigger if exists profiles_sync_status on public.profiles;
create trigger profiles_sync_status before insert or update on public.profiles
  for each row execute function public.sync_profile_status();

-- People may edit their own name, phone and avatar — but nothing that decides
-- what they are allowed to do. Row level security can't restrict individual
-- columns, so this guards them directly.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager boolean;
begin
  if new.role_key is not distinct from old.role_key
     and new.is_active is not distinct from old.is_active
     and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce((
    select p.is_active and (
      p.role_key = 'admin'
      or exists (select 1 from public.user_permissions up
                  where up.user_id = p.id and up.permission_key = 'users.manage' and up.granted)
      or exists (select 1 from public.role_permissions rp
                  where rp.role_key = p.role_key and rp.permission_key = 'users.manage')
    )
    from public.profiles p where p.id = auth.uid()
  ), false) into v_manager;

  -- A signed-in user without users.manage silently keeps their old privileges.
  -- (auth.uid() is null for the signup trigger and other server-side work.)
  if auth.uid() is not null and not v_manager then
    new.role_key  := old.role_key;
    new.is_active := old.is_active;
    new.status    := old.status;
  end if;

  return new;
end $$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Per-user permission overrides (grant = true adds, grant = false revokes)
create table if not exists public.user_permissions (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted        boolean not null default true,
  created_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Permission resolution (SECURITY DEFINER so RLS never recurses)
-- ---------------------------------------------------------------------------

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select is_active and role_key = 'admin' from public.profiles where id = auth.uid()
  ), false);
$$;

-- The single source of truth for "can this user do X".
create or replace function public.has_perm(perm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  prof   public.profiles;
  ovr    boolean;
begin
  select * into prof from public.profiles where id = auth.uid();
  if prof is null or not prof.is_active then
    return false;
  end if;

  -- explicit per-user override always wins
  select granted into ovr
    from public.user_permissions
   where user_id = prof.id and permission_key = perm;
  if found then
    return ovr;
  end if;

  -- admins implicitly hold every permission
  if prof.role_key = 'admin' then
    return true;
  end if;

  return exists (
    select 1 from public.role_permissions
     where role_key = prof.role_key and permission_key = perm
  );
end $$;

-- Everything the signed-in user is allowed to do, as a flat array.
create or replace function public.my_permissions()
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  prof  public.profiles;
  keys  text[];
begin
  select * into prof from public.profiles where id = auth.uid();
  if prof is null or not prof.is_active then
    return array[]::text[];
  end if;

  if prof.role_key = 'admin' then
    select array_agg(key) into keys from public.permissions;
  else
    select array_agg(permission_key) into keys
      from public.role_permissions where role_key = prof.role_key;
  end if;
  keys := coalesce(keys, array[]::text[]);

  -- apply overrides
  select coalesce(array_agg(distinct k), array[]::text[]) into keys from (
    select unnest(keys) as k
    union
    select permission_key from public.user_permissions where user_id = prof.id and granted
  ) t
  where k not in (
    select permission_key from public.user_permissions where user_id = prof.id and not granted
  );

  return keys;
end $$;

-- ============================================================================
-- 3. AUDIT LOG
-- ============================================================================

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  actor_name    text,
  action        text not null,         -- insert | update | delete | auth.login | auth.logout | ...
  entity        text not null,         -- table name or logical area
  entity_id     text,
  entity_label  text,                  -- human readable ("Zeina Cosmetics — 2 Aug")
  summary       text,                  -- one line description
  changed_keys  text[],
  old_data      jsonb,
  new_data      jsonb,
  severity      text not null default 'info',   -- info | warning | critical
  ip            text,
  user_agent    text,
  path          text
);

create index if not exists audit_log_created_idx  on public.audit_log(created_at desc);
create index if not exists audit_log_actor_idx    on public.audit_log(actor_id);
create index if not exists audit_log_entity_idx   on public.audit_log(entity, entity_id);
create index if not exists audit_log_action_idx   on public.audit_log(action);

-- A best-effort human label for any row we audit.
create or replace function public.audit_label(rec jsonb)
returns text language sql immutable as $$
  select coalesce(
    rec->>'name', rec->>'client_name', rec->>'title', rec->>'label',
    rec->>'full_name', rec->>'email', rec->>'code', rec->>'key', rec->>'id'::text
  );
$$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_keys     text[];
  v_actor    public.profiles;
  v_action   text;
  v_id       text;
begin
  select * into v_actor from public.profiles where id = auth.uid();

  if (tg_op = 'INSERT') then
    v_new := to_jsonb(new); v_action := 'insert';
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_action := 'update';
    select coalesce(array_agg(key), array[]::text[]) into v_keys
      from jsonb_each(v_new) as n(key, value)
     where v_old->key is distinct from n.value
       and key not in ('updated_at');
    if array_length(v_keys, 1) is null then
      return coalesce(new, old);   -- nothing meaningful changed
    end if;
  else
    v_old := to_jsonb(old); v_action := 'delete';
  end if;

  v_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'key', v_old->>'key');

  insert into public.audit_log(
    actor_id, actor_email, actor_name, action, entity, entity_id,
    entity_label, changed_keys, old_data, new_data, severity
  ) values (
    auth.uid(),
    v_actor.email,
    v_actor.full_name,
    v_action,
    tg_table_name,
    v_id,
    public.audit_label(coalesce(v_new, v_old)),
    v_keys,
    v_old,
    v_new,
    case when tg_op = 'DELETE' then 'warning' else 'info' end
  );

  return coalesce(new, old);
end $$;

-- Attach the audit trigger to a table in one call.
create or replace function public.attach_audit(tbl regclass)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists zz_audit on %s', tbl);
  execute format(
    'create trigger zz_audit after insert or update or delete on %s
       for each row execute function public.audit_trigger()', tbl);
end $$;

-- App-level events (logins, exports, failed access...) written from the app.
create or replace function public.log_event(
  p_action   text,
  p_entity   text default 'app',
  p_entity_id text default null,
  p_summary  text default null,
  p_severity text default 'info',
  p_path     text default null,
  p_ip       text default null,
  p_user_agent text default null,
  p_meta     jsonb default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles;
  v_id    bigint;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  insert into public.audit_log(
    actor_id, actor_email, actor_name, action, entity, entity_id,
    summary, severity, path, ip, user_agent, new_data
  ) values (
    auth.uid(), v_actor.email, v_actor.full_name, p_action, p_entity, p_entity_id,
    p_summary, coalesce(p_severity, 'info'), p_path, p_ip, p_user_agent, p_meta
  ) returning id into v_id;
  return v_id;
end $$;

-- ============================================================================
-- 4. PRESENCE — who is logged in right now
-- ============================================================================

create table if not exists public.user_presence (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  online_since timestamptz not null default now(),
  current_path text,
  ip           text,
  user_agent   text,
  device       text
);

create index if not exists user_presence_seen_idx on public.user_presence(last_seen_at desc);

-- Heartbeat called by the client every ~45s.
create or replace function public.touch_presence(
  p_path text default null,
  p_user_agent text default null,
  p_ip text default null,
  p_device text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;

  insert into public.user_presence as up (user_id, last_seen_at, online_since, current_path, user_agent, ip, device)
  values (auth.uid(), now(), now(), p_path, p_user_agent, p_ip, p_device)
  on conflict (user_id) do update set
    last_seen_at = now(),
    current_path = coalesce(excluded.current_path, up.current_path),
    user_agent   = coalesce(excluded.user_agent, up.user_agent),
    ip           = coalesce(excluded.ip, up.ip),
    device       = coalesce(excluded.device, up.device),
    -- a gap of more than 5 minutes counts as a new online stretch
    online_since = case when up.last_seen_at < now() - interval '5 minutes'
                        then now() else up.online_since end;
end $$;

-- Everyone on the team + whether they are online (admins / audit viewers only).
create or replace function public.presence_board()
returns table (
  user_id uuid, email text, full_name text, role_key text, is_active boolean,
  last_seen_at timestamptz, online_since timestamptz, current_path text,
  device text, ip text, is_online boolean, last_login_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.role_key, p.is_active,
         up.last_seen_at, up.online_since, up.current_path, up.device, up.ip,
         coalesce(up.last_seen_at > now() - interval '2 minutes', false) as is_online,
         p.last_login_at
    from public.profiles p
    left join public.user_presence up on up.user_id = p.id
   where public.has_perm('audit.view') or public.is_admin()
   order by coalesce(up.last_seen_at, 'epoch'::timestamptz) desc;
$$;

-- ============================================================================
-- 5. SETTINGS + KEEP-ALIVE
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.app_settings(key, value) values
  ('studio', jsonb_build_object(
      'name', 'Obscura Studio',
      'branch', 'Mokattam Branch',
      'currency', 'EGP',
      'usd_rate', 48,
      'open_hour', 0,
      'close_hour', 24,
      'auto_invoice', true,
      'timezone', 'Africa/Cairo',
      'phone', '01033447399',
      'instagram', '@obscura_house_')),

  -- The studio's own Terms & Conditions, kept as data so they can be edited in
  -- Settings without a deploy. Rendered as real text on the public /terms page
  -- and referenced from every invoice, rather than living in a flat image.
  -- Live exchange rates, refreshed by /api/fx (Vercel Cron) or the Refresh
  -- button in Settings. Each rate is EGP for one unit, so 'USD': 48 means one
  -- dollar costs forty-eight pounds. Seeded with something sane so an invoice
  -- is never blank before the first refresh lands.
  ('fx', jsonb_build_object(
      'rates', jsonb_build_object('EGP', 1, 'USD', 48, 'EUR', 52),
      'fetched_at', null,
      'source', 'default')),

  ('terms', jsonb_build_object(
      'heading', 'Terms & Conditions',
      'agree_line', 'By booking a session at OBSCURA you agree to these terms.',
      'badges', jsonb_build_array('No smoking', 'No pets', 'No alcohol'),
      'invoice_line', 'Booking is subject to the Obscura Terms & Conditions.',
      'sections', jsonb_build_array(
        jsonb_build_object('title', 'Booking & Time', 'items', jsonb_build_array(
          'Your booking starts and ends **exactly as scheduled** — hair, makeup, styling and prep all count within your time.',
          '**Setup and teardown** must fit inside your booking duration.',
          'The studio must be **vacated by the agreed end time**.',
          'Extra time is subject to **availability** and charged separately.')),
        jsonb_build_object('title', 'Studio Care', 'items', jsonb_build_array(
          'Nothing may be hung, taped or stuck on the **cyclorama walls** without approval from studio management.',
          'Damage to the cyclorama or studio property (marks, dents, tears) is **charged at repair cost**.',
          'A minimum **EGP 100 cleaning fee** applies if the studio is left excessively dirty.')),
        jsonb_build_object('title', 'Payment & Cancellation', 'items', jsonb_build_array(
          'A **reservation fee** is required to confirm every booking.',
          'The reservation fee is **non-refundable** for cancellations made **48 hours or less** before the session.',
          'Rescheduling is subject to studio availability.')),
        jsonb_build_object('title', 'House Rules', 'items', jsonb_build_array(
          '**No smoking, no pets, no alcohol or drugs** anywhere on the premises.',
          'Music must stay at **reasonable levels**.',
          'The person who books is **responsible for their team and guests**.')))
      )),
  ('pricing', jsonb_build_object(
      'hourly_rate', 300,
      'hourly_min_hours', 2,
      'half_day_price', 1200,
      'half_day_hours', 5,
      'full_day_price', 2500,
      'full_day_hours', 10,
      'deposit_pct', 50))
on conflict (key) do nothing;

-- Written to once a day by the cron job so Supabase never marks the project idle.
create table if not exists public.keepalive (
  id         int primary key default 1,
  pinged_at  timestamptz not null default now(),
  hits       bigint not null default 0,
  source     text,
  constraint keepalive_singleton check (id = 1)
);
insert into public.keepalive(id) values (1) on conflict (id) do nothing;

create or replace function public.ping_keepalive(p_source text default 'cron')
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_at timestamptz;
begin
  update public.keepalive
     set pinged_at = now(), hits = hits + 1, source = p_source
   where id = 1
  returning pinged_at into v_at;
  return v_at;
end $$;

grant execute on function public.ping_keepalive(text) to anon, authenticated, service_role;

-- ============================================================================
-- 6. BUSINESS TABLES
-- ============================================================================

-- ---- clients ---------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  phone       text,
  email       text,
  notes       text,
  is_archived boolean not null default false,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clients_name_idx on public.clients(lower(name));
drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- ---- gear / inventory ------------------------------------------------------
do $$ begin
  create type public.gear_status as enum ('in', 'out', 'maint');
exception when duplicate_object then null; end $$;

create table if not exists public.gear (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'Accessories',
  note        text,
  qty         int  not null default 1 check (qty >= 0),
  rate        numeric(12,2) not null default 0 check (rate >= 0),
  status      public.gear_status not null default 'in',
  serial      text,
  image_url   text,
  is_archived boolean not null default false,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gear_category_idx on public.gear(category);
create index if not exists gear_status_idx on public.gear(status);
drop trigger if exists gear_updated_at on public.gear;
create trigger gear_updated_at before update on public.gear
  for each row execute function public.set_updated_at();

-- ---- sessions (studio orders) ---------------------------------------------
do $$ begin
  create type public.session_package as enum ('hourly', 'half', 'full');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create sequence if not exists public.session_code_seq start 1001;

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default ('OB-' || nextval('public.session_code_seq')),
  client_id     uuid references public.clients(id) on delete set null,
  client_name   text not null,
  phone         text,
  shoot_type    text not null default 'product',        -- product | fashion | food | auto | other
  date          date not null,
  start_hour    int  not null default 11 check (start_hour between 0 and 23),
  package       public.session_package not null default 'half',
  hours         int  not null default 5 check (hours between 1 and 24),
  base_amount   numeric(12,2) not null default 0,
  addons_amount numeric(12,2) not null default 0,
  total_amount  numeric(12,2) not null default 0,
  deposit_paid  boolean not null default false,
  deposit_amount numeric(12,2) not null default 0,
  status        public.session_status not null default 'pending',
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sessions_date_idx on public.sessions(date);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_client_idx on public.sessions(client_id);
drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

create table if not exists public.session_addons (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  gear_id    uuid references public.gear(id) on delete set null,
  name       text not null,
  price      numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists session_addons_session_idx on public.session_addons(session_id);

-- Multi-day bookings. A single-day session has end_date = date, which is what
-- every existing row becomes, so nothing changes for them.
alter table public.sessions add column if not exists end_date date;
update public.sessions set end_date = date where end_date is null;

do $$ begin
  alter table public.sessions alter column end_date set not null;
exception when others then null; end $$;

do $$ begin
  alter table public.sessions
    add constraint sessions_end_after_start check (end_date >= date);
exception when duplicate_object then null; end $$;

create index if not exists sessions_range_idx on public.sessions(date, end_date);

/**
 * Double booking guard, over date ranges.
 *
 * Two single-day bookings only clash if they share a day AND their hours
 * overlap. A booking that spans several days takes the studio for all of them —
 * that is what a client is buying — so any date-range intersection with a
 * multi-day booking is a clash, whatever the hours say.
 */
create or replace function public.check_session_overlap()
returns trigger language plpgsql as $$
declare
  v_conflict text;
  v_multi    boolean;
begin
  if new.status = 'cancelled' then return new; end if;
  v_multi := new.end_date > new.date;

  select s.code into v_conflict from public.sessions s
   where s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and s.status <> 'cancelled'
     -- the two date ranges touch at all
     and new.date <= s.end_date
     and s.date <= new.end_date
     and (
       v_multi
       or s.end_date > s.date
       or (new.start_hour < s.start_hour + s.hours
           and s.start_hour < new.start_hour + new.hours)
     )
   limit 1;

  if v_conflict is not null then
    raise exception 'The studio is already booked in that time range (%).', v_conflict
      using errcode = 'unique_violation';
  end if;
  return new;
end $$;

-- Postgres fires same-timing triggers in name order, so these are named to run
-- price first, then the overlap guard (which needs the corrected hours).
drop trigger if exists sessions_no_overlap on public.sessions;
drop trigger if exists sessions_t2_no_overlap on public.sessions;
create trigger sessions_t2_no_overlap before insert or update on public.sessions
  for each row execute function public.check_session_overlap();

-- What a session costs is decided here, from the studio's own rate card — never
-- from whatever the browser submitted.
create or replace function public.price_session()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p jsonb;
  v_days int;
begin
  select value into p from public.app_settings where key = 'pricing';
  if p is null then return new; end if;

  -- Missing means a single day. Backwards is a mistake worth surfacing: quietly
  -- collapsing it to one day would invoice for one day when several were meant.
  new.end_date := coalesce(new.end_date, new.date);
  if new.end_date < new.date then
    raise exception 'The last day cannot be before the first day.'
      using errcode = 'check_violation';
  end if;

  v_days := (new.end_date - new.date) + 1;

  if v_days > 1 then
    -- Several days is sold as full days: one day rate per day, and the daily
    -- window is the full-day length.
    new.package     := 'full';
    new.hours       := coalesce((p->>'full_day_hours')::int, 10);
    new.base_amount := v_days * coalesce((p->>'full_day_price')::numeric, 2500);
  elsif new.package = 'half' then
    new.hours       := coalesce((p->>'half_day_hours')::int, 5);
    new.base_amount := coalesce((p->>'half_day_price')::numeric, 1200);
  elsif new.package = 'full' then
    new.hours       := coalesce((p->>'full_day_hours')::int, 10);
    new.base_amount := coalesce((p->>'full_day_price')::numeric, 2500);
  else
    new.hours       := greatest(new.hours, coalesce((p->>'hourly_min_hours')::int, 2));
    new.base_amount := new.hours * coalesce((p->>'hourly_rate')::numeric, 300);
  end if;

  new.addons_amount  := greatest(coalesce(new.addons_amount, 0), 0);
  new.total_amount   := new.base_amount + new.addons_amount;
  new.deposit_amount := round(new.total_amount * coalesce((p->>'deposit_pct')::numeric, 50) / 100);

  return new;
end $$;

drop trigger if exists sessions_price on public.sessions;
drop trigger if exists sessions_t1_price on public.sessions;
create trigger sessions_t1_price before insert or update on public.sessions
  for each row execute function public.price_session();

-- ---- rentals (gear going out the door) ------------------------------------
do $$ begin
  create type public.rental_status as enum ('active', 'returned', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

create sequence if not exists public.rental_code_seq start 1001;

create table if not exists public.rentals (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default ('RN-' || nextval('public.rental_code_seq')),
  gear_id      uuid not null references public.gear(id) on delete restrict,
  gear_name    text not null,
  client_id    uuid references public.clients(id) on delete set null,
  renter_name  text not null,
  renter_phone text,
  qty          int not null default 1 check (qty > 0),
  start_date   date not null default current_date,
  due_date     date not null,
  returned_at  timestamptz,
  fee          numeric(12,2) not null default 0,
  deposit      numeric(12,2) not null default 0,
  status       public.rental_status not null default 'active',
  condition_out text,
  condition_in  text,
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rentals_status_idx on public.rentals(status);
create index if not exists rentals_due_idx on public.rentals(due_date);
create index if not exists rentals_gear_idx on public.rentals(gear_id);
drop trigger if exists rentals_updated_at on public.rentals;
create trigger rentals_updated_at before update on public.rentals
  for each row execute function public.set_updated_at();

-- Keep gear.status in sync with its rentals, automatically.
create or replace function public.sync_gear_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gear uuid;
begin
  v_gear := coalesce(new.gear_id, old.gear_id);
  update public.gear g set status =
    (case
      when g.status = 'maint' then 'maint'
      when exists (select 1 from public.rentals r
                    where r.gear_id = v_gear and r.status in ('active','overdue')) then 'out'
      else 'in'
    end)::public.gear_status
   where g.id = v_gear;
  return coalesce(new, old);
end $$;

drop trigger if exists rentals_sync_gear on public.rentals;
create trigger rentals_sync_gear after insert or update or delete on public.rentals
  for each row execute function public.sync_gear_status();

-- ---- projects (client deliverables) ---------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients(id) on delete set null,
  client_name  text not null,
  title        text not null,
  value        numeric(12,2) not null default 0,
  total_videos int not null default 1 check (total_videos > 0),
  deadline     date,
  status       text not null default 'active',   -- active | complete | archived
  notes        text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects add column if not exists assignee_member_id uuid;
alter table public.projects add column if not exists assignee_name text;

create index if not exists projects_assignee_idx on public.projects(assignee_member_id);

create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,
  name        text not null,
  role_title  text not null default 'Editor',
  salary      numeric(12,2) not null default 0,
  per_video   numeric(12,2) not null default 0,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists team_members_updated_at on public.team_members;
create trigger team_members_updated_at before update on public.team_members
  for each row execute function public.set_updated_at();

do $$ begin
  alter table public.projects
    add constraint projects_assignee_fk
    foreign key (assignee_member_id) references public.team_members(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.project_deliveries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  member_id   uuid references public.team_members(id) on delete set null,
  member_name text,
  count       int not null default 1 check (count > 0),
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists deliveries_project_idx on public.project_deliveries(project_id);
create index if not exists deliveries_member_idx on public.project_deliveries(member_id);

-- ---- finance ---------------------------------------------------------------
do $$ begin
  create type public.ledger_type as enum ('in', 'out');
exception when duplicate_object then null; end $$;

create table if not exists public.ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  type       public.ledger_type not null,
  category   text not null default 'Other',   -- Session|Rental|Salary|Rent|Utilities|Gear|Other
  label      text not null,
  amount     numeric(12,2) not null check (amount >= 0),
  date       date not null default current_date,
  method     text default 'cash',             -- cash | instapay | bank | wallet
  ref_type   text,                            -- session | rental | payroll
  ref_id     uuid,
  notes      text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_date_idx on public.ledger_entries(date desc);
create index if not exists ledger_type_idx on public.ledger_entries(type, category);
drop trigger if exists ledger_updated_at on public.ledger_entries;
create trigger ledger_updated_at before update on public.ledger_entries
  for each row execute function public.set_updated_at();

create table if not exists public.payroll (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.team_members(id) on delete cascade,
  member_name text not null,
  period      text not null,                -- 'YYYY-MM'
  amount      numeric(12,2) not null default 0,
  bonus       numeric(12,2) not null default 0,
  paid_at     timestamptz,
  paid_by     uuid references public.profiles(id),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, period)
);
drop trigger if exists payroll_updated_at on public.payroll;
create trigger payroll_updated_at before update on public.payroll
  for each row execute function public.set_updated_at();

-- ---- invoices, items and payments ------------------------------------------
do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'void');
exception when duplicate_object then null; end $$;

create sequence if not exists public.invoice_number_seq start 1001;

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique default ('INV-' || nextval('public.invoice_number_seq')),
  client_id      uuid references public.clients(id) on delete set null,
  client_name    text not null,
  client_company text,
  client_phone   text,
  client_email   text,
  client_address text,
  issue_date     date not null default current_date,
  due_date       date,
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0 check (discount >= 0),
  tax_rate       numeric(5,2)  not null default 0 check (tax_rate >= 0),
  tax_amount     numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  status         public.invoice_status not null default 'draft',
  -- Presented in. The amounts above stay in EGP — this is the second currency
  -- the client sees, and the rate that was true the day the invoice was
  -- written. Freezing the rate is the whole point: a printed invoice and the
  -- copy on screen must still agree next month, when the market has moved.
  currency       text not null default 'EGP'
                 check (currency in ('EGP', 'USD', 'EUR')),
  fx_rate        numeric(14,4) not null default 1 check (fx_rate > 0),
  notes          text,
  terms          text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Older databases predate presenting an invoice in a second currency.
alter table public.invoices add column if not exists currency text not null default 'EGP';
alter table public.invoices add column if not exists fx_rate numeric(14,4) not null default 1;
do $$ begin
  alter table public.invoices
    add constraint invoices_currency_check check (currency in ('EGP', 'USD', 'EUR'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.invoices add constraint invoices_fx_rate_check check (fx_rate > 0);
exception when duplicate_object then null; end $$;

create index if not exists invoices_client_idx on public.invoices(client_id);
create index if not exists invoices_status_idx on public.invoices(status);
create index if not exists invoices_issue_idx  on public.invoices(issue_date desc);

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  qty         numeric(10,2) not null default 1 check (qty > 0),
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) not null default 0,
  ref_type    text,                       -- session | rental | project | custom
  ref_id      uuid,
  -- Free text, like a category. A production invoice reads as "Crew", "Rented
  -- in", "Transport" rather than one flat run of twelve lines, and grouping is
  -- the only thing that makes a long invoice legible. Null means ungrouped.
  section     text,
  -- The small print under a line: what a package actually contains, which lens,
  -- which day. Keeps the description short without losing the detail.
  detail      text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);

-- Older databases predate the two columns above.
alter table public.invoice_items add column if not exists section text;
alter table public.invoice_items add column if not exists detail  text;

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid references public.invoices(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete set null,
  client_name text,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null default 'cash',   -- cash | instapay | bank | wallet | card
  paid_at     date not null default current_date,
  reference   text,
  notes       text,
  -- Invoices usually bill for sessions that finance already counts, so posting
  -- to the ledger is opt-in and would otherwise double-count the revenue.
  post_to_ledger boolean not null default false,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_client_idx  on public.payments(client_id);
create index if not exists payments_date_idx    on public.payments(paid_at desc);

/*
 * Stamps the day's exchange rate onto an invoice.
 *
 * Whoever writes the invoice — the editor, the automatic one raised from a
 * finished booking, or a script — should not have to remember to look the rate
 * up. Picking a currency is enough; the rate that was true at that moment is
 * captured here and then left alone, so reprinting the invoice next month
 * shows the same figure the client agreed to.
 */
create or replace function public.stamp_invoice_fx()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rate numeric;
begin
  if new.currency is null or new.currency = 'EGP' then
    new.currency := 'EGP';
    new.fx_rate  := 1;
    return new;
  end if;

  -- Only reach for a fresh rate when there isn't a deliberate one already:
  -- on insert without a rate, or when the currency itself has just changed.
  if tg_op = 'INSERT' and new.fx_rate is distinct from 1 then return new; end if;
  if tg_op = 'UPDATE'
     and new.currency = old.currency
     and new.fx_rate is distinct from old.fx_rate then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.currency = old.currency then return new; end if;

  select (value->'rates'->>new.currency)::numeric into v_rate
    from public.app_settings where key = 'fx';

  if v_rate is not null and v_rate > 0 then
    new.fx_rate := v_rate;
  end if;
  return new;
end $$;

drop trigger if exists invoices_stamp_fx on public.invoices;
create trigger invoices_stamp_fx before insert or update on public.invoices
  for each row execute function public.stamp_invoice_fx();

-- Totals are derived from the line items, never from the browser.
create or replace function public.recalc_invoice(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sub  numeric(12,2);
  v_inv  public.invoices;
  v_paid numeric(12,2);
  v_total numeric(12,2);
  v_tax  numeric(12,2);
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if v_inv is null then return; end if;

  select coalesce(sum(round(qty * unit_price, 2)), 0) into v_sub
    from public.invoice_items where invoice_id = p_invoice;

  v_tax   := round(greatest(v_sub - v_inv.discount, 0) * v_inv.tax_rate / 100, 2);
  v_total := greatest(v_sub - v_inv.discount, 0) + v_tax;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where invoice_id = p_invoice;

  update public.invoices set
    subtotal   = v_sub,
    tax_amount = v_tax,
    total      = v_total,
    status = case
               when status = 'void'  then 'void'
               when status = 'draft' and v_paid = 0 then 'draft'
               when v_total > 0 and v_paid >= v_total then 'paid'
               when v_paid > 0 then 'partial'
               when status = 'paid' or status = 'partial' then 'sent'
               else status
             end
  where id = p_invoice;
end $$;

create or replace function public.invoice_item_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    new.amount := round(new.qty * new.unit_price, 2);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists invoice_items_amount on public.invoice_items;
create trigger invoice_items_amount before insert or update on public.invoice_items
  for each row execute function public.invoice_item_changed();

create or replace function public.invoice_touch_totals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end $$;

drop trigger if exists invoice_items_recalc on public.invoice_items;
create trigger invoice_items_recalc after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_touch_totals();

drop trigger if exists payments_recalc on public.payments;
create trigger payments_recalc after insert or update or delete on public.payments
  for each row execute function public.invoice_touch_totals();

-- Optional: mirror a payment into the finance ledger.
create or replace function public.payment_to_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if not new.post_to_ledger then return new; end if;
  select 'Payment — ' || coalesce(i.number, new.client_name, 'client')
    into v_label from public.invoices i where i.id = new.invoice_id;

  insert into public.ledger_entries(type, category, label, amount, date, method, ref_type, ref_id)
  values ('in', 'Invoice', coalesce(v_label, 'Payment received'), new.amount,
          new.paid_at, new.method, 'payment', new.id);
  return new;
end $$;

drop trigger if exists payments_ledger on public.payments;
create trigger payments_ledger after insert on public.payments
  for each row execute function public.payment_to_ledger();

-- ---- every booking gets an invoice ----------------------------------------
/**
 * A session with no invoice is money that quietly goes uncollected, so one is
 * raised automatically the moment a booking exists — as a draft, which is the
 * safe state: it can be edited or deleted, and nothing is sent anywhere.
 *
 * Done in the database rather than the app so it holds however the booking was
 * made — the calendar, the orders page, or a direct API call.
 *
 * Completing the session promotes the draft to "sent". Cancelling the session
 * voids the invoice rather than deleting it, so the number is never reused.
 */
-- "Zeina — studio session (OB-1004)" or "… · 3 days" when it spans more.
create or replace function public.session_line_label(
  p_client text, p_code text, p_from date, p_to date
) returns text language sql immutable as $$
  select p_client || ' — studio session (' || p_code || ')' ||
         case when p_to > p_from
              then ' · ' || ((p_to - p_from) + 1) || ' days'
              else '' end;
$$;

create or replace function public.session_sync_invoice()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_auto      boolean;
  v_invoice   uuid;
  v_client    public.clients;
  v_label     text;
  v_terms     text;
begin
  select coalesce((value->>'auto_invoice')::boolean, true) into v_auto
    from public.app_settings where key = 'studio';
  if not coalesce(v_auto, true) then return new; end if;

  -- Is there already an invoice line pointing at this session?
  select it.invoice_id into v_invoice
    from public.invoice_items it
   where it.ref_type = 'session' and it.ref_id = coalesce(new.id, old.id)
   limit 1;

  if tg_op = 'DELETE' then
    if v_invoice is not null then
      -- An untouched draft can go; anything that was sent or part paid is
      -- voided instead, so the numbering and the paper trail survive.
      if exists (select 1 from public.invoices i
                  where i.id = v_invoice and i.status = 'draft')
         and not exists (select 1 from public.payments p where p.invoice_id = v_invoice) then
        delete from public.invoices where id = v_invoice;
      else
        update public.invoices set status = 'void' where id = v_invoice;
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then return new; end if;

    select * into v_client from public.clients where id = new.client_id;
    select value->>'invoice_line' into v_terms from public.app_settings where key = 'terms';

    insert into public.invoices(
      client_id, client_name, client_company, client_phone, client_email,
      issue_date, due_date, status, terms, notes)
    values (
      new.client_id, new.client_name, v_client.company,
      coalesce(new.phone, v_client.phone), v_client.email,
      new.date, new.end_date + 14, 'draft', v_terms,
      'Studio session ' || new.code)
    returning id into v_invoice;

    insert into public.invoice_items(invoice_id, description, qty, unit_price, ref_type, ref_id, sort)
    values (
      v_invoice,
      public.session_line_label(new.client_name, new.code, new.date, new.end_date),
      1, new.total_amount, 'session', new.id, 0);

    return new;
  end if;

  -- UPDATE from here on.
  if v_invoice is null then return new; end if;

  -- Keep a draft in step with the booking it came from.
  if new.total_amount is distinct from old.total_amount
     or new.client_name is distinct from old.client_name
     or new.end_date is distinct from old.end_date then
    update public.invoice_items
       set unit_price = new.total_amount,
           description = public.session_line_label(
                           new.client_name, new.code, new.date, new.end_date)
     where ref_type = 'session' and ref_id = new.id
       and exists (select 1 from public.invoices i
                    where i.id = invoice_id and i.status = 'draft');
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.invoices set status = 'void'
     where id = v_invoice and status in ('draft', 'sent');
  elsif new.status = 'completed' and old.status <> 'completed' then
    update public.invoices set status = 'sent' where id = v_invoice and status = 'draft';
  end if;

  return new;
end $$;

-- Runs after the pricing and overlap triggers have settled the row.
drop trigger if exists sessions_t3_invoice on public.sessions;
create trigger sessions_t3_invoice after insert or update or delete on public.sessions
  for each row execute function public.session_sync_invoice();

-- Bookings taken before this trigger existed still need their invoice. Runs
-- once per session and skips any that already has one, so re-running is safe.
do $$
declare
  s record;
  v_invoice uuid;
  v_client  public.clients;
  v_terms   text;
begin
  select value->>'invoice_line' into v_terms from public.app_settings where key = 'terms';

  for s in
    select * from public.sessions
     where status <> 'cancelled'
       and not exists (select 1 from public.invoice_items it
                        where it.ref_type = 'session' and it.ref_id = sessions.id)
  loop
    select * into v_client from public.clients where id = s.client_id;

    insert into public.invoices(
      client_id, client_name, client_company, client_phone, client_email,
      issue_date, due_date, status, terms, notes)
    values (
      s.client_id, s.client_name, v_client.company,
      coalesce(s.phone, v_client.phone), v_client.email,
      s.date, s.end_date + 14,
      (case when s.status = 'completed' then 'sent' else 'draft' end)::public.invoice_status,
      v_terms, 'Studio session ' || s.code)
    returning id into v_invoice;

    insert into public.invoice_items(invoice_id, description, qty, unit_price, ref_type, ref_id, sort)
    values (v_invoice,
            public.session_line_label(s.client_name, s.code, s.date, s.end_date),
            1, s.total_amount, 'session', s.id, 0);
  end loop;
end $$;

-- ---- shareable invoice links ----------------------------------------------
-- A client should be able to open their invoice without an Obscura account, so
-- each invoice can carry an unguessable token. Access is granted through one
-- SECURITY DEFINER function rather than by opening the tables to `anon`, which
-- keeps the blast radius to exactly the fields listed below.
alter table public.invoices add column if not exists share_token text unique;
alter table public.invoices add column if not exists share_enabled boolean not null default false;
alter table public.invoices add column if not exists share_expires_at timestamptz;
alter table public.invoices add column if not exists share_views int not null default 0;
alter table public.invoices add column if not exists share_last_viewed_at timestamptz;

create index if not exists invoices_share_token_idx on public.invoices(share_token);

-- 32 hex characters — far beyond guessing, and safe in a URL or a WhatsApp message.
create or replace function public.enable_invoice_share(
  p_invoice uuid,
  p_expires_at timestamptz default null,
  p_regenerate boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not public.has_perm('invoices.edit') and not public.has_perm('invoices.create') then
    raise exception 'You do not have permission to share invoices.'
      using errcode = 'insufficient_privilege';
  end if;

  select share_token into v_token from public.invoices where id = p_invoice;
  if v_token is null or p_regenerate then
    -- gen_random_bytes() belongs to pgcrypto, which Supabase installs into the
    -- `extensions` schema — invisible to a function pinned to `search_path =
    -- public`, so sharing an invoice failed with "function does not exist".
    -- gen_random_uuid() is core Postgres, always on the path, and its 122
    -- random bits make a 32-character token no one is going to guess.
    v_token := replace(gen_random_uuid()::text, '-', '');
  end if;

  update public.invoices
     set share_token = v_token,
         share_enabled = true,
         share_expires_at = p_expires_at,
         share_views = case when p_regenerate then 0 else share_views end
   where id = p_invoice;

  return v_token;
end $$;

create or replace function public.disable_invoice_share(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('invoices.edit') then
    raise exception 'You do not have permission to do that.'
      using errcode = 'insufficient_privilege';
  end if;
  update public.invoices
     set share_enabled = false, share_token = null
   where id = p_invoice;
end $$;

/**
 * The only thing an anonymous visitor can call. Returns the invoice, its lines
 * and its payments as one JSON document — and nothing else about the studio.
 * Deliberately omitted: internal notes on payments, created_by, client_id, and
 * every other invoice belonging to that client.
 */
create or replace function public.invoice_by_share_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  result jsonb;
  studio jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  select * into inv from public.invoices
   where share_token = p_token and share_enabled;

  if inv is null then return null; end if;
  if inv.share_expires_at is not null and inv.share_expires_at < now() then
    return jsonb_build_object('expired', true);
  end if;

  select value into studio from public.app_settings where key = 'studio';

  -- Note it was opened. Only the first view in an hour reaches the audit log,
  -- so a client refreshing the page cannot flood it.
  if inv.share_last_viewed_at is null or inv.share_last_viewed_at < now() - interval '1 hour' then
    insert into public.audit_log(action, entity, entity_id, entity_label, summary, severity)
    values ('invoice.viewed', 'invoices', inv.id::text, inv.number,
            'Client opened the shared invoice ' || inv.number, 'info');
  end if;

  update public.invoices
     set share_views = share_views + 1, share_last_viewed_at = now()
   where id = inv.id;

  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'number', inv.number,
      'client_name', inv.client_name,
      'client_company', inv.client_company,
      'client_address', inv.client_address,
      'issue_date', inv.issue_date,
      'due_date', inv.due_date,
      'subtotal', inv.subtotal,
      'discount', inv.discount,
      'tax_rate', inv.tax_rate,
      'tax_amount', inv.tax_amount,
      'total', inv.total,
      'status', inv.status,
      'currency', inv.currency,
      'fx_rate', inv.fx_rate,
      'notes', inv.notes,
      'terms', inv.terms
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', it.description,
               'section', it.section,
               'detail', it.detail,
               'qty', it.qty,
               'unit_price', it.unit_price,
               'amount', it.amount) order by it.sort)
        from public.invoice_items it where it.invoice_id = inv.id), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', p.amount,
               'method', p.method,
               'paid_at', p.paid_at) order by p.paid_at)
        from public.payments p where p.invoice_id = inv.id), '[]'::jsonb),
    'paid_amount', coalesce((
      select sum(amount) from public.payments where invoice_id = inv.id), 0),
    'studio', jsonb_build_object(
      'name', coalesce(studio->>'name', 'Obscura Studio'),
      'branch', coalesce(studio->>'branch', ''),
      'usd_rate', coalesce((studio->>'usd_rate')::numeric, 48)
    )
  ) into result;

  return result;
end $$;

grant execute on function public.invoice_by_share_token(text) to anon, authenticated;

/**
 * The studio's Terms & Conditions, plus the contact details that go under them.
 * Public on purpose — clients are pointed at /terms from their invoice, and the
 * terms are only worth anything if they can actually be read without an account.
 */
create or replace function public.public_terms()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'terms', coalesce((select value from public.app_settings where key = 'terms'), '{}'::jsonb),
    'studio', jsonb_build_object(
      'name',      coalesce((select value->>'name'      from public.app_settings where key = 'studio'), 'Obscura Studio'),
      'branch',    coalesce((select value->>'branch'    from public.app_settings where key = 'studio'), ''),
      'phone',     coalesce((select value->>'phone'     from public.app_settings where key = 'studio'), ''),
      'instagram', coalesce((select value->>'instagram' from public.app_settings where key = 'studio'), '')
    ));
$$;

grant execute on function public.public_terms() to anon, authenticated;

-- What a client owes, and what they have paid.
-- Dropped first: these select base_table.*, so adding a column to the table
-- changes the view's column list, which CREATE OR REPLACE VIEW cannot do.
drop view if exists public.v_invoice_balance cascade;
create view public.v_invoice_balance
with (security_invoker = on) as
  select i.*,
         coalesce(p.paid, 0)                          as paid_amount,
         greatest(i.total - coalesce(p.paid, 0), 0)   as balance,
         (select count(*) from public.invoice_items it where it.invoice_id = i.id) as item_count
    from public.invoices i
    left join (
      select invoice_id, sum(amount) as paid
        from public.payments where invoice_id is not null group by invoice_id
    ) p on p.invoice_id = i.id;

-- ============================================================================
-- 7. SEED ROLES & PERMISSIONS
-- ============================================================================

insert into public.roles(key, label, description, rank, is_system) values
  ('admin',       'Admin',        'Full access to everything, including users and the audit trail.', 0,  true),
  ('manager',     'Manager',      'Runs the studio day to day. Everything except user management.', 10, true),
  ('coordinator', 'Coordinator',  'Front desk: books sessions, handles rentals and clients.',        20, true),
  ('editor',      'Editor',       'Sees assigned projects and logs deliveries.',                     30, true),
  ('photographer','Photographer', 'Sees the calendar and the gear list.',                            30, true),
  ('accountant',  'Accountant',   'Finance, payroll and reports.',                                   25, true),
  ('viewer',      'Viewer',       'Read-only access to the dashboard and calendar.',                 90, true)
on conflict (key) do update set label = excluded.label, description = excluded.description;

insert into public.permissions(key, module, label, description, sort) values
  ('dashboard.view', 'dashboard', 'View dashboard',        'See the overview page and its numbers.',   10),

  ('orders.view',    'orders',    'View orders',           'See sessions and the studio calendar.',    20),
  ('orders.create',  'orders',    'Create orders',         'Book new studio sessions.',                21),
  ('orders.edit',    'orders',    'Edit orders',           'Change or reschedule sessions.',           22),
  ('orders.delete',  'orders',    'Cancel / delete orders','Cancel or remove sessions.',               23),

  ('rentals.view',   'rentals',   'View rentals',          'See gear that is out on rental.',          30),
  ('rentals.create', 'rentals',   'Create rentals',        'Rent equipment out.',                      31),
  ('rentals.edit',   'rentals',   'Edit rentals',          'Extend, return or change a rental.',       32),
  ('rentals.delete', 'rentals',   'Delete rentals',        'Remove a rental record.',                  33),

  ('gear.view',      'gear',      'View gear',             'See the equipment inventory.',             40),
  ('gear.create',    'gear',      'Add gear',              'Add new equipment.',                       41),
  ('gear.edit',      'gear',      'Edit gear',             'Change rates, quantities and status.',     42),
  ('gear.delete',    'gear',      'Delete gear',           'Remove equipment from the inventory.',     43),

  ('projects.view',   'projects', 'View projects',         'See client deliverables and progress.',    50),
  ('projects.create', 'projects', 'Create projects',       'Open a new project.',                      51),
  ('projects.edit',   'projects', 'Edit projects',         'Change project value, scope or status.',   52),
  ('projects.delete', 'projects', 'Delete projects',       'Remove a project.',                        53),
  ('projects.deliver','projects', 'Log deliveries',        'Report completed videos.',                 54),

  ('clients.view',   'clients',   'View clients',          'See the client list.',                     60),
  ('clients.create', 'clients',   'Add clients',           'Add a new client.',                        61),
  ('clients.edit',   'clients',   'Edit clients',          'Update client details.',                   62),
  ('clients.delete', 'clients',   'Delete clients',        'Remove a client.',                         63),

  ('finance.view',   'finance',   'View finance',          'See income, expenses and the ledger.',     70),
  ('finance.create', 'finance',   'Add ledger entries',    'Record income or an expense.',             71),
  ('finance.edit',   'finance',   'Edit ledger entries',   'Change a ledger entry.',                   72),
  ('finance.delete', 'finance',   'Delete ledger entries', 'Remove a ledger entry.',                   73),

  ('team.view',      'team',      'View team',             'See team members and their output.',       80),
  ('team.create',    'team',      'Add team members',      'Add someone to the team.',                 81),
  ('team.edit',      'team',      'Edit team members',     'Change roles, salaries and details.',      82),
  ('team.delete',    'team',      'Remove team members',   'Remove someone from the team.',            83),
  ('team.payroll',   'team',      'Run payroll',           'Mark salaries as paid.',                   84),

  ('settings.view',  'settings',  'View settings',         'See studio rates and configuration.',      90),
  ('settings.edit',  'settings',  'Edit settings',         'Change rates, hours and configuration.',   91),

  ('users.view',     'users',     'View users',            'See who has an account.',                  95),
  ('users.manage',   'users',     'Manage users & access', 'Invite, activate, and set permissions.',   96),

  ('invoices.view',   'invoices', 'View invoices',         'See invoices and client statements.',      64),
  ('invoices.create', 'invoices', 'Create invoices',       'Raise a new invoice.',                     65),
  ('invoices.edit',   'invoices', 'Edit invoices',         'Change or send an invoice.',               66),
  ('invoices.delete', 'invoices', 'Delete invoices',       'Void or remove an invoice.',               67),
  ('invoices.pay',    'invoices', 'Record payments',       'Mark money as received.',                  68),

  ('audit.view',     'audit',     'View audit log',        'See every action taken in the system.',    98)
on conflict (key) do update
  set module = excluded.module, label = excluded.label,
      description = excluded.description, sort = excluded.sort;

-- Default permission sets per role (admin is implicit — it always has everything).
--
-- Only seeds a role that has no permissions yet, so re-running this file never
-- wipes out permissions you have tuned in Users & access.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('manager', array[
        'dashboard.view',
        'orders.view','orders.create','orders.edit','orders.delete',
        'rentals.view','rentals.create','rentals.edit','rentals.delete',
        'gear.view','gear.create','gear.edit','gear.delete',
        'projects.view','projects.create','projects.edit','projects.delete','projects.deliver',
        'clients.view','clients.create','clients.edit','clients.delete',
        'finance.view','finance.create','finance.edit',
        'invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.pay',
        'team.view','team.create','team.edit','team.payroll',
        'settings.view','settings.edit','users.view']),
      ('coordinator', array[
        'dashboard.view',
        'orders.view','orders.create','orders.edit',
        'rentals.view','rentals.create','rentals.edit',
        'gear.view','gear.edit',
        'projects.view',
        'clients.view','clients.create','clients.edit',
        'invoices.view','invoices.create',
        'team.view']),
      ('accountant', array[
        'dashboard.view','orders.view','rentals.view','projects.view','clients.view',
        'finance.view','finance.create','finance.edit','finance.delete',
        'invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.pay',
        'team.view','team.payroll','settings.view']),
      ('editor', array[
        'dashboard.view','projects.view','projects.deliver','orders.view','team.view']),
      ('photographer', array[
        'dashboard.view','orders.view','gear.view','rentals.view','clients.view']),
      ('viewer', array[
        'dashboard.view','orders.view'])
    ) as t(role_key, perms)
  loop
    if not exists (select 1 from public.role_permissions where role_key = r.role_key) then
      insert into public.role_permissions(role_key, permission_key)
        select r.role_key, unnest(r.perms)
        on conflict do nothing;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 8. NEW USER HANDLING
--    There is no registration page: accounts are created by an admin, and public
--    sign-up should be turned off in Supabase. This trigger still runs for every
--    new auth user, whoever created them.
--
--    The first account ever created becomes the admin and is active immediately.
--    Anyone created after that starts inactive unless the admin said otherwise.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_role  text;
  v_active boolean;
  v_name  text;
begin
  select count(*) into v_count from public.profiles;
  v_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1));

  if v_count = 0 then
    v_role := 'admin'; v_active := true;
  else
    v_role := coalesce(new.raw_user_meta_data->>'role_key', 'viewer');
    v_active := coalesce((new.raw_user_meta_data->>'is_active')::boolean, false);
    if not exists (select 1 from public.roles where key = v_role) then
      v_role := 'viewer';
    end if;
  end if;

  insert into public.profiles(id, email, full_name, role_key, is_active, status)
  values (new.id, new.email, v_name, v_role, v_active,
          case when v_active then 'active' else 'pending' end)
  on conflict (id) do update set email = excluded.email;

  insert into public.audit_log(actor_id, actor_email, actor_name, action, entity, entity_id,
                               entity_label, summary, severity)
  values (new.id, new.email, v_name, 'auth.signup', 'profiles', new.id::text, v_name,
          case when v_count = 0
               then 'First account created — granted admin access'
               else 'New account created, waiting for approval' end,
          case when v_count = 0 then 'critical' else 'warning' end);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step with auth.users.email
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_email_change();

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.audit_log        enable row level security;
alter table public.user_presence    enable row level security;
alter table public.app_settings     enable row level security;
alter table public.keepalive        enable row level security;
alter table public.clients          enable row level security;
alter table public.gear             enable row level security;
alter table public.sessions         enable row level security;
alter table public.session_addons   enable row level security;
alter table public.rentals          enable row level security;
alter table public.projects         enable row level security;
alter table public.project_deliveries enable row level security;
alter table public.team_members     enable row level security;
alter table public.ledger_entries   enable row level security;
alter table public.payroll          enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.payments         enable row level security;

-- Generates the four standard policies for a table from a permission module.
create or replace function public.apply_crud_policies(tbl text, module text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', tbl || '_select', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_insert', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_update', tbl);
  execute format('drop policy if exists %I on public.%I', tbl || '_delete', tbl);

  execute format($f$create policy %I on public.%I for select to authenticated
                    using (public.has_perm(%L))$f$, tbl || '_select', tbl, module || '.view');
  execute format($f$create policy %I on public.%I for insert to authenticated
                    with check (public.has_perm(%L))$f$, tbl || '_insert', tbl, module || '.create');
  execute format($f$create policy %I on public.%I for update to authenticated
                    using (public.has_perm(%L)) with check (public.has_perm(%L))$f$,
                    tbl || '_update', tbl, module || '.edit', module || '.edit');
  execute format($f$create policy %I on public.%I for delete to authenticated
                    using (public.has_perm(%L))$f$, tbl || '_delete', tbl, module || '.delete');
end $$;

select public.apply_crud_policies('clients',  'clients');
select public.apply_crud_policies('gear',     'gear');
select public.apply_crud_policies('sessions', 'orders');
select public.apply_crud_policies('session_addons', 'orders');
select public.apply_crud_policies('rentals',  'rentals');
select public.apply_crud_policies('projects', 'projects');
select public.apply_crud_policies('team_members', 'team');
select public.apply_crud_policies('ledger_entries', 'finance');
select public.apply_crud_policies('invoices',      'invoices');
select public.apply_crud_policies('invoice_items', 'invoices');

-- payments: seen with invoices.view, recorded with invoices.pay
drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.has_perm('invoices.view'));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.has_perm('invoices.pay'));
create policy payments_update on public.payments for update to authenticated
  using (public.has_perm('invoices.pay')) with check (public.has_perm('invoices.pay'));
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_perm('invoices.delete'));

-- project_deliveries: view with projects.view, write with projects.deliver
drop policy if exists deliveries_select on public.project_deliveries;
drop policy if exists deliveries_insert on public.project_deliveries;
drop policy if exists deliveries_update on public.project_deliveries;
drop policy if exists deliveries_delete on public.project_deliveries;
create policy deliveries_select on public.project_deliveries for select to authenticated
  using (public.has_perm('projects.view'));
create policy deliveries_insert on public.project_deliveries for insert to authenticated
  with check (public.has_perm('projects.deliver'));
create policy deliveries_update on public.project_deliveries for update to authenticated
  using (public.has_perm('projects.edit')) with check (public.has_perm('projects.edit'));
create policy deliveries_delete on public.project_deliveries for delete to authenticated
  using (public.has_perm('projects.delete'));

-- payroll: view with team.view, write with team.payroll
drop policy if exists payroll_select on public.payroll;
drop policy if exists payroll_write  on public.payroll;
create policy payroll_select on public.payroll for select to authenticated
  using (public.has_perm('team.view'));
create policy payroll_write on public.payroll for all to authenticated
  using (public.has_perm('team.payroll')) with check (public.has_perm('team.payroll'));

-- settings
drop policy if exists settings_select on public.app_settings;
drop policy if exists settings_write  on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated
  using (public.is_active_user());
create policy settings_write on public.app_settings for all to authenticated
  using (public.has_perm('settings.edit')) with check (public.has_perm('settings.edit'));

-- reference data: any signed-in, active user may read
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated using (public.is_active_user());
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (public.is_active_user());

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (public.is_active_user());
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- profiles: everyone sees their own; users.view sees the team; users.manage edits
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_team on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_manage on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_team on public.profiles for select to authenticated
  using (public.has_perm('users.view') or public.has_perm('team.view'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_manage on public.profiles for all to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- user_permissions: readable by the owner, writable by user managers
drop policy if exists user_permissions_select on public.user_permissions;
drop policy if exists user_permissions_write  on public.user_permissions;
create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = auth.uid() or public.has_perm('users.view'));
create policy user_permissions_write on public.user_permissions for all to authenticated
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- audit log: read-only, and only for people allowed to see it. Nobody can edit it.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.has_perm('audit.view'));

-- presence: you always write your own row (via touch_presence); auditors read all
drop policy if exists presence_select on public.user_presence;
drop policy if exists presence_self   on public.user_presence;
create policy presence_select on public.user_presence for select to authenticated
  using (user_id = auth.uid() or public.has_perm('audit.view') or public.has_perm('users.view'));
create policy presence_self on public.user_presence for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- keepalive: readable by signed-in users, written only through ping_keepalive()
drop policy if exists keepalive_select on public.keepalive;
create policy keepalive_select on public.keepalive for select to authenticated using (true);

-- ============================================================================
-- 10. AUDIT EVERY BUSINESS TABLE
-- ============================================================================

select public.attach_audit('public.clients');
select public.attach_audit('public.gear');
select public.attach_audit('public.sessions');
select public.attach_audit('public.session_addons');
select public.attach_audit('public.rentals');
select public.attach_audit('public.projects');
select public.attach_audit('public.project_deliveries');
select public.attach_audit('public.team_members');
select public.attach_audit('public.ledger_entries');
select public.attach_audit('public.payroll');
select public.attach_audit('public.invoices');
select public.attach_audit('public.invoice_items');
select public.attach_audit('public.payments');
select public.attach_audit('public.app_settings');
select public.attach_audit('public.profiles');
select public.attach_audit('public.role_permissions');
select public.attach_audit('public.user_permissions');

-- ============================================================================
-- 11. REPORTING VIEWS
-- ============================================================================

-- Dropped first: these select base_table.*, so adding a column to the table
-- changes the view's column list, which CREATE OR REPLACE VIEW cannot do.
drop view if exists public.v_project_progress cascade;
create view public.v_project_progress
with (security_invoker = on) as
  select p.*,
         coalesce(d.delivered, 0)                                   as delivered,
         greatest(p.total_videos - coalesce(d.delivered, 0), 0)     as remaining,
         case when p.total_videos > 0
              then round(coalesce(d.delivered,0)::numeric / p.total_videos * 100)
              else 0 end                                            as pct
    from public.projects p
    left join (
      select project_id, sum(count) as delivered
        from public.project_deliveries group by project_id
    ) d on d.project_id = p.id;

-- Dropped first: these select base_table.*, so adding a column to the table
-- changes the view's column list, which CREATE OR REPLACE VIEW cannot do.
drop view if exists public.v_member_output cascade;
create view public.v_member_output
with (security_invoker = on) as
  select m.*,
         coalesce(d.delivered, 0) as delivered,
         coalesce(d.delivered, 0) * m.per_video as video_payout
    from public.team_members m
    left join (
      select member_id, sum(count) as delivered
        from public.project_deliveries group by member_id
    ) d on d.member_id = m.id;

-- Monthly money summary used by the dashboard and the finance page.
create or replace function public.finance_summary(p_year int, p_month int)
returns table (
  income numeric, expenses numeric, net numeric,
  session_revenue numeric, rental_revenue numeric, payroll_expense numeric,
  sessions_count bigint, rentals_count bigint
)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select make_date(p_year, p_month, 1) as d0,
           (make_date(p_year, p_month, 1) + interval '1 month')::date as d1
  ),
  led as (
    select * from public.ledger_entries, bounds
     where date >= d0 and date < d1
  ),
  sess as (
    select * from public.sessions, bounds
     where date >= d0 and date < d1 and status <> 'cancelled'
  ),
  rent as (
    select * from public.rentals, bounds
     where start_date >= d0 and start_date < d1 and status <> 'cancelled'
  )
  select
    coalesce((select sum(amount) from led where type = 'in'), 0)                        as income,
    coalesce((select sum(amount) from led where type = 'out'), 0)                       as expenses,
    coalesce((select sum(amount) from led where type = 'in'), 0)
      - coalesce((select sum(amount) from led where type = 'out'), 0)                   as net,
    coalesce((select sum(total_amount) from sess), 0)                                   as session_revenue,
    coalesce((select sum(fee) from rent), 0)                                            as rental_revenue,
    coalesce((select sum(amount) from led where type='out' and category='Salary'), 0)   as payroll_expense,
    (select count(*) from sess)                                                         as sessions_count,
    (select count(*) from rent)                                                         as rentals_count;
$$;

-- Flags rentals that blew past their due date. Called by the daily cron.
create or replace function public.mark_overdue_rentals()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.rentals
     set status = 'overdue'
   where status = 'active' and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ============================================================================
-- 12. REALTIME (live audit feed + presence)
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.audit_log';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.user_presence';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.sessions';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.rentals';
  exception when duplicate_object then null; end;
end $$;

-- ============================================================================
-- 13. GRANTS
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- The daily cron runs as the service role.
grant execute on function public.mark_overdue_rentals() to service_role;

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase turns
-- functions in this schema into callable REST endpoints. Anything that changes
-- data and does not check a permission itself is taken away from anonymous
-- callers here. `invoice_by_share_token` is the one deliberate exception — that
-- is the whole point of a shared invoice link.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.mark_overdue_rentals()',
    'public.log_event(text,text,text,text,text,text,text,text,jsonb)',
    'public.recalc_invoice(uuid)',
    'public.enable_invoice_share(uuid,timestamptz,boolean)',
    'public.disable_invoice_share(uuid)',
    'public.touch_presence(text,text,text,text)',
    'public.attach_audit(regclass)',
    'public.apply_crud_policies(text,text)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon', fn);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- Put back the ones signed-in staff genuinely need.
grant execute on function public.log_event(text,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.touch_presence(text,text,text,text) to authenticated;
grant execute on function public.enable_invoice_share(uuid,timestamptz,boolean) to authenticated;
grant execute on function public.disable_invoice_share(uuid) to authenticated;

-- Revoke direct writes to the audit trail: it is append-only, via triggers.
revoke insert, update, delete on public.audit_log from authenticated, anon;
revoke insert, update, delete on public.keepalive from authenticated, anon;

-- ============================================================================
-- DONE.
--
-- Next, in Supabase:
--   1. Authentication -> Sign In / Providers -> Email: uncheck "Allow new users
--      to sign up". Accounts are issued by an admin; the app has no signup page.
--   2. Authentication -> Users -> Add user: create your own account and tick
--      "Auto Confirm User". The first account created becomes the admin.
-- ============================================================================
