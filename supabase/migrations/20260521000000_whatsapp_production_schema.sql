-- Production schema for LeadFlow/PROSPECTAMOS HOJE.
-- Safe to run in Supabase SQL Editor more than once.
-- It creates the CRM core tables required by Radar, Leads and WhatsApp virtualization.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    create type public.app_role as enum ('admin', 'consultor');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'lead_status') then
    create type public.lead_status as enum ('novo', 'contato', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique,
  razao_social text,
  nome_fantasia text,
  cnae_principal text,
  cnae_descricao text,
  segmento text,
  porte text,
  situacao_cadastral text,
  data_situacao date,
  data_abertura date,
  telefone text,
  email text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  cidade text,
  uf text,
  capital_social numeric,
  score integer not null default 0,
  fonte text not null default 'brasilapi',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_cidade_uf_idx on public.companies (cidade, uf);
create index if not exists companies_segmento_idx on public.companies (segmento);
create index if not exists companies_score_idx on public.companies (score desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  status public.lead_status not null default 'novo',
  notas text,
  proximo_followup timestamptz,
  source text default 'radar',
  whatsapp_phone text,
  contact_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, company_id)
);

alter table public.leads
  add column if not exists source text default 'radar',
  add column if not exists whatsapp_phone text,
  add column if not exists contact_name text;

create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_whatsapp_phone_idx on public.leads (whatsapp_phone);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'consultor')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies
  for each row execute function public.tg_set_updated_at();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute function public.tg_set_updated_at();

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  instance text not null,
  remote_jid text not null,
  phone text,
  push_name text,
  display_name text,
  avatar_url text,
  source text not null default 'unknown',
  source_channel text,
  source_campaign text,
  status text not null default 'open',
  assigned_user_id uuid references auth.users(id) on delete set null,
  bot_enabled boolean not null default false,
  bot_paused boolean not null default false,
  bot_mode text not null default 'off',
  bot_message_count integer not null default 0,
  last_bot_reply_at timestamptz,
  handoff_required boolean not null default false,
  handoff_reason text,
  handoff_at timestamptz,
  human_assumed_at timestamptz,
  last_message text,
  last_message_at timestamptz,
  last_message_from_me boolean not null default false,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, instance, remote_jid)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  instance text not null,
  remote_jid text not null,
  message_id text not null,
  from_me boolean not null default false,
  direction text not null,
  content text not null,
  message_type text not null default 'text',
  timestamp timestamptz not null default now(),
  status text not null default 'received',
  read_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance, message_id)
);

create index if not exists whatsapp_conversations_owner_idx on public.whatsapp_conversations (owner_id);
create index if not exists whatsapp_conversations_lead_idx on public.whatsapp_conversations (lead_id);
create index if not exists whatsapp_conversations_remote_idx on public.whatsapp_conversations (owner_id, instance, remote_jid);
create index if not exists whatsapp_conversations_last_message_idx on public.whatsapp_conversations (last_message_at desc);
create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages (conversation_id, timestamp);
create index if not exists whatsapp_messages_lead_idx on public.whatsapp_messages (lead_id);
create index if not exists whatsapp_messages_remote_idx on public.whatsapp_messages (instance, remote_jid);

drop trigger if exists whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_updated_at before update on public.whatsapp_conversations
  for each row execute function public.tg_set_updated_at();

drop trigger if exists whatsapp_messages_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_updated_at before update on public.whatsapp_messages
  for each row execute function public.tg_set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "Profiles: read own" on public.profiles;
drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: read own" on public.profiles for select using (auth.uid() = id);
create policy "Profiles: update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Roles: read own" on public.user_roles;
drop policy if exists "Roles: admin manage" on public.user_roles;
create policy "Roles: read own" on public.user_roles for select using (auth.uid() = user_id);
create policy "Roles: admin manage" on public.user_roles for all using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Companies: read authenticated" on public.companies;
drop policy if exists "Companies: insert authenticated" on public.companies;
drop policy if exists "Companies: update authenticated" on public.companies;
create policy "Companies: read authenticated" on public.companies
  for select to authenticated using (true);
create policy "Companies: insert authenticated" on public.companies
  for insert to authenticated with check (auth.uid() is not null);
create policy "Companies: update authenticated" on public.companies
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "Leads: read own" on public.leads;
drop policy if exists "Leads: insert own" on public.leads;
drop policy if exists "Leads: update own" on public.leads;
drop policy if exists "Leads: delete own" on public.leads;
create policy "Leads: read own" on public.leads for select using (auth.uid() = owner_id);
create policy "Leads: insert own" on public.leads for insert with check (auth.uid() = owner_id);
create policy "Leads: update own" on public.leads for update using (auth.uid() = owner_id);
create policy "Leads: delete own" on public.leads for delete using (auth.uid() = owner_id);

drop policy if exists "WhatsApp conversations: read own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: insert own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: update own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: delete own" on public.whatsapp_conversations;
create policy "WhatsApp conversations: read own" on public.whatsapp_conversations for select using (auth.uid() = owner_id);
create policy "WhatsApp conversations: insert own" on public.whatsapp_conversations for insert with check (auth.uid() = owner_id);
create policy "WhatsApp conversations: update own" on public.whatsapp_conversations for update using (auth.uid() = owner_id);
create policy "WhatsApp conversations: delete own" on public.whatsapp_conversations for delete using (auth.uid() = owner_id);

drop policy if exists "WhatsApp messages: read own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: insert own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: update own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: delete own" on public.whatsapp_messages;
create policy "WhatsApp messages: read own" on public.whatsapp_messages for select using (auth.uid() = owner_id);
create policy "WhatsApp messages: insert own" on public.whatsapp_messages for insert with check (auth.uid() = owner_id);
create policy "WhatsApp messages: update own" on public.whatsapp_messages for update using (auth.uid() = owner_id);
create policy "WhatsApp messages: delete own" on public.whatsapp_messages for delete using (auth.uid() = owner_id);

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
