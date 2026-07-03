const STORE_KEY = "app-locacao-state-v2";
const BACKUP_KEY = "app-locacao-backups-v1";
const SUPABASE_SETTINGS_KEY = "app-locacao-supabase-settings-v1";
const OFFLINE_USER_KEY = "app-locacao-last-online-user-v1";
const APP_VERSION_LABEL = "v2.1.10 temporada";
const WEB_ACCESS_URL = "https://jedsonpc.github.io/locacoes/";
const oneDay = 86400000;

const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthIso = () => todayIso().slice(0, 7);
const uid = () => crypto.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let route = new URLSearchParams(location.search).get("view") || "dashboard";
let searchTerm = "";

const navItems = [
  ["dashboard", "Painel", "P", "Operacao de temporada"],
  ["contracts", "Contratos", "C", "Reservas e estadias"],
  ["calendar", "Calendario", "A", "Ocupacao mensal"],
  ["apartments", "Apartamentos", "I", "Unidades e capacidade"],
  ["clients", "Clientes", "H", "Hospedes e origem"],
  ["brokers", "Corretores", "R", "Comissoes"],
  ["expenses", "Despesas", "$", "Custos por unidade"],
  ["reports", "Relatorios", "D", "Resultado e indicadores"],
  ["settings", "Gestao", "G", "Backup, nuvem e versao"]
];

const collectionLabels = {
  apartments: ["apartamento", "Apartamentos"],
  clients: ["cliente", "Clientes"],
  brokers: ["corretor", "Corretores"],
  contracts: ["contrato", "Contratos"],
  expenses: ["despesa", "Despesas"]
};

function parseDate(value) {
  const [year, month, day] = String(value || todayIso()).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value, days) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateBR(value) {
  return value ? dateFmt.format(parseDate(value)) : "-";
}

function money(value) {
  return moneyFmt.format(Number(value || 0));
}

function toNumber(value) {
  return Number(String(value ?? "").replace(",", ".")) || 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function nights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((parseDate(checkOut) - parseDate(checkIn)) / oneDay));
}

function monthRange(month) {
  const [year, monthIndex] = String(month || monthIso()).split("-").map(Number);
  return {
    year,
    monthIndex,
    start: new Date(Date.UTC(year, monthIndex - 1, 1)),
    end: new Date(Date.UTC(year, monthIndex, 0))
  };
}

function getById(collection, id) {
  return state[collection]?.find((item) => item.id === id);
}

function createSeed() {
  const apt1 = { id: uid(), name: "Apartamento Vista Mar 301", address: "Orla central", type: "Apartamento", status: "ativo", rooms: 2, maxGuests: 6, baseDaily: 420, cleaningFee: 180, notes: "Ideal para familias; aceita pet pequeno mediante aprovacao." };
  const apt2 = { id: uid(), name: "Studio Executivo 1207", address: "Centro", type: "Studio", status: "ativo", rooms: 1, maxGuests: 3, baseDaily: 260, cleaningFee: 120, notes: "Alta procura para estadias curtas." };
  const client = { id: uid(), name: "Marina Azevedo", document: "000.000.000-00", phone: "(85) 99999-0000", email: "marina@email.com", origin: "Instagram", notes: "Preferencia por check-in antecipado." };
  const broker = { id: uid(), name: "Carlos Lima", phone: "(85) 98888-0000", email: "carlos@corretor.com", commissionDefault: 12, status: "ativo", notes: "" };
  const checkIn = todayIso();
  const checkOut = addDays(checkIn, 5);
  return {
    apartments: [apt1, apt2],
    clients: [client],
    brokers: [broker],
    contracts: [{ id: uid(), code: "CTR-EXEMPLO", status: "confirmada", clientId: client.id, apartmentId: apt1.id, brokerId: broker.id, brokerPercent: 12, checkIn, checkOut, guests: 2, children: 1, pets: "nao", paymentStatus: "parcial", dailyRate: 450, cleaningFee: 180, discount: 0, deposit: 900, notes: "Contrato de exemplo." }],
    expenses: [{ id: uid(), date: todayIso(), apartmentId: apt1.id, category: "Limpeza", amount: 160, paid: "pago", description: "Limpeza pos-hospedagem." }],
    settings: { month: monthIso(), reportMonth: monthIso(), calendarApartment: "", reportApartment: "" }
  };
}

const seedData = createSeed();
let state = loadState();

function normalize(next) {
  const base = structuredClone(seedData);
  const incoming = next && typeof next === "object" ? next : {};

  if (Array.isArray(incoming.leases) || Array.isArray(incoming.payments) || Array.isArray(incoming.bookings)) {
    return migrateLongTermState(incoming, base);
  }

  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key])) incoming[key] = Array.isArray(incoming[key]) ? incoming[key] : base[key];
  }
  incoming.settings = { ...base.settings, ...(incoming.settings || {}) };
  return incoming;
}

