-- Locacoes - schema Supabase
-- Rode este arquivo no SQL Editor do Supabase.

create table if not exists public.locacoes_state (
  id text primary key default 'main',
  user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Migração de instalações antigas: todos os usuários autorizados devem acessar
-- a mesma base. Preserva como canônica a linha "main" atualizada mais recentemente.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'locacoes_state'
      and constraint_name = 'locacoes_state_pkey'
      and constraint_type = 'PRIMARY KEY'
  ) then
    delete from public.locacoes_state a
    using public.locacoes_state b
    where a.id = b.id
      and (a.updated_at < b.updated_at or (a.updated_at = b.updated_at and a.ctid < b.ctid));
    alter table public.locacoes_state drop constraint locacoes_state_pkey;
  end if;
end;
$$;

alter table public.locacoes_state
add constraint locacoes_state_pkey primary key (id);

alter table public.locacoes_state
drop constraint if exists locacoes_state_user_id_fkey;

alter table public.locacoes_state
add constraint locacoes_state_user_id_fkey
foreign key (user_id) references auth.users(id) on delete set null;

alter table public.locacoes_state enable row level security;

drop policy if exists "Usuarios leem seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios leem seus dados de locacoes"
on public.locacoes_state
for select
to authenticated
using (
  auth.jwt() ->> 'email' = 'edson@cupe.com'
  or (auth.jwt() -> 'app_metadata' -> 'app_access' -> 'locacao' ->> 'active')::boolean is true
);

drop policy if exists "Usuarios criam seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios criam seus dados de locacoes"
on public.locacoes_state
for insert
to authenticated
with check (
  auth.jwt() ->> 'email' = 'edson@cupe.com'
  or (auth.jwt() -> 'app_metadata' -> 'app_access' -> 'locacao' ->> 'active')::boolean is true
);

drop policy if exists "Usuarios atualizam seus dados de locacoes" on public.locacoes_state;
create policy "Usuarios atualizam seus dados de locacoes"
on public.locacoes_state
for update
to authenticated
using (
  auth.jwt() ->> 'email' = 'edson@cupe.com'
  or (auth.jwt() -> 'app_metadata' -> 'app_access' -> 'locacao' ->> 'active')::boolean is true
)
with check (
  auth.jwt() ->> 'email' = 'edson@cupe.com'
  or (auth.jwt() -> 'app_metadata' -> 'app_access' -> 'locacao' ->> 'active')::boolean is true
);

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
