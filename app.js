const STORE_KEY = "app-locacao-state-v2";
const BACKUP_KEY = "app-locacao-backups-v1";
const SUPABASE_SETTINGS_KEY = "app-locacao-supabase-settings-v1";
const today = new Date();
const oneDay = 86400000;

const iso = (offset = 0) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const uid = () => crypto.randomUUID();

const seedData = createSeed();
let state = loadState();
let route = new URLSearchParams(location.search).get("view") || "dashboard";
let searchTerm = "";

const navItems = [
  ["dashboard", "Painel", "▦", "Operacao imobiliaria"],
  ["apartments", "Imoveis", "⌂", "Inventario e disponibilidade"],
  ["clients", "Clientes", "◉", "CRM e perfil de demanda"],
  ["brokers", "Corretores", "◇", "Metas e produtividade"],
  ["calendar", "Agenda", "□", "Visitas, reservas e check-ins"],
  ["pipeline", "Pipeline", "↗", "Funil comercial"],
  ["leases", "Contratos", "§", "Contratos e garantias"],
  ["payments", "Financeiro", "$", "Receitas, vencimentos e repasses"],
  ["maintenance", "Manutencao", "!", "Ordens de servico"],
  ["inspections", "Vistorias", "✓", "Checklists de entrada e saida"],
  ["tasks", "Tarefas", "≡", "Rotina operacional"],
  ["documents", "Documentos", "▤", "Arquivos e pendencias"],
  ["reports", "Relatorios", "◫", "Indicadores de excelencia"],
  ["settings", "Gestao", "⚙", "Backup, importacao e versao"]
];

const schemas = {
  clients: [
    ["name", "Nome", "text"], ["phone", "Telefone", "text"], ["email", "E-mail", "email"],
    ["profile", "Perfil", "text"], ["budget", "Orcamento", "number"], ["status", "Status", "select", ["Novo", "Quente", "Negociando", "Contrato", "Perdido"]],
    ["source", "Origem", "text"], ["notes", "Observacoes", "textarea"]
  ],
  brokers: [
    ["name", "Nome", "text"], ["phone", "Telefone", "text"], ["email", "E-mail", "email"], ["region", "Regiao", "text"],
    ["goal", "Meta mensal", "number"], ["commission", "Comissao %", "number"], ["active", "Situacao", "select", ["Ativo", "Pausado"]]
  ],
  apartments: [
    ["code", "Codigo", "text"], ["title", "Titulo", "text"], ["address", "Endereco", "text"], ["district", "Bairro", "text"],
    ["type", "Tipo", "select", ["Apartamento", "Studio", "Cobertura", "Casa", "Flat"]], ["bedrooms", "Quartos", "number"], ["price", "Aluguel", "number"],
    ["condo", "Condominio", "number"], ["iptu", "IPTU", "number"], ["status", "Status", "select", ["Disponivel", "Reservado", "Ocupado", "Manutencao"]],
    ["owner", "Proprietario", "text"], ["score", "Score", "number"], ["portal", "Portal", "select", ["Nao publicado", "Publicado", "Destaque"]]
  ],
  bookings: [
    ["date", "Data", "date"], ["time", "Hora", "time"], ["type", "Tipo", "select", ["Visita", "Reserva", "Check-in", "Check-out", "Vistoria"]],
    ["apartment", "Imovel", "text"], ["client", "Cliente", "text"], ["broker", "Corretor", "text"], ["status", "Status", "select", ["Pendente", "Confirmado", "Concluido", "Cancelado"]], ["notes", "Notas", "textarea"]
  ],
  leases: [
    ["apartment", "Imovel", "text"], ["client", "Cliente", "text"], ["start", "Inicio", "date"], ["end", "Fim", "date"],
    ["rent", "Aluguel", "number"], ["guarantee", "Garantia", "select", ["Caucao", "Seguro fianca", "Fiador", "Titulo de capitalizacao"]],
    ["renewal", "Renovacao", "select", ["Nao iniciada", "Em negociacao", "Renovado", "Encerrar"]], ["status", "Status", "select", ["Em assinatura", "Ativo", "Encerrando", "Encerrado"]]
  ],
  payments: [
    ["due", "Vencimento", "date"], ["paidAt", "Pagamento", "date"], ["apartment", "Imovel", "text"], ["client", "Cliente", "text"],
    ["amount", "Valor", "number"], ["ownerTransfer", "Repasse", "number"], ["status", "Status", "select", ["Previsto", "Em aberto", "Pago", "Atrasado"]], ["method", "Metodo", "select", ["PIX", "Boleto", "Cartao", "Transferencia"]]
  ],
  maintenance: [
    ["opened", "Abertura", "date"], ["deadline", "Prazo", "date"], ["apartment", "Imovel", "text"], ["issue", "Ocorrencia", "textarea"],
    ["priority", "Prioridade", "select", ["Baixa", "Media", "Alta", "Critica"]], ["cost", "Custo estimado", "number"], ["responsible", "Responsavel", "text"], ["status", "Status", "select", ["Aberto", "Agendado", "Em andamento", "Concluido"]]
  ],
  inspections: [
    ["date", "Data", "date"], ["apartment", "Imovel", "text"], ["type", "Tipo", "select", ["Entrada", "Saida", "Semestral", "Preventiva"]],
    ["responsible", "Responsavel", "text"], ["score", "Nota", "number"], ["status", "Status", "select", ["Agendado", "Em andamento", "Aprovado", "Com ressalvas"]], ["notes", "Checklist", "textarea"]
  ],
  tasks: [
    ["due", "Prazo", "date"], ["title", "Tarefa", "text"], ["area", "Area", "select", ["Comercial", "Financeiro", "Operacao", "Juridico", "Proprietario"]],
    ["owner", "Responsavel", "text"], ["priority", "Prioridade", "select", ["Baixa", "Media", "Alta", "Critica"]], ["status", "Status", "select", ["Aberta", "Hoje", "Em andamento", "Concluida"]]
  ],
  documents: [
    ["due", "Prazo", "date"], ["name", "Documento", "text"], ["related", "Relacionado a", "text"], ["type", "Tipo", "select", ["Cliente", "Imovel", "Contrato", "Proprietario", "Financeiro"]],
    ["status", "Status", "select", ["Pendente", "Recebido", "Validado", "Vencido"]], ["notes", "Observacoes", "textarea"]
  ]
};

