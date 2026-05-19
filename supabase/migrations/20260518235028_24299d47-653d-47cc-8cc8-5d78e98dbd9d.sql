
-- Enum para papéis
create type public.app_role as enum ('admin', 'consultor');

-- Enum para status do funil
create type public.lead_status as enum ('novo', 'contato', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- companies (cache compartilhado)
create table public.companies (
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

create index companies_cidade_uf_idx on public.companies (cidade, uf);
create index companies_segmento_idx on public.companies (segmento);
create index companies_score_idx on public.companies (score desc);

-- leads
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  status lead_status not null default 'novo',
  notas text,
  proximo_followup timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, company_id)
);

create index leads_owner_idx on public.leads (owner_id);
create index leads_status_idx on public.leads (status);

-- Função has_role (SECURITY DEFINER, evita recursão de RLS)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.tg_set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function public.tg_set_updated_at();

-- Auto-criar profile + role 'consultor' no signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role)
  values (new.id, 'consultor');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;

-- profiles policies
create policy "Profiles: read own" on public.profiles
  for select using (auth.uid() = id);
create policy "Profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- user_roles policies
create policy "Roles: read own" on public.user_roles
  for select using (auth.uid() = user_id);
create policy "Roles: admin manage" on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin'));

-- companies: leitura/escrita para qualquer autenticado (cache compartilhado)
create policy "Companies: read authenticated" on public.companies
  for select to authenticated using (true);
create policy "Companies: insert authenticated" on public.companies
  for insert to authenticated with check (true);
create policy "Companies: update authenticated" on public.companies
  for update to authenticated using (true);

-- leads policies: cada consultor vê só os seus
create policy "Leads: read own" on public.leads
  for select using (auth.uid() = owner_id);
create policy "Leads: insert own" on public.leads
  for insert with check (auth.uid() = owner_id);
create policy "Leads: update own" on public.leads
  for update using (auth.uid() = owner_id);
create policy "Leads: delete own" on public.leads
  for delete using (auth.uid() = owner_id);
