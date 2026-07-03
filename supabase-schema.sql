-- Locacoes - schema Supabase
-- Rode este arquivo no SQL Editor do Supabase.

create table if not exists public.locacoes_state (
  id text primary key default 'main',
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.locacoes_state enable row level security;

drop policy if exists "Usuarios leem seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios leem seus dados de locacoes"
on public.locacoes_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Usuarios criam seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios criam seus dados de locacoes"
on public.locacoes_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Usuarios atualizam seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios atualizam seus dados de locacoes"
on public.locacoes_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.touch_locacoes_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_locacoes_state_updated_at on public.locacoes_state;
create trigger touch_locacoes_state_updated_at
before update on public.locacoes_state
for each row
execute function public.touch_locacoes_state_updated_at();