const collectionLabels = {
  clients: ["cliente", "Clientes"], brokers: ["corretor", "Corretores"], apartments: ["imovel", "Imoveis"],
  bookings: ["agendamento", "Agendamentos"], leases: ["contrato", "Contratos"], payments: ["lancamento financeiro", "Financeiro"],
  maintenance: ["ordem de manutencao", "Manutencao"], inspections: ["vistoria", "Vistorias"], tasks: ["tarefa", "Tarefas"], documents: ["documento", "Documentos"]
};

function createSeed() {
  const clients = [
    { id: uid(), name: "Marina Costa", phone: "(85) 99122-1001", email: "marina@email.com", profile: "Executiva em transferencia", budget: 5800, status: "Quente", source: "Indicacao", notes: "Quer vista mar e vaga coberta." },
    { id: uid(), name: "Rafael Lima", phone: "(85) 98844-2300", email: "rafael@email.com", profile: "Familia com 2 filhos", budget: 4200, status: "Negociando", source: "Instagram", notes: "Prioridade para escola e lazer." },
    { id: uid(), name: "Helena Duarte", phone: "(85) 99710-5531", email: "helena@email.com", profile: "Long stay corporativo", budget: 7600, status: "Contrato", source: "Empresa parceira", notes: "Contrato empresarial." }
  ];
  const brokers = [
    { id: uid(), name: "Bianca Torres", phone: "(85) 98777-1010", email: "bianca@locacao.com", region: "Meireles e Aldeota", goal: 8, commission: 6, active: "Ativo" },
    { id: uid(), name: "Caio Mendes", phone: "(85) 98666-2020", email: "caio@locacao.com", region: "Praia de Iracema", goal: 6, commission: 5, active: "Ativo" }
  ];
  const apartments = [
    { id: uid(), code: "AP-1204", title: "Vista mar mobiliado", address: "Av. Beira Mar, 1204", district: "Meireles", type: "Apartamento", bedrooms: 2, price: 5200, condo: 780, iptu: 220, status: "Disponivel", owner: "Ana Paula", score: 92, portal: "Destaque" },
    { id: uid(), code: "AP-0801", title: "Compacto premium", address: "Rua Silva Jatahy, 801", district: "Aldeota", type: "Studio", bedrooms: 1, price: 3400, condo: 520, iptu: 140, status: "Reservado", owner: "Grupo Atlante", score: 85, portal: "Publicado" },
    { id: uid(), code: "AP-1702", title: "Family club completo", address: "Rua Osvaldo Cruz, 1702", district: "Coco", type: "Apartamento", bedrooms: 3, price: 6900, condo: 980, iptu: 300, status: "Ocupado", owner: "Carlos Nobre", score: 89, portal: "Publicado" },
    { id: uid(), code: "AP-0305", title: "Studio para temporada", address: "Rua Dragao do Mar, 305", district: "Praia de Iracema", type: "Flat", bedrooms: 1, price: 2800, condo: 420, iptu: 110, status: "Manutencao", owner: "Lucia Braga", score: 76, portal: "Nao publicado" }
  ];
  return {
    clients, brokers, apartments,
    bookings: [
      { id: uid(), date: iso(1), time: "09:30", type: "Visita", apartment: "AP-1204", client: "Marina Costa", broker: "Bianca Torres", status: "Confirmado", notes: "Enviar localizacao antes." },
      { id: uid(), date: iso(3), time: "15:00", type: "Reserva", apartment: "AP-0801", client: "Rafael Lima", broker: "Caio Mendes", status: "Pendente", notes: "Aguardar caucao." },
      { id: uid(), date: iso(5), time: "11:00", type: "Check-in", apartment: "AP-1702", client: "Helena Duarte", broker: "Bianca Torres", status: "Confirmado", notes: "Levar termo de vistoria." }
    ],
    leases: [
      { id: uid(), apartment: "AP-1702", client: "Helena Duarte", start: iso(-21), end: iso(160), rent: 6900, guarantee: "Seguro fianca", renewal: "Nao iniciada", status: "Ativo" },
      { id: uid(), apartment: "AP-0801", client: "Rafael Lima", start: iso(8), end: iso(98), rent: 3400, guarantee: "Caucao", renewal: "Em negociacao", status: "Em assinatura" }
    ],
    payments: [
      { id: uid(), due: iso(-2), paidAt: iso(-1), apartment: "AP-1702", client: "Helena Duarte", amount: 6900, ownerTransfer: 6210, status: "Pago", method: "PIX" },
      { id: uid(), due: iso(4), paidAt: "", apartment: "AP-0801", client: "Rafael Lima", amount: 3400, ownerTransfer: 3060, status: "Em aberto", method: "Boleto" },
      { id: uid(), due: iso(11), paidAt: "", apartment: "AP-1204", client: "Marina Costa", amount: 5200, ownerTransfer: 4680, status: "Previsto", method: "Cartao" }
    ],
    maintenance: [
      { id: uid(), opened: iso(-4), deadline: iso(1), apartment: "AP-0305", issue: "Ar-condicionado sem gelar", priority: "Alta", cost: 480, responsible: "Equipe tecnica", status: "Em andamento" },
      { id: uid(), opened: iso(-1), deadline: iso(6), apartment: "AP-1702", issue: "Vistoria semestral", priority: "Media", cost: 0, responsible: "Bianca Torres", status: "Agendado" }
    ],
    inspections: [
      { id: uid(), date: iso(5), apartment: "AP-1702", type: "Entrada", responsible: "Bianca Torres", score: 94, status: "Agendado", notes: "Fotos, medidores, chaves, pintura e moveis." },
      { id: uid(), date: iso(12), apartment: "AP-0305", type: "Preventiva", responsible: "Equipe tecnica", score: 78, status: "Com ressalvas", notes: "Checar ar, box e fechadura." }
    ],
    tasks: [
      { id: uid(), due: iso(0), title: "Cobrar documento de garantia", area: "Juridico", owner: "Caio Mendes", priority: "Alta", status: "Hoje" },
      { id: uid(), due: iso(2), title: "Atualizar fotos do AP-0305", area: "Comercial", owner: "Bianca Torres", priority: "Media", status: "Aberta" },
      { id: uid(), due: iso(6), title: "Enviar repasse ao proprietario", area: "Financeiro", owner: "Administrativo", priority: "Alta", status: "Aberta" }
    ],
    documents: [
      { id: uid(), due: iso(2), name: "Comprovante de renda", related: "Rafael Lima", type: "Cliente", status: "Pendente", notes: "Solicitado por WhatsApp." },
      { id: uid(), due: iso(20), name: "Seguro fianca", related: "Helena Duarte", type: "Contrato", status: "Validado", notes: "Vigente ate o fim do contrato." }
    ]
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return structuredClone(seedData);
    return normalize(JSON.parse(saved));
  } catch {
    return structuredClone(seedData);
  }
}