function migrateLongTermState(oldState, base) {
  const apartments = Array.isArray(oldState.apartments) ? oldState.apartments.map((apt) => ({
    id: apt.id || uid(),
    name: apt.title || apt.name || apt.code || "Apartamento",
    address: apt.address || "",
    type: apt.type || "Apartamento",
    status: statusToSeason(apt.status),
    rooms: toNumber(apt.bedrooms || apt.rooms),
    maxGuests: toNumber(apt.maxGuests || Math.max(2, toNumber(apt.bedrooms) * 2)),
    baseDaily: toNumber(apt.baseDaily || apt.price),
    cleaningFee: toNumber(apt.cleaningFee),
    notes: apt.notes || [apt.code, apt.district, apt.owner].filter(Boolean).join(" | ")
  })) : base.apartments;

  const clients = Array.isArray(oldState.clients) ? oldState.clients.map((client) => ({
    id: client.id || uid(),
    name: client.name || "Cliente",
    document: client.document || "",
    phone: client.phone || "",
    email: client.email || "",
    origin: client.source || client.origin || "Direto",
    notes: client.notes || client.profile || ""
  })) : base.clients;

  const brokers = Array.isArray(oldState.brokers) ? oldState.brokers.map((broker) => ({
    id: broker.id || uid(),
    name: broker.name || "Corretor",
    phone: broker.phone || "",
    email: broker.email || "",
    commissionDefault: toNumber(broker.commission || broker.commissionDefault),
    status: String(broker.active || broker.status || "ativo").toLowerCase().startsWith("paus") ? "inativo" : "ativo",
    notes: broker.region || broker.notes || ""
  })) : base.brokers;

  const contracts = Array.isArray(oldState.leases) ? oldState.leases.map((lease) => {
    const apt = apartments.find((item) => [item.name, item.notes].join(" ").includes(lease.apartment)) || apartments[0];
    const client = clients.find((item) => item.name === lease.client) || clients[0];
    return {
      id: lease.id || uid(),
      code: `CTR-${String(lease.id || uid()).slice(0, 6).toUpperCase()}`,
      status: lease.status === "Encerrado" ? "finalizada" : "confirmada",
      clientId: client?.id || "",
      apartmentId: apt?.id || "",
      brokerId: "",
      brokerPercent: 0,
      checkIn: lease.start || todayIso(),
      checkOut: lease.end || addDays(todayIso(), 3),
      guests: 2,
      children: 0,
      pets: "nao",
      paymentStatus: "pendente",
      dailyRate: toNumber(lease.rent),
      cleaningFee: 0,
      discount: 0,
      deposit: 0,
      notes: `Migrado do contrato de locacao. Garantia: ${lease.guarantee || "-"}.`
    };
  }) : base.contracts;

  const expenses = Array.isArray(oldState.maintenance) ? oldState.maintenance.map((item) => ({
    id: item.id || uid(),
    date: item.opened || todayIso(),
    apartmentId: apartments.find((apt) => [apt.name, apt.notes].join(" ").includes(item.apartment))?.id || "",
    category: "Manutencao",
    amount: toNumber(item.cost),
    paid: item.status === "Concluido" ? "pago" : "pendente",
    description: item.issue || "Manutencao migrada"
  })) : base.expenses;

  return { apartments, clients, brokers, contracts, expenses, settings: base.settings, meta: oldState.meta };
}

function statusToSeason(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("manut")) return "manutencao";
  if (text.includes("inativo")) return "inativo";
  return "ativo";
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

function saveState(reason = "manual") {
  state.meta = { updatedAt: new Date().toISOString(), reason };
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  const status = document.querySelector("#storageStatus");
  if (status) {
    status.textContent = "Salvo agora";
    setTimeout(() => status.textContent = "Salvo neste dispositivo", 1800);
  }
  window.LocacoesSupabaseSync?.queueSave?.(state);
}

function contractTotals(contract) {
  const stayNights = nights(contract.checkIn, contract.checkOut);
  const lodging = stayNights * toNumber(contract.dailyRate);
  const cleaning = toNumber(contract.cleaningFee);
  const discount = toNumber(contract.discount);
  const total = Math.max(0, lodging + cleaning - discount);
  const commission = total * (toNumber(contract.brokerPercent) / 100);
  const received = toNumber(contract.deposit);
  return { stayNights, lodging, cleaning, discount, total, commission, received, pending: Math.max(0, total - received) };
}

function contractTouchesMonth(contract, month) {
  const { start, end } = monthRange(month);
  return parseDate(contract.checkIn) <= end && parseDate(contract.checkOut) > start && contract.status !== "cancelada";
}

function occupancyDays(contract, month) {
  const { start, end } = monthRange(month);
  const begin = parseDate(contract.checkIn) > start ? parseDate(contract.checkIn) : start;
  const finishLimit = new Date(end);
  finishLimit.setUTCDate(finishLimit.getUTCDate() + 1);
  const finish = parseDate(contract.checkOut) < finishLimit ? parseDate(contract.checkOut) : finishLimit;
  return Math.max(0, Math.round((finish - begin) / oneDay));
}

function hasConflict(contract) {
  if (!contract.apartmentId || !contract.checkIn || !contract.checkOut || contract.status === "cancelada") return false;
  return state.contracts.some((other) => {
    if (other.id === contract.id || other.apartmentId !== contract.apartmentId || other.status === "cancelada") return false;
    return parseDate(contract.checkIn) < parseDate(other.checkOut) && parseDate(contract.checkOut) > parseDate(other.checkIn);
  });
}

function getMonthContracts(month, apartmentId = "") {
  return state.contracts.filter((contract) => (!apartmentId || contract.apartmentId === apartmentId) && contractTouchesMonth(contract, month));
}

