# Correções e melhorias — gestao-locacoes

## 1. BUG CRÍTICO (resolve o app inteiro)

Em `supabase-sync.js` (linhas 13 e 18 do seu repo) tem isto:

```js
if (!cfg || !cfg.SUPABASE_URL:"https://...", || cfg.SUPABASE_URL.includes(...))
const client = window.supabase.createClient(cfg.SUPABASE_URL:"https://...", cfg.SUPABASE_ANON_KEY:"Imobiliaria@!",);
```

Isso é **sintaxe inválida em JavaScript** — o navegador para na primeira linha e nada
mais carrega (login, relatórios, tudo quebra). Substitua o arquivo inteiro pelo
`supabase-sync.js` deste pacote.

⚠️ **ATENÇÃO**: o valor `"Imobiliaria@!"` que estava ali NÃO é a chave anon do Supabase.
A `SUPABASE_ANON_KEY` real é um JWT longo que começa com `eyJ...`. Pegue em:
**Supabase → Settings → API → Project API keys → `anon public`**, e cole em
`supabase-config.js`.

## 2. RELATÓRIOS — já existem!

Seu `index.html` já tem a aba **Relatórios** (`<section id="reports">`) com filtros
de cliente, imóvel, período (início/fim), status, tipo de despesa, valor min/max,
e a função `renderReports()` em `app.js` já calcula receita, despesas, margem
líquida e ticket médio. Provavelmente você nunca viu funcionando porque o bug
acima impedia o app de carregar dados. **Depois do fix do item 1, abra a aba
"Relatórios" — vai funcionar.**

Se quiser exportar para Excel/PDF depois, me avise.

## 3. AUTO-UPDATE VIA GITHUB

Três peças trabalham juntas:

### a) `.github/workflows/deploy.yml`
A cada push em `main`:
- Injeta o SHA do commit como versão no `sw.js`
- Gera `version.json` com a versão atual
- Publica no GitHub Pages

**Ativar:**
1. GitHub → repositório → **Settings → Pages → Source: GitHub Actions**
2. Commit do workflow → primeiro deploy roda sozinho

### b) `sw.js` (substituir o atual)
A versão agora é `__APP_VERSION__` (placeholder reescrito pelo Actions).
Cada deploy = novo cache, e o SW só ativa após confirmação do usuário.

### c) `update-checker.js` (novo arquivo)
- Registra o SW
- A cada 60s consulta `version.json`
- Quando muda, mostra banner **"Nova versão disponível — Atualizar agora"**

**No `index.html`**, troque o registro antigo do SW por:
```html
<script src="update-checker.js?v=1" defer></script>
```
(e remova qualquer `navigator.serviceWorker.register(...)` que já exista no
`app.js` ou inline no `index.html`).

## Resumo de arquivos neste pacote

| Arquivo | O que fazer |
|---|---|
| `supabase-sync.js` | Substitui o atual (corrige bug fatal) |
| `supabase-config.js` | Use de modelo; cole o anon key real (JWT) |
| `sw.js` | Substitui o atual |
| `update-checker.js` | **NOVO** — adicionar e referenciar no index.html |
| `.github/workflows/deploy.yml` | **NOVO** — auto-deploy + bump de versão |

Depois disso o ciclo é: edita código → `git push` → Actions deploya em ~1 min →
usuários abertos no app veem o banner azul e clicam "Atualizar agora".