function normalize(next) {
  const base = structuredClone(seedData);
  Object.keys(base).forEach((key) => {
    if (!Array.isArray(next[key])) next[key] = base[key];
  });
  return next;
}

function saveState(reason = "manual") {
  state.meta = { updatedAt: new Date().toISOString(), reason };
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  document.querySelector("#storageStatus").textContent = "Salvo agora";
  setTimeout(() => document.querySelector("#storageStatus").textContent = "Salvo neste dispositivo", 1800);
  window.LocacoesSupabaseSync?.queueSave?.(state);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateBR(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "";
}

function daysBetween(a, b) {
  return Math.ceil((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / oneDay);
}

function statusClass(value) {
  const v = String(value || "").toLowerCase();
  if (/(pago|ativo|confirmado|disponivel|concluido|aprovado|validado|recebido|renovado)/.test(v)) return "ok";
  if (/(pendente|aberto|assinatura|reservado|agendado|previsto|hoje|negociacao)/.test(v)) return "warn";
  if (/(atrasado|cancelado|critica|manutencao|vencido|ressalvas|encerrar)/.test(v)) return "danger";
  return "info";
}

function filtered(collection) {
  const items = state[collection] || [];
  if (!searchTerm) return items;
  return items.filter((item) => Object.values(item).join(" ").toLowerCase().includes(searchTerm.toLowerCase()));
}

function setRoute(next) {
  route = next;
  history.replaceState(null, "", `?view=${route}`);
  render();
}

function renderNav() {
  document.querySelector("#nav").innerHTML = navItems.map(([id, label, icon]) => `<button class="${route === id ? "active" : ""}" data-route="${id}" type="button"><span>${icon}</span>${label}</button>`).join("");
}

function render() {
  renderNav();
  const item = navItems.find(([id]) => id === route) || navItems[0];
  document.querySelector("#pageTitle").textContent = item[1];
  document.querySelector("#pageKicker").textContent = item[3];
  const app = document.querySelector("#app");
  const views = {
    dashboard, apartments, calendar: calendarView, pipeline: pipelineView, reports: reportsView, settings: settingsView
  };
  if (views[route]) app.innerHTML = views[route]();
  else if (schemas[route]) app.innerHTML = tableView(route, collectionLabels[route][1], columnsFor(route));
  else app.innerHTML = dashboard();
}

function columnsFor(collection) {
  const map = {
    clients: ["name", "phone", "email", "profile", "budget", "status"],
    brokers: ["name", "phone", "email", "region", "goal", "commission", "active"],
    leases: ["apartment", "client", "start", "end", "rent", "guarantee", "renewal", "status"],
    payments: ["due", "paidAt", "apartment", "client", "amount", "ownerTransfer", "status"],
    maintenance: ["opened", "deadline", "apartment", "issue", "priority", "cost", "status"],
    inspections: ["date", "apartment", "type", "responsible", "score", "status"],
    tasks: ["due", "title", "area", "owner", "priority", "status"],
    documents: ["due", "name", "related", "type", "status"]
  };
  return map[collection] || schemas[collection].map(([key]) => key);
}

function kpis() {
  const activeRent = state.leases.filter((l) => l.status === "Ativo").reduce((sum, l) => sum + Number(l.rent), 0);
  const available = state.apartments.filter((a) => a.status === "Disponivel").length;
  const occupied = state.apartments.filter((a) => a.status === "Ocupado").length;
  const openDebt = state.payments.filter((p) => p.status === "Atrasado" || (p.status === "Em aberto" && p.due < iso())).reduce((sum, p) => sum + Number(p.amount), 0);
  const openMaintenance = state.maintenance.filter((m) => m.status !== "Concluido").length;
  const conversion = Math.round((state.clients.filter((c) => ["Contrato"].includes(c.status)).length / Math.max(state.clients.length, 1)) * 100);
  const occupancy = Math.round((occupied / Math.max(state.apartments.length, 1)) * 100);
  return { activeRent, available, occupied, openDebt, openMaintenance, conversion, occupancy };
}

function dashboard() {
  const m = kpis();
  return `
    <div class="grid stats">
      ${metric("Receita ativa", money(m.activeRent), "contratos recorrentes", "ok")}
      ${metric("Ocupacao", `${m.occupancy}%`, `${m.occupied}/${state.apartments.length} imoveis`, "info")}
      ${metric("Inadimplencia", money(m.openDebt), "em aberto ou vencido", m.openDebt ? "danger" : "ok")}
      ${metric("Manutencoes", m.openMaintenance, "ordens em aberto", m.openMaintenance ? "warn" : "ok")}
    </div>
    <div class="grid two-col">
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Comando diario</p><h2>Agenda e prioridades</h2></div><button class="primary-button" data-add="bookings" type="button">+ Agendar</button></div>
        <div class="list">${state.bookings.slice().sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 6).map(eventRow).join("") || empty("Nenhum compromisso.")}</div>
      </section>
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Risco operacional</p><h2>Alertas inteligentes</h2></div></div>
        <div class="list">${alerts().map(alertRow).join("") || empty("Nenhum alerta critico.")}</div>
      </section>
    </div>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Carteira</p><h2>Imoveis com melhor potencial</h2></div><button class="ghost-button" data-route="apartments" type="button">Ver carteira</button></div>
      <div class="grid three-col">${state.apartments.slice().sort((a,b) => b.score - a.score).slice(0, 3).map(apartmentCard).join("")}</div>
    </section>
  `;
}

function metric(label, value, hint, cls = "info") {
  return `<article class="panel metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function alerts() {
  const items = [];
  state.payments.filter((p) => p.status !== "Pago" && p.due <= iso(5)).forEach((p) => items.push({ title: `Recebimento ${p.apartment}`, text: `${p.client} vence em ${dateBR(p.due)} - ${money(p.amount)}`, cls: p.due < iso() ? "danger" : "warn" }));
  state.leases.filter((l) => l.status === "Ativo" && daysBetween(iso(), l.end) <= 60).forEach((l) => items.push({ title: `Renovacao ${l.apartment}`, text: `${l.client} encerra em ${dateBR(l.end)}`, cls: "warn" }));
  state.documents.filter((d) => d.status === "Pendente" || d.status === "Vencido").forEach((d) => items.push({ title: d.name, text: `${d.related} - prazo ${dateBR(d.due)}`, cls: d.status === "Vencido" ? "danger" : "warn" }));
  state.tasks.filter((t) => t.status !== "Concluida" && t.due <= iso(1)).forEach((t) => items.push({ title: t.title, text: `${t.owner} - ${dateBR(t.due)}`, cls: "info" }));
  return items.slice(0, 8);
}

function alertRow(item) {
  return `<div class="list-row"><div><strong>${item.title}</strong><p class="muted">${item.text}</p></div><span class="status ${item.cls}">acao</span></div>`;
}

function eventRow(e) {
  return `<div class="list-row"><div><strong>${dateBR(e.date)} ${e.time} · ${e.type}</strong><p class="muted">${e.apartment} · ${e.client} · ${e.broker}</p></div><span class="status ${statusClass(e.status)}">${e.status}</span></div>`;
}

function apartments() {
  const items = filtered("apartments");
  return `<section class="panel">
    <div class="toolbar"><div><p class="eyebrow">Inventario inteligente</p><h2>Imoveis</h2></div><button class="primary-button" data-add="apartments" type="button">+ Novo imovel</button></div>
    <div class="grid three-col">${items.map(apartmentCard).join("") || empty("Nenhum imovel encontrado.")}</div>
  </section>`;
}

function apartmentCard(a) {
  const total = Number(a.price || 0) + Number(a.condo || 0) + Number(a.iptu || 0);
  return `<article class="card apartment-card">
    <div class="apartment-cover"><span>${a.code}</span></div>
    <div class="card-head"><strong>${a.title}</strong><span class="status ${statusClass(a.status)}">${a.status}</span></div>
    <p class="muted">${a.address} · ${a.district}</p>
    <div class="apartment-meta">
      <span class="status info">${a.type}</span><span class="status info">${a.bedrooms} quarto(s)</span><span class="status ok">${money(total)}</span><span class="status warn">Score ${a.score}</span><span class="status ${a.portal === "Destaque" ? "ok" : "info"}">${a.portal}</span>
    </div>
  </article>`;
}

function tableView(collection, title, columns) {
  const rows = filtered(collection);
  return `<section class="panel">
    <div class="toolbar">
      <div><p class="eyebrow">Base de dados</p><h2>${title}</h2></div>
      <div class="filters"><button class="primary-button" data-add="${collection}" type="button">+ Adicionar</button><button class="ghost-button" data-export="${collection}" type="button">Exportar CSV</button></div>
    </div>
    <div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${labelFor(collection, c)}</th>`).join("")}<th>Acoes</th></tr></thead><tbody>${rows.map((row) => tableRow(collection, columns, row)).join("")}</tbody></table></div>
    ${rows.length ? "" : empty("Nenhum registro encontrado.")}
  </section>`;
}

function tableRow(collection, columns, row) {
  return `<tr>${columns.map((c) => `<td>${formatCell(c, row[c])}</td>`).join("")}<td><button class="ghost-button" data-edit="${collection}:${row.id}" type="button">Editar</button></td></tr>`;
}

function labelFor(collection, key) {
  return schemas[collection]?.find(([id]) => id === key)?.[1] || key;
}

function formatCell(key, value) {
  if (["budget", "price", "rent", "amount", "ownerTransfer", "cost", "condo", "iptu"].includes(key)) return money(value);
  if (["date", "start", "end", "due", "opened", "deadline", "paidAt"].includes(key)) return dateBR(value);
  if (["status", "priority", "active", "renewal"].includes(key)) return `<span class="status ${statusClass(value)}">${value || "-"}</span>`;
  return value ?? "";
}

function calendarView() {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ out: true });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
  while (cells.length % 7 !== 0) cells.push({ out: true });
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Calendario operacional</p><h2>${today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2></div><button class="primary-button" data-add="bookings" type="button">+ Agendar</button></div><div class="calendar">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((d) => `<div class="weekday">${d}</div>`).join("")}${cells.map(dayCell).join("")}</div></section>`;
}

function dayCell(cell) {
  const events = state.bookings.filter((b) => b.date === cell.iso);
  return `<div class="day ${cell.out ? "out" : ""}"><strong>${cell.day || ""}</strong>${events.map((e) => `<span class="event ${e.status === "Cancelado" ? "blocked" : ""}">${e.time} ${e.type} · ${e.apartment}</span>`).join("")}</div>`;
}

function pipelineView() {
  const lanes = ["Novo", "Quente", "Negociando", "Contrato", "Perdido"];
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Vendas consultivas</p><h2>Pipeline de locacao</h2></div><button class="primary-button" data-add="clients" type="button">+ Lead</button></div><div class="pipeline">${lanes.map((lane) => `<div class="lane"><h3>${lane}<span>${state.clients.filter((c) => c.status === lane).length}</span></h3>${state.clients.filter((c) => c.status === lane).map((c) => `<article class="card deal"><strong>${c.name}</strong><span>${c.profile}</span><span class="muted">${money(c.budget)} · ${c.source}</span></article>`).join("")}</div>`).join("")}</div></section>`;
}