function buildMetrics(month = monthIso(), apartmentId = "") {
  const contracts = getMonthContracts(month, apartmentId);
  const expenses = state.expenses.filter((expense) => expense.date?.startsWith(month) && (!apartmentId || expense.apartmentId === apartmentId));
  const revenue = contracts.reduce((sum, contract) => sum + contractTotals(contract).total, 0);
  const commission = contracts.reduce((sum, contract) => sum + contractTotals(contract).commission, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const occupied = contracts.reduce((sum, contract) => sum + occupancyDays(contract, month), 0);
  const apartmentCount = apartmentId ? 1 : Math.max(1, state.apartments.filter((apt) => apt.status !== "inativo").length);
  const daysInMonth = monthRange(month).end.getUTCDate() * apartmentCount;
  return { contracts, expenses, revenue, commission, expenseTotal, net: revenue - commission - expenseTotal, occupied, occupancy: daysInMonth ? occupied / daysInMonth : 0 };
}

function filtered(collection) {
  const items = state[collection] || [];
  if (!searchTerm) return items;
  const term = searchTerm.toLowerCase();
  return items.filter((item) => Object.values(item).join(" ").toLowerCase().includes(term));
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
  const views = { dashboard, contracts, calendar: calendarView, apartments, clients, brokers, expenses, reports: reportsView, settings: settingsView };
  document.querySelector("#app").innerHTML = (views[route] || dashboard)();
  updateTopbarAccess();
  bindViewEvents();
}

function metric(label, value, hint, cls = "info") {
  return `<article class="panel metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function dashboard() {
  const month = state.settings.month || monthIso();
  const m = buildMetrics(month);
  const conflicts = state.contracts.filter(hasConflict);
  const arrivals = state.contracts.filter((contract) => contract.checkIn >= todayIso() && contract.status !== "cancelada").sort((a, b) => a.checkIn.localeCompare(b.checkIn)).slice(0, 6);
  return `
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Mes de referencia</p><h2>Resultado da temporada</h2></div><div class="filters"><label class="field">Mes<input id="dashboardMonth" type="month" value="${month}"></label><button class="primary-button" data-add="contracts" type="button">+ Nova reserva</button></div></div>
      <div class="grid stats">
        ${metric("Receita no mes", money(m.revenue), `${m.contracts.length} contrato(s) no periodo`, "ok")}
        ${metric("Comissoes", money(m.commission), "corretores vinculados", "info")}
        ${metric("Despesas", money(m.expenseTotal), "custos lancados", m.expenseTotal ? "warn" : "ok")}
        ${metric("Resultado", money(m.net), `${Math.round(m.occupancy * 100)}% de ocupacao`, m.net >= 0 ? "ok" : "danger")}
      </div>
    </section>
    <div class="grid two-col">
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Chegadas</p><h2>Proximas estadias</h2></div><button class="ghost-button" data-route="calendar" type="button">Ver calendario</button></div>
        <div class="list">${arrivals.map(arrivalRow).join("") || empty("Nenhuma chegada futura.")}</div>
      </section>
      <section class="panel">
        <div class="toolbar"><div><p class="eyebrow">Alertas</p><h2>Gestao da ocupacao</h2></div></div>
        <div class="list">${conflicts.length ? conflicts.map((contract) => alertRow({ title: getById("apartments", contract.apartmentId)?.name || "Apartamento", text: `Conflito em ${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}`, cls: "danger" })).join("") : empty("Nenhum conflito de ocupacao.")}</div>
      </section>
    </div>
    <section class="panel">
      <div class="toolbar"><div><p class="eyebrow">Carteira</p><h2>Apartamentos ativos</h2></div><button class="ghost-button" data-route="apartments" type="button">Ver apartamentos</button></div>
      <div class="grid three-col">${state.apartments.filter((apt) => apt.status !== "inativo").slice(0, 6).map(apartmentCard).join("") || empty("Nenhum apartamento cadastrado.")}</div>
    </section>`;
}

function arrivalRow(contract) {
  const totals = contractTotals(contract);
  return `<div class="list-row"><div><strong>${dateBR(contract.checkIn)} - ${getById("clients", contract.clientId)?.name || "Cliente"}</strong><p class="muted">${getById("apartments", contract.apartmentId)?.name || "Apartamento"} - ${totals.stayNights} diaria(s) - ${money(totals.total)}</p></div><span class="status ${statusClass(contract.status)}">${contract.status}</span></div>`;
}

function alertRow(item) {
  return `<div class="list-row"><div><strong>${escapeHtml(item.title)}</strong><p class="muted">${escapeHtml(item.text)}</p></div><span class="status ${item.cls}">acao</span></div>`;
}

function apartmentCard(apt) {
  return `<article class="card apartment-card"><div class="apartment-cover">${escapeHtml(apt.name)}</div><div class="card-head"><strong>${escapeHtml(apt.type || "Apartamento")}</strong><span class="status ${statusClass(apt.status)}">${escapeHtml(apt.status || "ativo")}</span></div><p class="muted">${escapeHtml(apt.address || "Endereco nao informado")}</p><div class="apartment-meta"><span class="status info">${apt.rooms || 0} quarto(s)</span><span class="status info">ate ${apt.maxGuests || 0}</span><span class="status ok">${money(apt.baseDaily)}</span></div><div class="filters"><button class="ghost-button" data-edit="apartments:${apt.id}" type="button">Editar</button></div></article>`;
}

function tableView(collection, title, headers, rowFn) {
  const items = filtered(collection);
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Cadastro</p><h2>${title}</h2></div><div class="filters"><button class="primary-button" data-add="${collection}" type="button">+ Novo</button><button class="ghost-button" data-export="${collection}" type="button">Exportar CSV</button></div></div>${items.length ? table(headers, items.map(rowFn)) : empty("Nenhum registro encontrado.")}</section>`;
}

function apartments() {
  const items = filtered("apartments");
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Unidades</p><h2>Apartamentos</h2></div><button class="primary-button" data-add="apartments" type="button">+ Novo apartamento</button></div><div class="grid three-col">${items.map(apartmentCard).join("") || empty("Nenhum apartamento encontrado.")}</div></section>`;
}

function clients() {
  return tableView("clients", "Clientes", ["Cliente", "Contato", "Origem", "Acoes"], (client) => [escapeHtml(client.name), `${escapeHtml(client.phone || "-")}<br>${escapeHtml(client.email || "")}`, escapeHtml(client.origin || "-"), actions("clients", client.id)]);
}

function brokers() {
  return tableView("brokers", "Corretores", ["Corretor", "Contato", "Comissao", "Status", "Acoes"], (broker) => [escapeHtml(broker.name), `${escapeHtml(broker.phone || "-")}<br>${escapeHtml(broker.email || "")}`, `${toNumber(broker.commissionDefault)}%`, status(broker.status), actions("brokers", broker.id)]);
}

function expenses() {
  return tableView("expenses", "Despesas", ["Data", "Apartamento", "Categoria", "Valor", "Status", "Acoes"], (expense) => [dateBR(expense.date), escapeHtml(getById("apartments", expense.apartmentId)?.name || "Geral"), escapeHtml(expense.category), money(expense.amount), status(expense.paid), actions("expenses", expense.id)]);
}

function contracts() {
  return tableView("contracts", "Contratos e estadias", ["Periodo", "Cliente", "Apartamento", "Hospedes", "Financeiro", "Status", "Acoes"], contractRow);
}

function contractRow(contract) {
  const totals = contractTotals(contract);
  return [
    `${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}<br>${totals.stayNights} diaria(s)`,
    escapeHtml(getById("clients", contract.clientId)?.name || "-"),
    `${escapeHtml(getById("apartments", contract.apartmentId)?.name || "-")}${hasConflict(contract) ? `<br><span class="status danger">Conflito</span>` : ""}`,
    `${contract.guests || 0} adulto(s)<br>${contract.children || 0} crianca(s), pet: ${contract.pets || "nao"}`,
    `${money(totals.total)}<br>Comissao: ${money(totals.commission)}<br>Pendente: ${money(totals.pending)}`,
    `${status(contract.status)}<br>${status(contract.paymentStatus)}`,
    actions("contracts", contract.id)
  ];
}

function calendarView() {
  const month = state.settings.month || monthIso();
  const apartmentId = state.settings.calendarApartment || "";
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Ocupacao</p><h2>Calendario mensal</h2></div><div class="filters"><label class="field">Mes<input id="calendarMonth" type="month" value="${month}"></label><label class="field">Apartamento<select id="calendarApartment">${optionList("apartments", apartmentId, "Todos")}</select></label><button class="ghost-button" onclick="window.print()" type="button">Imprimir</button></div></div><div class="calendar">${calendarHtml(month, apartmentId)}</div></section>`;
}

function calendarHtml(month, apartmentId) {
  const { start, end } = monthRange(month);
  const cells = [];
  for (let i = 0; i < start.getUTCDay(); i++) cells.push(null);
  for (let day = 1; day <= end.getUTCDate(); day++) cells.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => `<div class="weekday">${day}</div>`).join("");
  return weekdays + cells.map((date) => {
    if (!date) return `<div class="day out"></div>`;
    const bookings = state.contracts.filter((contract) => {
      if (apartmentId && contract.apartmentId !== apartmentId) return false;
      return contract.status !== "cancelada" && parseDate(contract.checkIn) <= date && parseDate(contract.checkOut) > date;
    });
    return `<div class="day"><strong>${date.getUTCDate()}</strong>${bookings.map((contract) => `<span class="event ${hasConflict(contract) ? "blocked" : ""}">${getById("clients", contract.clientId)?.name || "Cliente"} - ${getById("apartments", contract.apartmentId)?.name || "Apto"}</span>`).join("")}</div>`;
  }).join("");
}

