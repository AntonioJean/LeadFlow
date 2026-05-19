-- WhatsApp virtualization: conversations and messages captured from Evolution API.

alter table public.leads
  add column if not exists source text default 'radar',
  add column if not exists whatsapp_phone text,
  add column if not exists contact_name text;

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

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "WhatsApp conversations: read own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: insert own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: update own" on public.whatsapp_conversations;
drop policy if exists "WhatsApp conversations: delete own" on public.whatsapp_conversations;

create policy "WhatsApp conversations: read own" on public.whatsapp_conversations
  for select using (auth.uid() = owner_id);
create policy "WhatsApp conversations: insert own" on public.whatsapp_conversations
  for insert with check (auth.uid() = owner_id);
create policy "WhatsApp conversations: update own" on public.whatsapp_conversations
  for update using (auth.uid() = owner_id);
create policy "WhatsApp conversations: delete own" on public.whatsapp_conversations
  for delete using (auth.uid() = owner_id);

drop policy if exists "WhatsApp messages: read own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: insert own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: update own" on public.whatsapp_messages;
drop policy if exists "WhatsApp messages: delete own" on public.whatsapp_messages;

create policy "WhatsApp messages: read own" on public.whatsapp_messages
  for select using (auth.uid() = owner_id);
create policy "WhatsApp messages: insert own" on public.whatsapp_messages
  for insert with check (auth.uid() = owner_id);
create policy "WhatsApp messages: update own" on public.whatsapp_messages
  for update using (auth.uid() = owner_id);
create policy "WhatsApp messages: delete own" on public.whatsapp_messages
  for delete using (auth.uid() = owner_id);