function reportsView() {
  const m = kpis();
  const paid = state.payments.filter((p) => p.status === "Pago").reduce((sum, p) => sum + Number(p.amount), 0);
  const forecast = state.payments.filter((p) => p.status !== "Pago").reduce((sum, p) => sum + Number(p.amount), 0);
  const averageTicket = state.leases.length ? state.leases.reduce((sum, l) => sum + Number(l.rent), 0) / state.leases.length : 0;
  const maintenanceCost = state.maintenance.reduce((sum, mtn) => sum + Number(mtn.cost || 0), 0);
  const brokerRows = state.brokers.map((b) => {
    const visits = state.bookings.filter((x) => x.broker === b.name).length;
    const contracts = state.leases.filter((x) => state.bookings.some((bk) => bk.client === x.client && bk.broker === b.name)).length;
    return { name: b.name, visits, contracts, goal: b.goal, performance: Math.round((contracts / Math.max(Number(b.goal), 1)) * 100) };
  });
  return `<div class="grid stats">
      ${metric("Recebido", money(paid), "caixa confirmado", "ok")}
      ${metric("A receber", money(forecast), "previsao financeira", "warn")}
      ${metric("Ticket medio", money(averageTicket), "contratos ativos e futuros", "info")}
      ${metric("Conversao CRM", `${m.conversion}%`, "leads para contrato", "ok")}
    </div>
    <div class="grid two-col">
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Excelencia</p><h2>Score operacional</h2></div><button class="ghost-button" onclick="window.print()" type="button">Imprimir</button></div>
        ${scoreBar("Ocupacao da carteira", m.occupancy)}
        ${scoreBar("Conversao comercial", m.conversion)}
        ${scoreBar("Qualidade de inventario", Math.round(avg(state.apartments.map((a) => a.score))))}
        ${scoreBar("Vistorias aprovadas", Math.round((state.inspections.filter((i) => i.status === "Aprovado" || i.status === "Agendado").length / Math.max(state.inspections.length, 1)) * 100))}
      </section>
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Proprietarios</p><h2>Resumo de repasses</h2></div></div>
        <div class="list">${ownerStatements().map((o) => `<div class="list-row"><div><strong>${o.owner}</strong><p class="muted">${o.units} unidade(s) · ${money(o.gross)} bruto</p></div><span class="status ok">${money(o.transfer)}</span></div>`).join("")}</div>
      </section>
    </div>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Performance</p><h2>Corretores</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Corretor</th><th>Visitas</th><th>Contratos</th><th>Meta</th><th>Performance</th></tr></thead><tbody>${brokerRows.map((b) => `<tr><td>${b.name}</td><td>${b.visits}</td><td>${b.contracts}</td><td>${b.goal}</td><td><span class="status ${b.performance >= 80 ? "ok" : "warn"}">${b.performance}%</span></td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Custos</p><h2>Manutencao e risco</h2></div></div>
      <div class="grid stats">${metric("Custo previsto", money(maintenanceCost), "ordens cadastradas", "warn")}${metric("Ordens criticas", state.maintenance.filter((x) => x.priority === "Critica" || x.priority === "Alta").length, "alta prioridade", "danger")}${metric("Docs pendentes", state.documents.filter((x) => x.status === "Pendente" || x.status === "Vencido").length, "regularizacao", "warn")}${metric("Tarefas abertas", state.tasks.filter((x) => x.status !== "Concluida").length, "rotina ativa", "info")}</div>
    </section>`;
}

function scoreBar(label, value) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="score-row"><div><strong>${label}</strong><span>${v}%</span></div><div class="score-track"><i style="width:${v}%"></i></div></div>`;
}