function reportsView() {
  const month = state.settings.reportMonth || state.settings.month || monthIso();
  const apartmentId = state.settings.reportApartment || "";
  const m = buildMetrics(month, apartmentId);
  const brokerRows = state.brokers.map((broker) => {
    const contracts = m.contracts.filter((contract) => contract.brokerId === broker.id);
    const total = contracts.reduce((sum, contract) => sum + contractTotals(contract).commission, 0);
    return [escapeHtml(broker.name), contracts.length, money(total)];
  }).filter((row) => row[1]);
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Filtros</p><h2>Resultado e indicadores</h2></div><div class="filters"><label class="field">Mes<input id="reportMonth" type="month" value="${month}"></label><label class="field">Apartamento<select id="reportApartment">${optionList("apartments", apartmentId, "Todos")}</select></label><button class="ghost-button" onclick="window.print()" type="button">Imprimir</button></div></div></section>
    <div class="grid stats">${metric("Receita", money(m.revenue), `${m.contracts.length} contrato(s)`, "ok")}${metric("Comissoes", money(m.commission), "a pagar", "info")}${metric("Despesas", money(m.expenseTotal), "custos do mes", "warn")}${metric("Resultado", money(m.net), `${Math.round(m.occupancy * 100)}% ocupacao`, m.net >= 0 ? "ok" : "danger")}</div>
    <div class="grid two-col"><section class="panel"><div class="toolbar"><div><p class="eyebrow">Corretores</p><h2>Comissoes por corretor</h2></div></div>${brokerRows.length ? table(["Corretor", "Contratos", "Comissao"], brokerRows) : empty("Nenhuma comissao no periodo.")}</section><section class="panel"><div class="toolbar"><div><p class="eyebrow">Custos</p><h2>Despesas do mes</h2></div></div>${m.expenses.length ? table(["Data", "Apartamento", "Categoria", "Valor"], m.expenses.map((expense) => [dateBR(expense.date), escapeHtml(getById("apartments", expense.apartmentId)?.name || "Geral"), escapeHtml(expense.category), money(expense.amount)])) : empty("Nenhuma despesa no periodo.")}</section></div>
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Periodo</p><h2>Contratos no mes</h2></div></div>${m.contracts.length ? table(["Periodo", "Cliente", "Apartamento", "Hospedes", "Financeiro", "Status", "Acoes"], m.contracts.map(contractRow)) : empty("Nenhum contrato no periodo.")}</section>`;
}

function settingsView() {
  const counts = Object.keys(collectionLabels).map((key) => `<div class="list-row"><strong>${collectionLabels[key][1]}</strong><span class="status info">${state[key].length}</span></div>`).join("");
  const syncSettings = loadSupabaseSettings();
  const syncUser = window.LocacoesSupabaseSync?.getUser?.();
  const syncStatus = window.LocacoesSupabaseSync?.getStatus?.() || "Aguardando configuracao.";
  return `<div class="grid two-col">
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Governanca</p><h2>Backup e dados</h2></div></div><div class="action-grid"><button class="primary-button" data-backup="download" type="button">Baixar backup JSON</button><button class="ghost-button" data-backup="import" type="button">Importar backup</button><button class="ghost-button" data-backup="restore" type="button">Restaurar exemplo de temporada</button><button class="ghost-button" data-backup="snapshot" type="button">Salvar ponto de restauracao</button></div><p class="muted block-help">Os dados ficam neste dispositivo e tambem podem ser sincronizados com Supabase quando voce entrar na nuvem.</p></section>
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Base</p><h2>Registros</h2></div></div><div class="list">${counts}</div></section>
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Supabase</p><h2>Sincronizacao em nuvem</h2></div><span class="status ${syncUser ? "ok" : "warn"}">${syncUser ? "conectado" : "desconectado"}</span></div><div class="form-grid compact-form"><div class="field full"><label for="supabase-url">URL do projeto</label><input id="supabase-url" type="url" value="${escapeHtml(syncSettings.url || "")}" placeholder="https://xxxx.supabase.co" /></div><div class="field full"><label for="supabase-key">Publishable ou anon public key</label><input id="supabase-key" type="password" value="${escapeHtml(syncSettings.anonKey || "")}" placeholder="sb_publishable_... ou eyJ..." /></div><div class="field"><label for="supabase-email">E-mail</label><input id="supabase-email" type="email" value="${escapeHtml(syncSettings.email || "")}" placeholder="voce@email.com" /></div><div class="field"><label for="supabase-password">Senha</label><input id="supabase-password" type="password" placeholder="Senha do usuario no Supabase" /></div></div><div class="action-grid cloud-actions"><button class="primary-button" data-sync="save-config" type="button">Salvar configuracao</button><button class="ghost-button" data-sync="login" type="button">Entrar</button><button class="ghost-button" data-sync="pull" type="button">Baixar nuvem</button><button class="ghost-button" data-sync="push" type="button">Enviar agora</button><button class="ghost-button" data-sync="logout" type="button">Sair</button></div><p class="muted block-help" id="cloud-sync-status">${escapeHtml(syncStatus)}</p></section>
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Banco</p><h2>Como configurar</h2></div></div><p class="muted block-help">No Supabase, rode o arquivo <strong>supabase-schema.sql</strong> no SQL Editor. O app salva a base completa de temporada em JSON por usuario.</p></section>
  </div>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function status(value) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(value || "-")}</span>`;
}

function statusClass(value) {
  const v = String(value || "").toLowerCase();
  if (/(pago|ativo|confirmada|hospedada|finalizada|disponivel|concluido)/.test(v)) return "ok";
  if (/(pendente|parcial|reservada|manutencao)/.test(v)) return "warn";
  if (/(cancelada|atrasado|inativo)/.test(v)) return "danger";
  return "info";
}

function actions(collection, id) {
  return `<div class="filters"><button class="ghost-button" data-edit="${collection}:${id}" type="button">Editar</button><button class="ghost-button" data-delete="${collection}:${id}" type="button">Excluir</button></div>`;
}

function optionList(collection, selected, emptyLabel = "Selecione") {
  return `<option value="">${emptyLabel}</option>` + state[collection].map((item) => `<option value="${item.id}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
}

