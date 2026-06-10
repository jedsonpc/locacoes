# Tutorial: Migrando para Supabase (sincronização entre 4 usuários)

Tempo estimado: **20 minutos**.
Você vai sair de um app que perde dados ao recarregar para um app com:
- Login por email/senha (4 usuários)
- Dados compartilhados no mesmo banco PostgreSQL
- Sincronização em tempo real (quando um salva, os outros 3 veem na hora)
- Cache local offline (funciona mesmo sem internet por alguns minutos)

---

## PASSO 1 — Criar conta e projeto no Supabase

1. Acesse https://supabase.com e clique em **Start your project** → **Sign in with GitHub** (recomendado, é grátis).
2. Clique em **New project**.
   - **Name:** `gestao-locacoes`
   - **Database password:** gere uma forte e **guarde num gerenciador de senhas** (você raramente vai usar, mas precisa guardar).
   - **Region:** `South America (São Paulo)` — mais próximo do Brasil.
   - **Pricing plan:** Free.
3. Clique em **Create new project**. Aguarde ~2 minutos enquanto o projeto é provisionado.

---

## PASSO 2 — Copiar URL e chave pública (anon key)

1. No menu lateral, vá em **Project Settings** (ícone de engrenagem) → **API**.
2. Copie e cole em um bloco de notas:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **Project API keys → anon public** → começa com `eyJhbGciOi...`

> ⚠️ Estas duas chaves são **públicas** e podem ficar no código do GitHub. A segurança vem das políticas RLS (próximo passo), não da chave.
> A chave **service_role** (logo abaixo) é SECRETA — nunca use no front-end.

---

## PASSO 3 — Criar a tabela (rodar o SQL)

1. No menu lateral, clique em **SQL Editor** → **New query**.
2. Cole o SQL abaixo inteiro e clique em **Run** (canto inferior direito):

```sql
-- Tabela única que guarda TODO o estado do app
create table public.workspace_state (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Linha única compartilhada pelos 4 usuários
insert into public.workspace_state (id, data) values
  ('00000000-0000-0000-0000-000000000001', '{"properties":[],"clients":[],"contracts":[],"expenses":[],"payments":[],"auditLogs":[]}');

-- Permissões básicas
grant select, update on public.workspace_state to authenticated;

-- Habilitar RLS (Row-Level Security)
alter table public.workspace_state enable row level security;

-- Política: qualquer usuário logado pode ler e atualizar
create policy "auth users read"
  on public.workspace_state for select to authenticated using (true);

create policy "auth users update"
  on public.workspace_state for update to authenticated using (true) with check (true);

-- Habilitar Realtime na tabela (para sincronização ao vivo)
alter publication supabase_realtime add table public.workspace_state;
```

Se ver "Success. No rows returned" → deu certo.

---

## PASSO 4 — Criar os 4 usuários

1. Menu lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Para cada um dos 4 funcionários:
   - **Email:** o email real dele (ex: `joao@rios.com.br`)
   - **Password:** gere uma senha forte e envie pelo WhatsApp/pessoalmente
   - ✅ **Auto Confirm User** (importante — senão precisariam confirmar por email)
3. Repita para os 4.

> Dica: você pode usar emails fictícios tipo `usuario1@imobiliaria.local`, `usuario2@...` se preferir não usar emails reais. Não há envio de email se "Auto Confirm" estiver ligado.

---

## PASSO 5 — Configurar o app (editar `supabase-config.js`)

Abra `supabase-config.js` no editor e substitua:

```js
window.SUPABASE_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",      // <- cole sua URL
  SUPABASE_ANON_KEY: "eyJhbGciOi...sua-anon-key",     // <- cole sua anon key
  WORKSPACE_ID: "00000000-0000-0000-0000-000000000001" // mantenha
};
```

Salve.

---

## PASSO 6 — Subir para o GitHub Pages

1. Copie **TODOS** os arquivos deste pacote para o seu repositório `gestao-locacoes` (substituindo os antigos):
   - `index.html` (atualizado — agora carrega Supabase)
   - `app.js` (atualizado — agora sincroniza com nuvem)
   - `supabase-config.js` ✨ **NOVO**
   - `supabase-sync.js` ✨ **NOVO**
   - `login.html` ✨ **NOVO**
   - `sw.js`, `styles.css`, `manifest.webmanifest` (mantidos da versão anterior)
2. Commit + push.
3. Aguarde 1-2 min o GitHub Pages publicar.

---

## PASSO 7 — Testar

1. Abra https://jedsonpc.github.io/gestao-locacoes/ → deve **redirecionar para `login.html`**.
2. Entre com um dos 4 emails criados → cai no app normal.
3. Cadastre um imóvel → recarregue a página → **deve aparecer**.
4. Abra em outro navegador/celular, faça login com outro usuário → deve ver o mesmo imóvel **em tempo real**.

---

## ❓ Problemas comuns

| Erro | Causa | Solução |
|---|---|---|
| "Configure supabase-config.js" no console | Ainda está com `SEU-PROJETO` | Edite o arquivo com URL/key reais |
| Login falha com "Invalid login credentials" | Senha errada ou usuário não confirmado | Marque "Auto Confirm" no Supabase |
| Dados não sincronizam entre abas | Realtime não habilitado | Re-rode a linha `alter publication supabase_realtime add table...` |
| 401 ao salvar | RLS bloqueando | Confira que as 2 políticas foram criadas em Authentication > Policies |

---

## 🔒 Segurança

- A **anon key** no código é segura — ela só permite o que as políticas RLS deixam (no caso, ler/escrever apenas se logado).
- **Nunca** coloque a `service_role` key no front-end.
- A senha do banco do PASSO 1 não é usada pela aplicação — guarde-a apenas para emergências (recuperar acesso ao painel Supabase).
- Se um funcionário sair: vá em Auth → Users → delete o usuário dele. Ele perde acesso imediato.

---

## 💰 Custo

Free tier do Supabase comporta tranquilamente este uso (500 MB de banco, 50k autenticações/mês, 2 GB de transferência). Para 4 usuários numa imobiliária, deve durar anos no plano grátis.