function avg(values) {
  return values.length ? values.reduce((a, b) => a + Number(b || 0), 0) / values.length : 0;
}

function ownerStatements() {
  return state.apartments.map((apt) => {
    const gross = state.payments.filter((p) => p.apartment === apt.code).reduce((sum, p) => sum + Number(p.amount), 0);
    const transfer = state.payments.filter((p) => p.apartment === apt.code).reduce((sum, p) => sum + Number(p.ownerTransfer), 0);
    return { owner: apt.owner, units: 1, gross, transfer };
  }).filter((x) => x.gross || x.transfer);
}

function settingsView() {
  const counts = Object.keys(schemas).map((key) => `<div class="list-row"><strong>${collectionLabels[key][1]}</strong><span class="status info">${state[key].length}</span></div>`).join("");
  const syncSettings = loadSupabaseSettings();
  const syncUser = window.LocacoesSupabaseSync?.getUser?.();
  const syncStatus = window.LocacoesSupabaseSync?.getStatus?.() || "Aguardando configuracao.";
  return `<div class="grid two-col">
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Governanca</p><h2>Backup e dados</h2></div></div>
      <div class="action-grid">
        <button class="primary-button" data-backup="download" type="button">Baixar backup JSON</button>
        <button class="ghost-button" data-backup="import" type="button">Importar backup</button>
        <button class="ghost-button" data-backup="restore" type="button">Restaurar dados exemplo</button>
        <button class="ghost-button" data-backup="snapshot" type="button">Salvar ponto de restauracao</button>
      </div>
      <p class="muted block-help">Os dados ficam no navegador deste dispositivo. Use o backup JSON antes de grandes alteracoes ou antes de trocar de computador.</p>
    </section>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Saude da base</p><h2>Registros</h2></div></div>
      <div class="list">${counts}</div>
    </section>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Supabase</p><h2>Sincronizacao em nuvem</h2></div><span class="status ${syncUser ? "ok" : "warn"}">${syncUser ? "conectado" : "desconectado"}</span></div>
      <div class="form-grid compact-form">
        <div class="field full"><label for="supabase-url">URL do projeto</label><input id="supabase-url" type="url" value="${syncSettings.url || ""}" placeholder="https://xxxx.supabase.co" /></div>
        <div class="field full"><label for="supabase-key">Publishable ou anon public key</label><input id="supabase-key" type="password" value="${syncSettings.anonKey || ""}" placeholder="sb_publishable_... ou eyJ..." /></div>
        <div class="field"><label for="supabase-email">E-mail</label><input id="supabase-email" type="email" value="${syncSettings.email || ""}" placeholder="voce@email.com" /></div>
        <div class="field"><label for="supabase-password">Senha</label><input id="supabase-password" type="password" placeholder="Senha do usuario no Supabase" /></div>
      </div>
      <div class="action-grid cloud-actions">
        <button class="primary-button" data-sync="save-config" type="button">Salvar configuracao</button>
        <button class="ghost-button" data-sync="login" type="button">Entrar</button>
        <button class="ghost-button" data-sync="pull" type="button">Baixar nuvem</button>
        <button class="ghost-button" data-sync="push" type="button">Enviar agora</button>
        <button class="ghost-button" data-sync="logout" type="button">Sair</button>
      </div>
      <p class="muted block-help" id="cloud-sync-status">${syncStatus}</p>
    </section>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Banco</p><h2>Como configurar</h2></div></div>
      <p class="muted block-help">No Supabase, rode o arquivo <strong>supabase-schema.sql</strong> no SQL Editor. A URL do projeto e a publishable key ja ficam preenchidas para o projeto gestao-locacoes. Crie usuarios em Authentication para sincronizar com seguranca por RLS.</p>
    </section>
  </div>`;
}