function fieldsFor(collection, record = {}) {
  const aptOptions = () => state.apartments.map((apt) => [apt.id, apt.name]);
  const clientOptions = () => state.clients.map((client) => [client.id, client.name]);
  const brokerOptions = () => [["", "Sem corretor"], ...state.brokers.map((broker) => [broker.id, broker.name])];
  const fields = {
    apartments: [
      ["name", "Nome do apartamento", "text", null, true], ["address", "Endereco", "text"], ["type", "Tipo", "select", [["Apartamento", "Apartamento"], ["Studio", "Studio"], ["Casa", "Casa"], ["Cobertura", "Cobertura"], ["Flat", "Flat"]]], ["status", "Status", "select", [["ativo", "Ativo"], ["manutencao", "Manutencao"], ["inativo", "Inativo"]]], ["rooms", "Quartos", "number"], ["maxGuests", "Capacidade", "number"], ["baseDaily", "Diaria base", "number"], ["cleaningFee", "Taxa limpeza", "number"], ["notes", "Observacoes", "textarea"]
    ],
    clients: [
      ["name", "Nome", "text", null, true], ["document", "CPF/documento", "text"], ["phone", "Telefone", "text"], ["email", "E-mail", "email"], ["origin", "Origem", "select", [["Indicado", "Indicado"], ["Airbnb", "Airbnb"], ["Booking", "Booking"], ["Instagram", "Instagram"], ["Direto", "Direto"], ["Outro", "Outro"]]], ["notes", "Observacoes", "textarea"]
    ],
    brokers: [
      ["name", "Nome", "text", null, true], ["phone", "Telefone", "text"], ["email", "E-mail", "email"], ["commissionDefault", "Comissao padrao (%)", "number"], ["status", "Status", "select", [["ativo", "Ativo"], ["inativo", "Inativo"]]], ["notes", "Observacoes", "textarea"]
    ],
    contracts: [
      ["code", "Codigo", "text", null, false, `CTR-${Date.now().toString().slice(-6)}`], ["status", "Status", "select", [["reservada", "Reservada"], ["confirmada", "Confirmada"], ["hospedada", "Hospedada"], ["finalizada", "Finalizada"], ["cancelada", "Cancelada"]]], ["clientId", "Cliente", "select", clientOptions, true], ["apartmentId", "Apartamento", "select", aptOptions, true], ["brokerId", "Corretor", "select", brokerOptions], ["brokerPercent", "Comissao corretor (%)", "number", null, false, 10], ["checkIn", "Entrada", "date", null, true, todayIso()], ["checkOut", "Saida", "date", null, true, addDays(todayIso(), 3)], ["guests", "Adultos", "number", null, false, 2], ["children", "Criancas", "number", null, false, 0], ["pets", "Pet", "select", [["nao", "Nao"], ["sim", "Sim"]]], ["paymentStatus", "Pagamento", "select", [["pendente", "Pendente"], ["parcial", "Parcial"], ["pago", "Pago"]]], ["dailyRate", "Diaria negociada", "number", null, false, 0], ["cleaningFee", "Taxa limpeza", "number", null, false, 0], ["discount", "Desconto", "number", null, false, 0], ["deposit", "Valor recebido", "number", null, false, 0], ["notes", "Observacoes", "textarea"]
    ],
    expenses: [
      ["date", "Data", "date", null, true, todayIso()], ["apartmentId", "Apartamento", "select", () => [["", "Despesa geral"], ...state.apartments.map((apt) => [apt.id, apt.name])]], ["category", "Categoria", "select", [["Limpeza", "Limpeza"], ["Manutencao", "Manutencao"], ["Condominio", "Condominio"], ["Energia", "Energia"], ["Agua", "Agua"], ["Internet", "Internet"], ["Enxoval", "Enxoval"], ["Marketing", "Marketing"], ["Outros", "Outros"]]], ["amount", "Valor", "number", null, true], ["paid", "Status", "select", [["pago", "Pago"], ["pendente", "Pendente"]]], ["description", "Descricao", "textarea"]
    ]
  }[collection] || [];
  return fields.map(([key, label, type, options, required, fallback]) => ({ key, label, type, options, required, value: record[key] ?? fallback ?? "" }));
}

