
-- Fix search_path on tg_set_updated_at
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

-- Revoke EXECUTE on SECURITY DEFINER functions from public/anon/authenticated
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Tighten companies write policies (require authenticated user explicitly)
drop policy if exists "Companies: insert authenticated" on public.companies;
drop policy if exists "Companies: update authenticated" on public.companies;

create policy "Companies: insert authenticated"
  on public.companies for insert to authenticated
  with check (auth.uid() is not null);

create policy "Companies: update authenticated"
  on public.companies for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
