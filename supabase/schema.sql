-- CheckMyTrade AI database schema for Supabase.
--
-- Safe to run inside the SAME Supabase project as your journal app, so students
-- use one login for both. Everything here is prefixed `cmt_`, nothing touches
-- auth.users or the journal's tables, and access to CheckMyTrade is granted by
-- redeeming an invite code (a journal login alone does not unlock it).
--
-- Run it in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- It is idempotent: running it again will not drop data.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cmt_invite_codes (
  code        text primary key check (code ~ '^[A-Z0-9-]{4,64}$'),
  role        text not null default 'student' check (role in ('student', 'coach')),
  max_uses    integer not null default 1 check (max_uses > 0),
  uses        integer not null default 0 check (uses >= 0),
  expires_at  timestamptz,
  active      boolean not null default true,
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.cmt_profiles (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  email                 text,
  display_name          text,
  role                  text not null default 'student' check (role in ('student', 'coach')),
  invite_code           text references public.cmt_invite_codes (code) on delete set null,
  daily_grade_limit     integer check (daily_grade_limit >= 0),     -- null = use the app default
  daily_question_limit  integer check (daily_question_limit >= 0),  -- null = use the app default
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

create table if not exists public.cmt_submissions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  instrument         text not null,
  timeframe          text not null,
  direction          text not null check (direction in ('long', 'short')),
  entry              numeric not null,
  stop               numeric not null,
  target             numeric not null,
  result             text not null,
  contracts          numeric,
  account_size       numeric,
  notes              text,
  image_path         text,
  math               jsonb,
  ai_result          jsonb not null,
  ai_grade           text not null,
  ai_score           numeric not null,
  model              text not null,
  mock               boolean not null default false,
  attempts           integer not null default 1,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  -- Coach override
  coach_grade        text,
  coach_score        numeric,
  coach_comment      text,
  is_calibration     boolean not null default false,
  overridden_by      uuid references auth.users (id) on delete set null,
  overridden_at      timestamptz
);
create index if not exists cmt_submissions_user_idx on public.cmt_submissions (user_id, created_at desc);
create index if not exists cmt_submissions_created_idx on public.cmt_submissions (created_at desc);
create index if not exists cmt_submissions_calibration_idx on public.cmt_submissions (overridden_at desc) where is_calibration;

create table if not exists public.cmt_questions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  question           text not null,
  answer             text not null,
  grounded           boolean not null,
  sources            jsonb not null default '[]'::jsonb,
  model              text not null,
  mock               boolean not null default false,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd           numeric(12, 6) not null default 0
);
create index if not exists cmt_questions_user_idx on public.cmt_questions (user_id, created_at desc);

create table if not exists public.cmt_daily_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  grades     integer not null default 0,
  questions  integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Functions (called only by the Netlify functions with the service role key)
-- ---------------------------------------------------------------------------