function openForm(collection, id = null) {
  const dialog = document.querySelector("#recordDialog");
  const fields = document.querySelector("#formFields");
  const record = id ? state[collection].find((item) => item.id === id) : {};
  const label = collectionLabels[collection]?.[0] || "registro";
  dialog.dataset.collection = collection;
  dialog.dataset.id = id || "";
  document.querySelector("#dialogTitle").textContent = id ? `Editar ${label}` : `Novo ${label}`;
  fields.innerHTML = fieldsFor(collection, record).map(fieldHtml).join("");
  dialog.showModal();
}

function fieldHtml(field) {
  const full = field.type === "textarea" || ["address", "notes", "description"].includes(field.key) ? " full" : "";
  const required = field.required ? "required" : "";
  if (field.type === "select") {
    const options = typeof field.options === "function" ? field.options() : field.options;
    return `<div class="field${full}"><label for="${field.key}">${field.label}</label><select id="${field.key}" name="${field.key}" ${required}>${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(field.value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "textarea") return `<div class="field${full}"><label for="${field.key}">${field.label}</label><textarea id="${field.key}" name="${field.key}">${escapeHtml(field.value)}</textarea></div>`;
  return `<div class="field${full}"><label for="${field.key}">${field.label}</label><input id="${field.key}" name="${field.key}" type="${field.type}" value="${escapeHtml(field.value)}" ${field.type === "number" ? "step='0.01'" : ""} ${required} /></div>`;
}

function submitForm(event) {
  event.preventDefault();
  if (event.submitter?.value === "cancel") {
    document.querySelector("#recordDialog").close();
    return;
  }

  const dialog = document.querySelector("#recordDialog");
  const collection = dialog.dataset.collection;
  const id = dialog.dataset.id;
  const fields = fieldsFor(collection, id ? state[collection].find((item) => item.id === id) : {});
  const record = Object.fromEntries(new FormData(event.currentTarget).entries());
  fields.filter((field) => field.type === "number").forEach((field) => record[field.key] = toNumber(record[field.key]));

  if (collection === "contracts") {
    const error = validateContract({ ...record, id: id || "draft" });
    if (error) return toast(error);
  }

  if (id) state[collection] = state[collection].map((item) => item.id === id ? { ...item, ...record } : item);
  else state[collection].push({ id: uid(), ...record });
  saveState("form_save");
  dialog.close();
  render();
  toast("Registro salvo.");
}

function validateContract(contract) {
  if (!state.clients.length || !state.apartments.length) return "Cadastre ao menos um cliente e um apartamento.";
  if (parseDate(contract.checkOut) <= parseDate(contract.checkIn)) return "A saida precisa ser posterior a entrada.";
  const apartment = getById("apartments", contract.apartmentId);
  const totalGuests = toNumber(contract.guests) + toNumber(contract.children);
  if (apartment?.maxGuests && totalGuests > toNumber(apartment.maxGuests)) return "Hospedes acima da capacidade do apartamento.";
  if (hasConflict(contract)) return "Este periodo conflita com outra reserva ativa.";
  return "";
}

function exportCSV(collection) {
  const rows = state[collection] || [];
  const keys = Object.keys(rows[0] || {});
  const csv = [keys.join(";"), ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(";"))].join("\n");
  download(`${collection}.csv`, csv, "text/csv;charset=utf-8");
}

function backupDownload() {
  download(`app-locacao-temporada-backup-${todayIso()}.json`, JSON.stringify(state, null, 2), "application/json");
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

function bindViewEvents() {
  document.querySelector("#dashboardMonth")?.addEventListener("change", (event) => {
    state.settings.month = event.target.value;
    saveState("month_change");
    render();
  });
  document.querySelector("#calendarMonth")?.addEventListener("change", (event) => {
    state.settings.month = event.target.value;
    saveState("calendar_month_change");
    render();
  });
  document.querySelector("#calendarApartment")?.addEventListener("change", (event) => {
    state.settings.calendarApartment = event.target.value;
    saveState("calendar_apartment_change");
    render();
  });
  document.querySelector("#reportMonth")?.addEventListener("change", (event) => {
    state.settings.reportMonth = event.target.value;
    saveState("report_month_change");
    render();
  });
  document.querySelector("#reportApartment")?.addEventListener("change", (event) => {
    state.settings.reportApartment = event.target.value;
    saveState("report_apartment_change");
    render();
  });
}

function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 2200);
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
  const side = document.querySelector("#storageStatus");
  if (side) side.textContent = text;
  const top = document.querySelector("#topSyncStatus");
  if (top) top.textContent = text;
  updateTopbarAccess();
}

function cacheOfflineUser(user) {
  if (!user?.id && !user?.email) return;
  localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({ id: user.id || user.email, email: user.email || "", cachedAt: new Date().toISOString() }));
}

function getCachedOfflineUser() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_USER_KEY));
  } catch {
    return null;
  }
}

function getCurrentAccessUser() {
  const onlineUser = window.LocacoesSupabaseSync?.getUser?.();
  if (onlineUser) {
    return {
      email: onlineUser.email || onlineUser.user_metadata?.email || onlineUser.id || "usuario conectado",
      mode: "Supabase"
    };
  }
  const offlineUser = getCachedOfflineUser();
  if (offlineUser) {
    return {
      email: offlineUser.email || offlineUser.id || "usuario offline",
      mode: navigator.onLine ? "Sessao local" : "Offline"
    };
  }
  return null;
}

function updateTopbarAccess() {
  const user = getCurrentAccessUser();
  const userBadge = document.querySelector("#currentUserBadge");
  if (userBadge) userBadge.textContent = user ? `${user.email} - ${user.mode}` : "Usuario nao identificado";

  const version = document.querySelector("#topVersionLabel");
  if (version) version.textContent = APP_VERSION_LABEL;

  const access = document.querySelector("#topAccessLabel");
  if (access) access.textContent = location.host || "Acesso local";
}

function getAccessUrl() {
  const url = new URL(WEB_ACCESS_URL);
  url.searchParams.set("v", "2.1.10-temporada");
  return url.toString();
}

function openQrDialog() {
  const dialog = document.querySelector("#qrDialog");
  const image = document.querySelector("#qrImage");
  const linkText = document.querySelector("#qrAccessLink");
  const openLink = document.querySelector("#openAccessLinkBtn");
  if (!dialog || !image || !linkText || !openLink) return;

  const accessUrl = getAccessUrl();
  image.src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(accessUrl)}`;
  linkText.textContent = accessUrl;
  openLink.href = accessUrl;
  dialog.showModal();
}

async function copyAccessLink() {
  const accessUrl = getAccessUrl();
  try {
    await navigator.clipboard.writeText(accessUrl);
    toast("Link copiado.");
  } catch {
    toast("Nao foi possivel copiar. O link esta na tela.");
  }
}

async function logout() {
  try {
    await window.LocacoesSupabaseSync?.signOut?.();
  } catch {}
  location.replace("login.html?v=2.1.10-temporada");
}

async function handleSyncAction(action) {
  try {
    if (action === "save-config") return saveSupabaseSettingsFromForm();
    if (!window.LocacoesSupabaseSync) return toast("Modulo Supabase nao carregado.");
    if (action === "login") {
      const login = getSupabaseLogin();
      saveSupabaseSettingsFromForm();
      await window.LocacoesSupabaseSync.signIn(login.email, login.password);
      cacheOfflineUser(window.LocacoesSupabaseSync.getUser?.());
      const remote = await window.LocacoesSupabaseSync.loadRemote();
      if (remote?.data) state = normalize(remote.data);
      else await window.LocacoesSupabaseSync.saveNow(state);
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      render();
      toast("Supabase conectado.");
    }
    if (action === "pull") {
      const remote = await window.LocacoesSupabaseSync.loadRemote();
      if (!remote?.data) return toast("Nenhum dado na nuvem.");
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
      location.replace("login.html");
    }
  } catch (error) {
    setCloudStatus(error.message || "Falha na sincronizacao.");
    toast("Falha no Supabase.");
  }
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

  const deleteBtn = event.target.closest("[data-delete]");
  if (deleteBtn) {
    const [collection, id] = deleteBtn.dataset.delete.split(":");
    if (confirm("Excluir este registro?")) {
      state[collection] = state[collection].filter((item) => item.id !== id);
      saveState("delete");
      render();
      toast("Registro excluido.");
    }
  }

  const exportBtn = event.target.closest("[data-export]");
  if (exportBtn) exportCSV(exportBtn.dataset.export);

  const backupBtn = event.target.closest("[data-backup]");
  if (backupBtn) {
    const action = backupBtn.dataset.backup;
    if (action === "download") backupDownload();
    if (action === "import") document.querySelector("#importFile").click();
    if (action === "snapshot") saveSnapshot();
    if (action === "restore" && confirm("Substituir os dados atuais pelo exemplo de temporada?")) {
      state = structuredClone(seedData);
      saveState("restore_seed");
      render();
      toast("Exemplo restaurado.");
    }
  }

  const syncBtn = event.target.closest("[data-sync]");
  if (syncBtn) handleSyncAction(syncBtn.dataset.sync);
});