function loadSupabaseSettings() {
  const defaults = window.LOCACOES_SUPABASE_DEFAULTS || {};
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(SUPABASE_SETTINGS_KEY)) || {}) };
  } catch {
    return { ...defaults };
  }
}

function saveSupabaseSettingsFromForm() {
  const settings = {
    url: document.querySelector("#supabase-url")?.value.trim() || window.LOCACOES_SUPABASE_DEFAULTS?.url || "",
    anonKey: document.querySelector("#supabase-key")?.value.trim() || window.LOCACOES_SUPABASE_DEFAULTS?.anonKey || "",
    email: document.querySelector("#supabase-email")?.value.trim() || ""
  };
  localStorage.setItem(SUPABASE_SETTINGS_KEY, JSON.stringify(settings));
  window.LocacoesSupabaseSync?.configure?.(settings);
  toast("Configuracao Supabase salva.");
  render();
}

function getSupabaseLogin() {
  return {
    email: document.querySelector("#supabase-email")?.value.trim() || loadSupabaseSettings().email || "",
    password: document.querySelector("#supabase-password")?.value || ""
  };
}

function setCloudStatus(text) {
  const el = document.querySelector("#cloud-sync-status");
  if (el) el.textContent = text;
  document.querySelector("#storageStatus").textContent = text;
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function openForm(collection, id = null) {
  const dialog = document.querySelector("#recordDialog");
  const fields = document.querySelector("#formFields");
  const record = id ? state[collection].find((item) => item.id === id) : {};
  const label = collectionLabels[collection]?.[0] || "registro";
  dialog.dataset.collection = collection;
  dialog.dataset.id = id || "";
  document.querySelector("#dialogTitle").textContent = id ? `Editar ${label}` : `Novo ${label}`;
  fields.innerHTML = schemas[collection].map(([key, labelText, type, options]) => fieldHtml(key, labelText, type, options, record?.[key])).join("");
  dialog.showModal();
}

function fieldHtml(key, labelText, type, options, rawValue) {
  const value = rawValue ?? "";
  const full = type === "textarea" || ["address", "issue", "notes"].includes(key) ? " full" : "";
  if (type === "select") return `<div class="field${full}"><label for="${key}">${labelText}</label><select id="${key}" name="${key}">${options.map((op) => `<option ${op === value ? "selected" : ""}>${op}</option>`).join("")}</select></div>`;
  if (type === "textarea") return `<div class="field${full}"><label for="${key}">${labelText}</label><textarea id="${key}" name="${key}">${value}</textarea></div>`;
  return `<div class="field${full}"><label for="${key}">${labelText}</label><input id="${key}" name="${key}" type="${type}" value="${value}" ${type !== "date" ? "required" : ""} /></div>`;
}

function submitForm(event) {
  event.preventDefault();
  const dialog = document.querySelector("#recordDialog");
  const collection = dialog.dataset.collection;
  const id = dialog.dataset.id;
  const record = Object.fromEntries(new FormData(event.currentTarget).entries());
  Object.keys(record).forEach((key) => {
    if (["budget", "price", "rent", "amount", "ownerTransfer", "cost", "bedrooms", "goal", "score", "commission", "condo", "iptu"].includes(key)) record[key] = Number(record[key] || 0);
  });
  if (id) state[collection] = state[collection].map((item) => item.id === id ? { ...item, ...record } : item);
  else state[collection].push({ id: uid(), ...record });
  saveState("form_save");
  dialog.close();
  render();
  toast("Registro salvo.");
}

function exportCSV(collection) {
  const rows = state[collection];
  const keys = Object.keys(rows[0] || {});
  const csv = [keys.join(";"), ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(";"))].join("\n");
  download(`${collection}.csv`, csv, "text/csv;charset=utf-8");
}