-- Atomically use one unit of today's quota. Returns the new count, or -1 when
-- the limit is already reached.
create or replace function public.cmt_consume_quota(p_user uuid, p_day date, p_kind text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  insert into cmt_daily_usage (user_id, day) values (p_user, p_day) on conflict do nothing;
  if p_kind = 'grade' then
    update cmt_daily_usage set grades = grades + 1
      where user_id = p_user and day = p_day and grades < p_limit
      returning grades into v;
  elsif p_kind = 'question' then
    update cmt_daily_usage set questions = questions + 1
      where user_id = p_user and day = p_day and questions < p_limit
      returning questions into v;
  else
    raise exception 'unknown quota kind %', p_kind;
  end if;
  return coalesce(v, -1);
end;
$$;

-- Give a unit back when the AI call failed, so students are not charged for errors.
create or replace function public.cmt_release_quota(p_user uuid, p_day date, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'grade' then
    update cmt_daily_usage set grades = greatest(grades - 1, 0) where user_id = p_user and day = p_day;
  elsif p_kind = 'question' then
    update cmt_daily_usage set questions = greatest(questions - 1, 0) where user_id = p_user and day = p_day;
  end if;
end;
$$;

-- Redeem an invite code. Creates the profile, or upgrades a student to coach
-- when a coach code is redeemed. Raises INVITE_INVALID, INVITE_EXPIRED, INVITE_USED_UP.
create or replace function public.cmt_redeem_invite(p_user uuid, p_email text, p_code text)
returns public.cmt_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  inv cmt_invite_codes;
  prof cmt_profiles;
begin
  select * into inv from cmt_invite_codes where code = upper(p_code) for update;
  if not found or not inv.active then
    raise exception 'INVITE_INVALID';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  select * into prof from cmt_profiles where user_id = p_user;
  if found then
    if inv.role = 'coach' and prof.role <> 'coach' then
      if inv.uses >= inv.max_uses then raise exception 'INVITE_USED_UP'; end if;
      update cmt_profiles set role = 'coach' where user_id = p_user returning * into prof;
      update cmt_invite_codes set uses = uses + 1 where code = inv.code;
    end if;
    return prof;  -- already a member: no use consumed
  end if;

  if inv.uses >= inv.max_uses then
    raise exception 'INVITE_USED_UP';
  end if;
  insert into cmt_profiles (user_id, email, role, invite_code)
    values (p_user, p_email, inv.role, inv.code)
    returning * into prof;
  update cmt_invite_codes set uses = uses + 1 where code = inv.code;
  return prof;
end;
$$;

revoke all on function public.cmt_consume_quota(uuid, date, text, integer) from public, anon, authenticated;
revoke all on function public.cmt_release_quota(uuid, date, text) from public, anon, authenticated;
revoke all on function public.cmt_redeem_invite(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cmt_consume_quota(uuid, date, text, integer) to service_role;
grant execute on function public.cmt_release_quota(uuid, date, text) to service_role;
grant execute on function public.cmt_redeem_invite(uuid, text, text) to service_role;

-- Helper for row level security policies.
create or replace function public.cmt_is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from cmt_profiles where user_id = auth.uid() and role = 'coach' and active);
$$;

-- ---------------------------------------------------------------------------
-- Row level security. All writes go through the Netlify functions (service
-- role), so the browser only ever gets read access to its own rows.
-- ---------------------------------------------------------------------------

alter table public.cmt_invite_codes enable row level security;
alter table public.cmt_profiles     enable row level security;
alter table public.cmt_submissions  enable row level security;
alter table public.cmt_questions    enable row level security;
alter table public.cmt_daily_usage  enable row level security;

drop policy if exists cmt_profiles_read on public.cmt_profiles;
create policy cmt_profiles_read on public.cmt_profiles
  for select to authenticated using (user_id = auth.uid() or public.cmt_is_coach());

drop policy if exists cmt_submissions_read on public.cmt_submissions;
create policy cmt_submissions_read on public.cmt_submissions
  for select to authenticated using (user_id = auth.uid() or public.cmt_is_coach());

drop policy if exists cmt_questions_read on public.cmt_questions;
create policy cmt_questions_read on public.cmt_questions
  for select to authenticated using (user_id = auth.uid() or public.cmt_is_coach());

drop policy if exists cmt_daily_usage_read on public.cmt_daily_usage;
create policy cmt_daily_usage_read on public.cmt_daily_usage
  for select to authenticated using (user_id = auth.uid() or public.cmt_is_coach());

drop policy if exists cmt_invite_codes_read on public.cmt_invite_codes;
create policy cmt_invite_codes_read on public.cmt_invite_codes
  for select to authenticated using (public.cmt_is_coach());

-- ---------------------------------------------------------------------------
-- Cost per student (coach view)
-- ---------------------------------------------------------------------------

create or replace view public.cmt_student_costs with (security_invoker = true) as
select
  p.user_id,
  p.email,
  p.display_name,
  p.role,
  coalesce(s.grades, 0)          as grades,
  coalesce(q.questions, 0)       as questions,
  coalesce(s.cost, 0)            as grade_cost_usd,
  coalesce(q.cost, 0)            as question_cost_usd,
  coalesce(s.cost, 0) + coalesce(q.cost, 0) as total_cost_usd,
  coalesce(s.cost_30d, 0) + coalesce(q.cost_30d, 0) as cost_30d_usd
from public.cmt_profiles p
left join (
  select user_id, count(*) as grades, sum(cost_usd) as cost,
         sum(cost_usd) filter (where created_at > now() - interval '30 days') as cost_30d
  from public.cmt_submissions group by user_id
) s on s.user_id = p.user_id
left join (
  select user_id, count(*) as questions, sum(cost_usd) as cost,
         sum(cost_usd) filter (where created_at > now() - interval '30 days') as cost_30d
  from public.cmt_questions group by user_id
) q on q.user_id = p.user_id;

-- ---------------------------------------------------------------------------
-- Private storage bucket for chart screenshots
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('cmt-charts', 'cmt-charts', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- First coach invite: see supabase/first-coach.sql. It is kept separate so a
-- guessable code never ships by default.
-- ---------------------------------------------------------------------------