document.querySelector("#recordForm").addEventListener("submit", submitForm);
document.querySelector("#quickAddBtn").addEventListener("click", () => openForm(collectionLabels[route] ? route : "contracts"));
document.querySelector("#qrAccessBtn").addEventListener("click", openQrDialog);
document.querySelector("#copyAccessLinkBtn").addEventListener("click", copyAccessLink);
document.querySelector("#logoutBtn").addEventListener("click", logout);
document.querySelector("#globalSearch").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  render();
});
document.querySelector("#importFile").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importBackup(file);
  event.target.value = "";
});

window.addEventListener("DOMContentLoaded", async () => {
  const version = document.querySelector("#versionLabel");
  if (version) version.textContent = APP_VERSION_LABEL;
  updateTopbarAccess();

  if (!window.LocacoesSupabaseSync) {
    if (!navigator.onLine && getCachedOfflineUser()) {
      document.body.classList.remove("auth-pending");
      render();
      setCloudStatus("Modo offline com ultimo usuario validado.");
      return;
    }
    location.replace("login.html");
    return;
  }

  window.LocacoesSupabaseSync.configure(loadSupabaseSettings());
  window.LocacoesSupabaseSync.onStatus(setCloudStatus);
  try {
    await window.LocacoesSupabaseSync.restoreSession();
    const user = window.LocacoesSupabaseSync.getUser();
    if (!user) {
      location.replace("login.html");
      return;
    }
    cacheOfflineUser(user);
    updateTopbarAccess();
    const remote = await window.LocacoesSupabaseSync.loadRemote();
    if (remote?.data && (!state.meta?.updatedAt || remote.updatedAt > state.meta.updatedAt)) {
      state = normalize(remote.data);
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }
    document.body.classList.remove("auth-pending");
    render();
  } catch {
    if (!navigator.onLine && getCachedOfflineUser()) {
      document.body.classList.remove("auth-pending");
      render();
      setCloudStatus("Modo offline com ultimo usuario validado.");
      return;
    }
    setCloudStatus("Supabase aguardando login.");
    location.replace("login.html");
  }
});