function backupDownload() {
  download(`app-locacao-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("Backup gerado.");
}

function saveSnapshot() {
  const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
  backups.unshift({ createdAt: new Date().toISOString(), state });
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, 5)));
  toast("Ponto de restauracao salvo.");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalize(JSON.parse(reader.result));
      saveState("import");
      render();
      toast("Backup importado.");
    } catch {
      toast("Arquivo de backup invalido.");
    }
  };
  reader.readAsText(file);
}

function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 2200);
}

document.addEventListener("click", (event) => {
  const routeBtn = event.target.closest("[data-route]");
  if (routeBtn) setRoute(routeBtn.dataset.route);
  const addBtn = event.target.closest("[data-add]");
  if (addBtn) openForm(addBtn.dataset.add);
  const editBtn = event.target.closest("[data-edit]");
  if (editBtn) {
    const [collection, id] = editBtn.dataset.edit.split(":");
    openForm(collection, id);
  }
  const exportBtn = event.target.closest("[data-export]");
  if (exportBtn) exportCSV(exportBtn.dataset.export);
  const backupBtn = event.target.closest("[data-backup]");
  if (backupBtn) {
    const action = backupBtn.dataset.backup;
    if (action === "download") backupDownload();
    if (action === "import") document.querySelector("#importFile").click();
    if (action === "snapshot") saveSnapshot();
    if (action === "restore" && confirm("Substituir os dados atuais pelos exemplos iniciais?")) {
      state = structuredClone(seedData);
      saveState("restore_seed");
      render();
      toast("Dados exemplo restaurados.");
    }
  }
  const syncBtn = event.target.closest("[data-sync]");
  if (syncBtn) handleSyncAction(syncBtn.dataset.sync);
});

document.querySelector("#recordForm").addEventListener("submit", submitForm);
document.querySelector("#quickAddBtn").addEventListener("click", () => openForm(route in schemas ? route : "clients"));
document.querySelector("#globalSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  render();
});
document.querySelector("#importFile").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importBackup(file);
  event.target.value = "";
});

render();

async function handleSyncAction(action) {
  try {
    if (action === "save-config") {
      saveSupabaseSettingsFromForm();
      return;
    }
    if (!window.LocacoesSupabaseSync) {
      toast("Modulo Supabase nao carregado.");
      return;
    }
    if (action === "login") {
      saveSupabaseSettingsFromForm();
      const login = getSupabaseLogin();
      await window.LocacoesSupabaseSync.signIn(login.email, login.password);
      const remote = await window.LocacoesSupabaseSync.loadRemote();
      if (remote?.data) {
        state = normalize(remote.data);
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } else {
        await window.LocacoesSupabaseSync.saveNow(state);
      }
      render();
      toast("Supabase conectado.");
    }
    if (action === "pull") {
      const remote = await window.LocacoesSupabaseSync.loadRemote();
      if (!remote?.data) {
        toast("Nenhum dado na nuvem.");
        return;
      }
      state = normalize(remote.data);
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      render();
      toast("Dados baixados da nuvem.");
    }
    if (action === "push") {
      await window.LocacoesSupabaseSync.saveNow(state);
      toast("Dados enviados ao Supabase.");
    }
    if (action === "logout") {
      await window.LocacoesSupabaseSync.signOut();
      render();
      toast("Sessao Supabase encerrada.");
    }
  } catch (error) {
    setCloudStatus(error.message || "Falha na sincronizacao.");
    toast("Falha no Supabase.");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!window.LocacoesSupabaseSync) return;
  window.LocacoesSupabaseSync.configure(loadSupabaseSettings());
  window.LocacoesSupabaseSync.onStatus(setCloudStatus);
  try {
    await window.LocacoesSupabaseSync.restoreSession();
    if (window.LocacoesSupabaseSync.getUser()) {
      const remote = await window.LocacoesSupabaseSync.loadRemote();
      if (remote?.data && (!state.meta?.updatedAt || remote.updatedAt > state.meta.updatedAt)) {
        state = normalize(remote.data);
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        render();
      }
    }
  } catch {
    setCloudStatus("Supabase aguardando login.");
  }
});
