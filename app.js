const STORE_KEY = "app-locacao-state-v2";
const BACKUP_KEY = "app-locacao-backups-v1";
const SUPABASE_SETTINGS_KEY = "app-locacao-supabase-settings-v1";
const OFFLINE_USER_KEY = "app-locacao-last-online-user-v1";
const APP_VERSION_LABEL = "v2.1.30-auto-20260715-1709";
const APP_CHANGE_DATE_LABEL = "Alterado em 14/07/2026";
const WEB_ACCESS_URL = "https://locacoes-publish.vercel.app/";
const oneDay = 86400000;

const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const valueFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFieldKeys = new Set(["baseDaily", "cleaningFee", "defaultSecurityDeposit", "reservationTotal", "dailyRate", "discount", "deposit", "securityDeposit", "firstPayment", "amount"]);
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthIso = () => todayIso().slice(0, 7);
const uid = () => crypto.randomUUID?.() || `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let route = new URLSearchParams(location.search).get("view") || "dashboard";
let searchTerm = "";

const navItems = [
  ["dashboard", "Painel", "P", "Operacao de temporada"],
  ["contracts", "Reservas e Contratos", "C", "Reservas e estadias"],
  ["calendar", "Calendario", "A", "Ocupacao mensal"],
  ["apartments", "Apartamentos", "I", "Unidades e Capacidade"],
  ["clients", "Clientes", "H", "Hospedagem e Origem"],
  ["brokers", "Corretores", "R", "Comissoes"],
  ["expenses", "Despesas", "$", "Custo por unidade"],
  ["reports", "Relatorios", "D", "Resultado e indicadores"],
  ["institutional", "Institucional", "S", "Sobre Privacidade e LGPD"],
  ["settings", "Gestao", "G", "Backup Nuvem e Versao"]
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

function dateLongBR(value) {
  if (!value) return "-";
  return parseDate(value).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
}

function dateContractBR(value) {
  if (!value) return "-";
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const date = parseDate(value);
  return String(date.getUTCDate()).padStart(2, "0") + " " + months[date.getUTCMonth()] + " " + date.getUTCFullYear();
}

function money(value) {
  return moneyFmt.format(Number(value || 0));
}

function moneyWithWords(value) {
  const amount = Math.round(Number(value || 0));
  const basic = {
    0: "zero", 1: "um", 2: "dois", 3: "tres", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove",
    10: "dez", 20: "vinte", 30: "trinta", 40: "quarenta", 50: "cinquenta", 60: "sessenta", 70: "setenta", 80: "oitenta", 90: "noventa",
    100: "cem", 200: "duzentos", 300: "trezentos", 400: "quatrocentos", 500: "quinhentos", 600: "seiscentos", 700: "setecentos", 800: "oitocentos", 900: "novecentos"
  };
  const belowHundred = (n) => basic[n] || (basic[Math.floor(n / 10) * 10] + " e " + basic[n % 10]);
  const belowThousand = (n) => {
    if (basic[n]) return basic[n];
    if (n < 100) return belowHundred(n);
    const hundred = Math.floor(n / 100) * 100;
    return (hundred === 100 ? "cento" : basic[hundred]) + " e " + belowHundred(n % 100);
  };
  let words = basic[amount];
  if (!words && amount < 1000) words = belowThousand(amount);
  if (!words && amount < 1000000) {
    const thousands = Math.floor(amount / 1000);
    const rest = amount % 1000;
    words = (thousands === 1 ? "mil" : belowThousand(thousands) + " mil") + (rest ? " e " + belowThousand(rest) : "");
  }
  return money(value) + (words ? " (" + words + " reais)" : "");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized) || 0;
}

function brazilianValue(value) {
  return valueFmt.format(toNumber(value));
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

const removedExampleUnitNames = ["studio para temporada", "family club completo"];

function normalizedText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const namedColors = {
  azul: "#2563eb",
  verde: "#0f766e",
  vermelho: "#dc2626",
  amarelo: "#d97706",
  laranja: "#ea580c",
  roxo: "#7c3aed",
  rosa: "#db2777",
  cinza: "#64748b",
  preto: "#111827",
  branco: "#94a3b8",
  marrom: "#92400e",
  dourado: "#c49a5a",
  anil: "#3730a3",
  azure: "#007fff",
  turquesa: "#0891b2"
};

function colorForName(value) {
  const normalized = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return normalized;
  if (normalized.includes("azure")) return namedColors.azure;
  if (normalized.includes("anil")) return namedColors.anil;
  return namedColors[normalized] || "";
}

function colorStyle(value) {
  const color = colorForName(value);
  return color ? ` style="--apt-color:${escapeHtml(color)}"` : "";
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digit = (base) => {
    const sum = base.split("").reduce((total, number, index) => total + Number(number) * (base.length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(cpf.slice(0, 9)) === Number(cpf[9]) && digit(cpf.slice(0, 10)) === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split("").reduce((total, number, index) => total + Number(number) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

function validateDocumentValue(value) {
  const digits = onlyDigits(value);
  if (!digits) return "";
  if (digits.length === 11) return isValidCpf(digits) ? "" : "CPF invalido.";
  if (digits.length === 14) return isValidCnpj(digits) ? "" : "CNPJ invalido.";
  return "Informe CPF com 11 digitos ou CNPJ com 14 digitos.";
}

async function lookupCnpjName(cnpj) {
  const digits = onlyDigits(cnpj);
  if (!isValidCnpj(digits)) return null;
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) throw new Error("CNPJ nao localizado na consulta publica.");
  const data = await response.json();
  return data.razao_social || data.nome_fantasia || "";
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

function contractBrokerPercent(contract) {
  if (!contract?.brokerId) return 0;
  const broker = getById("brokers", contract.brokerId);
  return toNumber(broker?.commissionDefault);
}

function createSeed() {
  const apt1 = { id: uid(), name: "Flat 008 Anil", unitNumber: "008", block: "Anil (A)", address: "Av. Beira Mar S/N, Rodovia PE 09 KM 05 Praia do Cupe, Porto de Galinhas, CEP 55590-000", type: "Flat", status: "ativo", ownerName: "Margarida Maria Monteiro", ownerDocument: "986.955.414-87", ownerPhone: "(81) 99969-2463", ownerEmail: "", ownerAddress: "Av. Beira Mar, s/n, Praia do Cupe, CEP 55.590-000, Ipojuca/PE", ownerNationality: "brasileira", ownerProfession: "", ownerBankHolder: "Margarida Maria Queiroz Monteiro", ownerPixKey: "986955414-87", ownerBankName: "Banco Safra", ownerShare: 100, rooms: 2, maxGuests: 8, baseDaily: 420, cleaningFee: 180, defaultSecurityDeposit: 300, contractNotes: "", notes: "Ideal para familias; aceita pet pequeno mediante aprovacao." };
  const apt2 = { id: uid(), name: "Studio Executivo 1207", address: "Centro", type: "Studio", status: "ativo", ownerName: "Proprietario exemplo", ownerDocument: "", ownerPhone: "", ownerEmail: "", ownerShare: 100, rooms: 1, maxGuests: 3, baseDaily: 260, cleaningFee: 120, notes: "Alta procura para estadias curtas." };
  const client = { id: uid(), name: "Marina Azevedo", document: "000.000.000-00", phone: "(85) 99999-0000", email: "marina@email.com", address: "Endereco completo do locatario", origin: "Instagram", notes: "Preferencia por check-in antecipado." };
  const broker = { id: uid(), name: "Carlos Lima", phone: "(85) 98888-0000", email: "carlos@corretor.com", commissionDefault: 12, status: "ativo", notes: "" };
  const checkIn = todayIso();
  const checkOut = addDays(checkIn, 5);
  return {
    apartments: [apt1, apt2],
    clients: [client],
    brokers: [broker],
    contracts: [{ id: uid(), code: "CTR-EXEMPLO", status: "confirmada", clientId: client.id, apartmentId: apt1.id, brokerId: broker.id, brokerPercent: 12, checkIn, checkOut, checkInTime: "14:00", checkOutTime: "11:00", guests: 2, children: 1, pets: "nao", paymentStatus: "parcial", dailyRate: 450, cleaningFee: 180, discount: 0, deposit: 900, securityDeposit: 300, firstPayment: 900, firstPaymentDate: todayIso(), balanceDueDate: checkIn, issueDate: todayIso(), notes: "Contrato de exemplo." }],
    expenses: [{ id: uid(), date: todayIso(), apartmentId: apt1.id, category: "Limpeza", amount: 160, paid: "pago", description: "Limpeza pos-hospedagem." }],
    settings: { month: monthIso(), reportMonth: monthIso(), calendarApartment: "", reportApartment: "", contractFilterStart: "", contractFilterEnd: "", contractFilterApartment: "" }
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
  incoming.apartments = incoming.apartments
    .map(normalizeApartment)
    .filter((apt) => !removedExampleUnitNames.includes(normalizedText(apt.name || apt.title)));
  incoming.clients = incoming.clients.map(normalizeClient);
  incoming.contracts = incoming.contracts.map(normalizeContract);
  incoming.settings = { ...base.settings, contractReportId: "", ...(incoming.settings || {}) };
  return incoming;
}

function normalizeClient(client = {}) {
  return {
    ...client,
    document: client.document || client.cpf || client.cpfCnpj || "",
    phone: client.phone || client.telephone || "",
    email: client.email || "",
    address: client.address || client.fullAddress || client.endereco || "",
    origin: client.origin || client.source || "Direto",
    notes: client.notes || ""
  };
}

function normalizeContract(contract = {}) {
  const received = toNumber(contract.deposit);
  return {
    ...contract,
    hasFormalContract: contract.hasFormalContract || "sim",
    checkInTime: contract.checkInTime || "14:00",
    checkOutTime: contract.checkOutTime || "11:00",
    securityDeposit: contract.securityDeposit === undefined || contract.securityDeposit === "" ? 300 : toNumber(contract.securityDeposit),
    firstPayment: contract.firstPayment === undefined || contract.firstPayment === "" ? received : toNumber(contract.firstPayment),
    firstPaymentDate: contract.firstPaymentDate || "",
    balanceDueDate: contract.balanceDueDate || contract.checkIn || "",
    issueDate: contract.issueDate || todayIso(),
    cancellationPolicy: contract.cancellationPolicy || "Nao reembolsavel.",
    paymentInstructions: contract.paymentInstructions || "",
    contractNotes: contract.contractNotes || ""
  };
}

function normalizeApartment(apt = {}) {
  const ownerName = apt.ownerName || apt.owner || apt.proprietario || "";
  return {
    ...apt,
    colorName: apt.colorName || apt.color || apt.cor || "",
    ownerName,
    ownerDocument: apt.ownerDocument || apt.ownerCpfCnpj || apt.ownerCpf || apt.ownerCnpj || "",
    ownerPhone: apt.ownerPhone || apt.ownerContact || "",
    ownerEmail: apt.ownerEmail || "",
    ownerAddress: apt.ownerAddress || apt.ownerEndereco || "",
    ownerNationality: apt.ownerNationality || "brasileira",
    ownerProfession: apt.ownerProfession || "",
    ownerBankHolder: apt.ownerBankHolder || apt.bankHolder || apt.pixHolder || "",
    ownerPixKey: apt.ownerPixKey || apt.pixKey || "",
    ownerBankName: apt.ownerBankName || apt.bankName || "",
    unitNumber: apt.unitNumber || apt.apartmentNumber || apt.numero || "",
    block: apt.block || apt.bloco || "",
    defaultSecurityDeposit: apt.defaultSecurityDeposit === undefined || apt.defaultSecurityDeposit === "" ? 300 : toNumber(apt.defaultSecurityDeposit),
    contractNotes: apt.contractNotes || "",
    ownerShare: apt.ownerShare === undefined || apt.ownerShare === "" ? 100 : toNumber(apt.ownerShare)
  };
}

function apartmentOwnerName(apt) {
  return apt?.ownerName || "Proprietario nao informado";
}

function ownerKey(apt) {
  return apartmentOwnerName(apt).trim().toLowerCase();
}

function ownerSummaryRows(metrics, month = monthIso()) {
  const rows = new Map();
  const ensure = (apt) => {
    const key = ownerKey(apt);
    if (!rows.has(key)) rows.set(key, { owner: apartmentOwnerName(apt), apartments: new Set(), revenue: 0, commission: 0, expenses: 0, net: 0 });
    const row = rows.get(key);
    if (apt?.name) row.apartments.add(apt.name);
    return row;
  };

  metrics.contracts.forEach((contract) => {
    const apt = getById("apartments", contract.apartmentId);
    const revenue = monthlyContractRevenue(contract, month);
    const commission = revenue * (contractBrokerPercent(contract) / 100);
    const row = ensure(apt);
    row.revenue += revenue;
    row.commission += commission;
    row.net += revenue - commission;
  });

  metrics.expenses.forEach((expense) => {
    const apt = getById("apartments", expense.apartmentId);
    const row = ensure(apt);
    row.expenses += toNumber(expense.amount);
    row.net -= toNumber(expense.amount);
  });

  return [...rows.values()].sort((a, b) => b.net - a.net);
}

function migrateLongTermState(oldState, base) {
  const apartments = Array.isArray(oldState.apartments) ? oldState.apartments.map((apt) => ({
    id: apt.id || uid(),
    name: apt.title || apt.name || apt.code || "Apartamento",
    address: apt.address || "",
    type: apt.type || "Apartamento",
    status: statusToSeason(apt.status),
    ownerName: apt.ownerName || apt.owner || apt.proprietario || "",
    ownerDocument: apt.ownerDocument || apt.ownerCpfCnpj || "",
    ownerPhone: apt.ownerPhone || apt.ownerContact || "",
    ownerEmail: apt.ownerEmail || "",
    ownerShare: apt.ownerShare === undefined || apt.ownerShare === "" ? 100 : toNumber(apt.ownerShare),
    ownerAddress: apt.ownerAddress || "",
    ownerNationality: apt.ownerNationality || "brasileira",
    ownerProfession: apt.ownerProfession || "",
    ownerBankHolder: apt.ownerBankHolder || "",
    ownerPixKey: apt.ownerPixKey || "",
    ownerBankName: apt.ownerBankName || "",
    unitNumber: apt.unitNumber || "",
    block: apt.block || "",
    defaultSecurityDeposit: apt.defaultSecurityDeposit === undefined || apt.defaultSecurityDeposit === "" ? 300 : toNumber(apt.defaultSecurityDeposit),
    contractNotes: apt.contractNotes || "",
    rooms: toNumber(apt.bedrooms || apt.rooms),
    maxGuests: toNumber(apt.maxGuests || Math.max(2, toNumber(apt.bedrooms) * 2)),
    baseDaily: toNumber(apt.baseDaily || apt.price),
    cleaningFee: toNumber(apt.cleaningFee),
    notes: apt.notes || [apt.code, apt.district].filter(Boolean).join(" | ")
  })) : base.apartments;

  const clients = Array.isArray(oldState.clients) ? oldState.clients.map((client) => ({
    id: client.id || uid(),
    name: client.name || "Cliente",
    document: client.document || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || client.endereco || "",
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
  const commission = total * (contractBrokerPercent(contract) / 100);
  const received = toNumber(contract.deposit);
  return { stayNights, lodging, cleaning, discount, total, commission, received, pending: Math.max(0, total - received) };
}

function monthlyContractRevenue(contract, month) {
  return occupancyDays(contract, month) * toNumber(contract.dailyRate);
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
  const revenue = contracts.reduce((sum, contract) => sum + monthlyContractRevenue(contract, month), 0);
  const commission = contracts.reduce((sum, contract) => sum + monthlyContractRevenue(contract, month) * (contractBrokerPercent(contract) / 100), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const occupied = contracts.reduce((sum, contract) => sum + occupancyDays(contract, month), 0);
  const apartmentCount = apartmentId ? 1 : Math.max(1, state.apartments.filter((apt) => apt.status !== "inativo").length);
  const daysInMonth = monthRange(month).end.getUTCDate() * apartmentCount;
  return { contracts, expenses, revenue, commission, expenseTotal, net: revenue - commission - expenseTotal, occupied, occupancy: daysInMonth ? occupied / daysInMonth : 0 };
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
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
  const views = { dashboard, contracts, calendar: calendarView, apartments, clients, brokers, expenses, reports: reportsView, institutional: institutionalView, settings: settingsView };
  document.querySelector("#app").innerHTML = (views[route] || dashboard)();
  updateTopbarAccess();
  bindViewEvents();
}

function metric(label, value, hint, cls = "info") {
  const valueText = String(value ?? "");
  const valueClass = valueText.length > 13 ? " metric-value compact-value" : " metric-value";
  return `<article class="panel metric ${cls}"><span>${label}</span><strong class="${valueClass}">${value}</strong><small>${hint}</small></article>`;
}

function dashboard() {
  const month = state.settings.month || monthIso();
  const m = buildMetrics(month);
  const conflicts = state.contracts.filter(hasConflict);
  const today = todayIso();
  const tomorrow = addDays(today, 1);
  const reservationAlerts = state.contracts
    .filter((contract) => contract.status !== "cancelada" && (contract.checkIn === today || contract.checkIn === tomorrow))
    .sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)))
    .map((contract) => {
      const apartment = getById("apartments", contract.apartmentId)?.name || "Apartamento";
      const client = getById("clients", contract.clientId)?.name || "Cliente nao informado";
      const isToday = contract.checkIn === today;
      return {
        title: isToday ? `Check-in hoje - ${apartment}` : `Check-in amanha - ${apartment}`,
        text: `${client} - ${dateBR(contract.checkIn)} as ${contract.checkInTime || "14:00"}`,
        cls: isToday ? "danger" : "warn"
      };
    });
  const occupancyAlerts = [
    ...reservationAlerts,
    ...conflicts.map((contract) => ({ title: getById("apartments", contract.apartmentId)?.name || "Apartamento", text: `Conflito em ${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}`, cls: "danger" }))
  ];
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
        <div class="list">${occupancyAlerts.length ? occupancyAlerts.map(alertRow).join("") : empty("Nenhum alerta para hoje ou amanha.")}</div>
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
  return `<article class="card apartment-card"><div class="apartment-cover"${colorStyle(apt.colorName || apt.name)}><span>${escapeHtml(apt.name)}</span>${apt.colorName ? `<small>${escapeHtml(apt.colorName)}</small>` : ""}</div><div class="card-head"><strong>${escapeHtml(apt.type || "Apartamento")}</strong><span class="status ${statusClass(apt.status)}">${escapeHtml(apt.status || "ativo")}</span></div><p class="muted">${escapeHtml(apt.address || "Endereco nao informado")}</p><p class="owner-line">Proprietario: <strong>${escapeHtml(apartmentOwnerName(apt))}</strong></p><div class="apartment-meta"><span class="status info">${apt.rooms || 0} quarto(s)</span><span class="status info">ate ${apt.maxGuests || 0}</span><span class="status ok">${money(apt.baseDaily)}</span></div><div class="filters"><button class="ghost-button" data-edit="apartments:${apt.id}" type="button">Editar</button></div></article>`;
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
  return tableView("clients", "Clientes", ["Cliente", "Contato", "Endereco", "Origem", "Acoes"], (client) => [escapeHtml(client.name), `${escapeHtml(client.phone || "-")}<br>${escapeHtml(client.email || "")}<br>${escapeHtml(client.document || "")}`, escapeHtml(client.address || "-"), escapeHtml(client.origin || "-"), actions("clients", client.id)]);
}

function brokers() {
  return tableView("brokers", "Corretores", ["Corretor", "Contato", "Comissao", "Status", "Acoes"], (broker) => [escapeHtml(broker.name), `${escapeHtml(broker.phone || "-")}<br>${escapeHtml(broker.email || "")}`, `${toNumber(broker.commissionDefault)}%`, status(broker.status), actions("brokers", broker.id)]);
}

function expenses() {
  return tableView("expenses", "Despesas", ["Data", "Apartamento", "Proprietario", "Categoria", "Valor", "Status", "Acoes"], (expense) => {
    const apt = getById("apartments", expense.apartmentId);
    return [dateBR(expense.date), escapeHtml(apt?.name || "Geral"), escapeHtml(apt ? apartmentOwnerName(apt) : "Despesa geral"), escapeHtml(expense.category), money(expense.amount), status(expense.paid), actions("expenses", expense.id)];
  });
}

function contracts() {
  const start = state.settings.contractFilterStart || "";
  const end = state.settings.contractFilterEnd || "";
  const apartmentId = state.settings.contractFilterApartment || "";
  const hasFilters = Boolean(start || end || apartmentId);
  const ordered = filtered("contracts")
    .filter((contract) => !apartmentId || contract.apartmentId === apartmentId)
    .filter((contract) => !start || String(contract.checkOut || "") >= start)
    .filter((contract) => !end || String(contract.checkIn || "") <= end)
    .sort((a, b) => String(b.createdAt || b.checkIn || "").localeCompare(String(a.createdAt || a.checkIn || "")) || String(b.checkOut || "").localeCompare(String(a.checkOut || "")));
  const items = hasFilters ? ordered : ordered.slice(0, 5);
  const listInfo = hasFilters ? `${items.length} reserva(s) encontrada(s)` : `Exibindo os ${Math.min(5, ordered.length)} registros mais recentes`;
  return `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Cadastro</p><h2>Reservas e Contratos</h2></div><div class="filters"><button class="primary-button" data-add="contracts" type="button">+ Nova reserva</button><button class="ghost-button" data-export="contracts" type="button">Exportar CSV</button></div></div><div class="filters reservation-filters"><label class="field">Periodo inicial<input id="contractFilterStart" type="date" value="${escapeHtml(start)}"></label><label class="field">Periodo final<input id="contractFilterEnd" type="date" value="${escapeHtml(end)}"></label><label class="field">Apartamento<select id="contractFilterApartment">${optionList("apartments", apartmentId, "Todos os apartamentos")}</select></label><button class="ghost-button" data-clear-reservation-filters type="button" ${hasFilters ? "" : "disabled"}>Limpar filtros</button></div><p class="muted block-help">${listInfo}</p>${items.length ? table(["Periodo", "Cliente", "Apartamento", "Proprietario", "Hospedes", "Financeiro", "Status", "Acoes"], items.map((contract) => contractRow(contract))) : empty("Nenhuma reserva encontrada para os filtros informados.")}</section>`;
}

function contractRow(contract, activeMonth = state.settings.reportMonth || state.settings.month || monthIso()) {
  const totals = contractTotals(contract);
  const monthRevenue = monthlyContractRevenue(contract, activeMonth);
  return [
    `${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}<br>${totals.stayNights} diaria(s)`,
    escapeHtml(getById("clients", contract.clientId)?.name || "-"),
    `${escapeHtml(getById("apartments", contract.apartmentId)?.name || "-")}${hasConflict(contract) ? `<br><span class="status danger">Conflito</span>` : ""}`,
    escapeHtml(apartmentOwnerName(getById("apartments", contract.apartmentId))),
    `${contract.guests || 0} adulto(s)<br>${contract.children || 0} crianca(s), pet: ${contract.pets || "nao"}`,
    `Mes: ${money(monthRevenue)}<br>Total reserva: ${money(totals.total)}<br>Comissao mes: ${money(monthRevenue * (contractBrokerPercent(contract) / 100))}`,
    `${status(contract.status)}<br>${status(contract.paymentStatus)}`,
    actions("contracts", contract.id)
  ];
}

function calendarView() {
  const month = state.settings.month || monthIso();
  const apartmentId = state.settings.calendarApartment || "";
  return `<section class="panel calendar-panel"><div class="toolbar"><div><p class="eyebrow">Ocupacao mensal</p><h2>Calendario</h2></div><div class="filters calendar-filters">${calendarMonthYearControls(month)}<label class="field">Apartamento<select id="calendarApartment">${optionList("apartments", apartmentId, "Todos")}</select></label><button class="ghost-button" data-calendar-export type="button">Exportar WhatsApp</button><button class="ghost-button" onclick="window.print()" type="button">Imprimir</button></div></div><div class="calendar" id="calendarGrid">${calendarHtml(month, apartmentId)}</div></section>`;
}

function calendarMonthYearControls(month) {
  const { year, monthIndex } = monthRange(month);
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const years = [];
  for (let item = year - 2; item <= year + 3; item += 1) years.push(item);
  return `<label class="field compact-date-field">Mes<select id="calendarMonthSelect">${monthNames.map((name, index) => `<option value="${String(index + 1).padStart(2, "0")}" ${index + 1 === monthIndex ? "selected" : ""}>${name}</option>`).join("")}</select></label><label class="field compact-date-field">Ano<select id="calendarYearSelect">${years.map((item) => `<option value="${item}" ${item === year ? "selected" : ""}>${item}</option>`).join("")}</select></label>`;
}

function calendarHtml(month, apartmentId) {
  const { start, end } = monthRange(month);
  const cells = [];
  for (let i = 0; i < start.getUTCDay(); i++) cells.push(null);
  for (let day = 1; day <= end.getUTCDate(); day++) cells.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => `<div class="weekday">${day}</div>`).join("");
  return weekdays + cells.map((date, index) => {
    const weekStart = Math.floor(index / 7) * 7;
    const compactWeek = !cells.slice(weekStart, weekStart + 7).some((weekDate) => weekDate && calendarEventsForDate(weekDate, apartmentId).length);
    if (!date) return `<div class="day out ${compactWeek ? "compact" : ""}"></div>`;
    const events = calendarEventsForDate(date, apartmentId);
    return `<div class="day ${compactWeek ? "compact" : ""}"><strong>${date.getUTCDate()}</strong>${events.map(calendarEventHtml).join("")}</div>`;
  }).join("");
}

function calendarBookingsForDate(date, apartmentId = "") {
  return state.contracts.filter((contract) => {
    if (apartmentId && contract.apartmentId !== apartmentId) return false;
    return contract.status !== "cancelada" && parseDate(contract.checkIn) <= date && parseDate(contract.checkOut) > date;
  });
}

function calendarEventsForDate(date, apartmentId = "") {
  const bookings = calendarBookingsForDate(date, apartmentId).map((contract) => ({ contract, type: "stay" }));
  const checkouts = state.contracts
    .filter((contract) => {
      if (apartmentId && contract.apartmentId !== apartmentId) return false;
      return contract.status !== "cancelada" && parseDate(contract.checkOut).getTime() === date.getTime();
    })
    .map((contract) => ({ contract, type: "checkout" }));
  return [...bookings, ...checkouts];
}

function calendarEventHtml(event) {
  const contract = event.contract || event;
  const apt = getById("apartments", contract.apartmentId);
  const client = getById("clients", contract.clientId);
  const clientName = client?.name || (contract.hasFormalContract === "nao" ? "Reserva simples" : "Cliente");
  const aptName = apt?.name || apt?.unitNumber || "Apto";
  const isCheckout = event.type === "checkout";
  return `<span class="event ${isCheckout ? "checkout" : ""} ${hasConflict(contract) ? "blocked" : ""}"${colorStyle(apt?.colorName || apt?.name)} title="${escapeHtml(aptName)} - ${escapeHtml(clientName)}${isCheckout ? " - Saida" : ""}"><strong>${escapeHtml(aptName)}</strong><small>${isCheckout ? "Saida - " : ""}${escapeHtml(shortName(clientName))} - ${contract.guests || 0}h</small></span>`;
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Reserva";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
}

function guestText(contract) {
  const adults = toNumber(contract.guests);
  const children = toNumber(contract.children);
  const parts = [];
  if (adults) parts.push(adults + " (" + adults + ") adulto(s)");
  if (children) parts.push(children + " crianca(s)");
  return parts.join(", ") || "hospedes nao informados";
}

function contractFileName(contract) {
  const client = getById("clients", contract.clientId);
  const apt = getById("apartments", contract.apartmentId);
  const name = ["Contrato", apt?.name, client?.name, dateBR(contract.checkIn), "a", dateBR(contract.checkOut)].filter(Boolean).join(" ");
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + ".html";
}

function contractDocumentHtml(contract) {
  if ((contract.hasFormalContract || "sim") === "nao") {
    return `<article class="contract-document"><h2>Reserva sem contrato formal</h2><p>Esta reserva foi cadastrada como simples, sem emissao de contrato formal.</p><p><strong>Periodo:</strong> ${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}</p><p><strong>Apartamento:</strong> ${escapeHtml(getById("apartments", contract.apartmentId)?.name || "-")}</p><p><strong>Cliente:</strong> ${escapeHtml(getById("clients", contract.clientId)?.name || "Nao informado")}</p></article>`;
  }
  const client = getById("clients", contract.clientId) || {};
  const apt = getById("apartments", contract.apartmentId) || {};
  const totals = contractTotals(contract);
  const ownerQual = [apt.ownerName || "Locador nao informado", apt.ownerNationality, apt.ownerProfession].filter(Boolean).join(", ");
  const propertyName = apt.unitNumber ? "apartamento " + apt.unitNumber + (apt.block ? " do bloco " + apt.block : "") : (apt.name || "imovel locado");
  const balance = Math.max(0, totals.total - toNumber(contract.firstPayment));
  const issueDate = contract.issueDate || todayIso();
  const paymentInstructions = contract.paymentInstructions || [apt.ownerBankHolder ? "Titular: " + apt.ownerBankHolder : "", apt.ownerPixKey ? "Chave Pix/CPF: " + apt.ownerPixKey : "", apt.ownerBankName || ""].filter(Boolean).join("<br>");
  return `<article class="contract-document" id="contractDocument">
    <h2>CONTRATO DE LOCACAO RESIDENCIAL POR TEMPORADA</h2>
    <h3>${escapeHtml((apt.name || "Imovel").toUpperCase())}</h3>
    <p><strong>LOCADOR:</strong> ${escapeHtml(ownerQual)}, inscrito(a) no CPF/CNPJ n. ${escapeHtml(apt.ownerDocument || "nao informado")}, com endereco em ${escapeHtml(apt.ownerAddress || apt.address || "nao informado")}, telefone ${escapeHtml(apt.ownerPhone || "nao informado")}.</p>
    <p><strong>LOCATARIO:</strong> ${escapeHtml(client.name || "Cliente nao informado")}<br><strong>CPF:</strong> ${escapeHtml(client.document || "nao informado")}<br><strong>Endereco:</strong> ${escapeHtml(client.address || "nao informado")}</p>
    <p>As partes acima identificadas acordam com o presente Contrato de Locacao Residencial para Temporada, regido pelas clausulas seguintes:</p>
    <h4>DO OBJETO DO CONTRATO</h4>
    <p><strong>Clausula 1a.</strong> O objeto do presente instrumento e a locacao por temporada do imovel residencial situado no ${escapeHtml(propertyName)}, ${escapeHtml(apt.address || "endereco nao informado")}, pelo seguinte periodo:</p>
    <p><strong>Check In:</strong> ${dateContractBR(contract.checkIn)} (${escapeHtml(contract.checkInTime || "14:00")}) - <strong>Check Out:</strong> ${dateContractBR(contract.checkOut)} (${escapeHtml(contract.checkOutTime || "11:00")}), isto e, ${totals.stayNights} diaria(s), compreendendo ${escapeHtml(guestText(contract))}. Pet: ${escapeHtml(contract.pets || "nao")}.</p>
    <h4>DAS OBRIGACOES DO LOCADOR E DO LOCATARIO</h4>
    <p><strong>Clausula 2a.</strong> Fica obrigado o LOCATARIO a agir de acordo com o estabelecido neste contrato e nas normas do condominio, com todas as responsabilidades legais cabiveis, durante a vigencia deste instrumento.</p>
    <p><strong>Clausula 3a.</strong> Obriga-se o LOCATARIO a cuidar pela conservacao do imovel, bem como por todos os bens nele contidos, sendo responsavel por entrega-lo ao termino do prazo estipulado nas condicoes em que o recebeu.</p>
    <p><strong>Clausula 4a.</strong> Os custos dos servicos oferecidos pelo condominio, quando existentes, seguem as regras internas do empreendimento, nao podendo o LOCADOR ser responsabilizado por eventual problema ocorrido em seu fornecimento.</p>
    <p><strong>Clausula 5a.</strong> Fica proibida a entrada no condominio de pessoas que nao estejam relacionadas na reserva.</p>
    <h4>DAS REGRAS DE USO DO IMOVEL</h4>
    <ol><li>Descartar o lixo domestico ao final da hospedagem nas lixeiras indicadas pelo condominio.</li><li>Cuidar dos moveis, utensilios, eletrodomesticos e enxoval do imovel.</li><li>Nao fumar dentro do imovel.</li><li>Informar previamente a existencia de pet na reserva, quando permitido.</li><li>Atrasos no check-out podem gerar cobranca proporcional conforme a tarifa da reserva.</li></ol>
    ${apt.contractNotes ? `<p>${escapeHtml(apt.contractNotes).replace(/\n/g, "<br>")}</p>` : ""}
    ${contract.contractNotes ? `<p>${escapeHtml(contract.contractNotes).replace(/\n/g, "<br>")}</p>` : ""}
    <h4>POLITICA DE CANCELAMENTO</h4><p>${escapeHtml(contract.cancellationPolicy || "Nao reembolsavel.")}</p>
    <h4>DO VALOR E REGRAS DO DEPOSITO CAUCAO CONTRA DANOS</h4>
    <p>Um deposito caucao de ${moneyWithWords(contract.securityDeposit)} e exigido na chegada. O valor deve ser pago via transferencia bancaria ou Pix na mesma conta indicada para o pagamento das parcelas. O valor integral da caucao sera reembolsado apos vistoria no imovel ate 24 horas do check-out, quando nao houver danos ou pendencias.</p>
    <h4>DO VALOR DO ALUGUEL</h4>
    <p><strong>Clausula 7a.</strong> O LOCATARIO efetuara o deposito na conta indicada pelo LOCADOR, a titulo de aluguel, no valor de ${moneyWithWords(totals.total)}, referente ao valor total do aluguel do periodo de ${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}.</p>
    <p>O pagamento deve ser efetuado da seguinte forma:</p><ol><li>Entrada/sinal no valor de ${moneyWithWords(contract.firstPayment)}${contract.firstPaymentDate ? ` - recebido em ${dateBR(contract.firstPaymentDate)}` : ""}.</li><li>Saldo no valor de ${moneyWithWords(balance)} - a ser pago ate ${dateBR(contract.balanceDueDate || contract.checkIn)}.</li></ol>
    <p>${paymentInstructions || "Dados de pagamento nao informados no cadastro do imovel."}</p>
    <h4>DO PRAZO E DOS HORARIOS</h4><p><strong>Clausula 8a.</strong> A locacao sera no periodo de ${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)}, devendo o LOCATARIO receber e devolver a chave conforme orientacao do LOCADOR ou da recepcao do condominio.</p>
    <p>Por estarem assim justos e contratados, firmam o presente instrumento.</p>
    <div class="signature-grid"><span>Locador</span><span>Locatario</span></div>
    <p class="contract-place">Ipojuca, ${dateLongBR(issueDate)}.</p>
  </article>`;
}

function contractReportPanel() {
  const selectedId = state.settings.contractReportId || "";
  const selected = state.contracts.find((contract) => contract.id === selectedId) || null;
  const pageSize = 10;
  const ordered = [...state.contracts].sort((a, b) => String(b.checkIn || "").localeCompare(String(a.checkIn || "")) || String(b.createdAt || b.id || "").localeCompare(String(a.createdAt || a.id || "")));
  const totalPages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(Math.max(0, toNumber(state.settings.contractReportPage)), totalPages - 1);
  const pageContracts = ordered.slice(page * pageSize, page * pageSize + pageSize);
  const options = `<option value="">Selecione uma reserva</option>` + pageContracts.map((contract) => {
    const client = getById("clients", contract.clientId)?.name || "Cliente";
    const apt = getById("apartments", contract.apartmentId)?.name || "Imovel";
    return `<option value="${contract.id}" ${selected?.id === contract.id ? "selected" : ""}>${escapeHtml(client)} - ${escapeHtml(apt)} - ${dateBR(contract.checkIn)}</option>`;
  }).join("");
  const rangeStart = ordered.length ? page * pageSize + 1 : 0;
  const rangeEnd = Math.min(ordered.length, page * pageSize + pageSize);
  return `<section class="panel contract-print-panel"><div class="toolbar"><div><p class="eyebrow">Contrato</p><h2>Gerar contrato por reserva</h2></div><div class="filters contract-print-actions"><label class="field">Reserva<select id="contractReportSelect">${options}</select></label><button class="ghost-button" data-contract-page="prev" type="button" ${page <= 0 ? "disabled" : ""}>Mais recentes</button><button class="ghost-button" data-contract-page="next" type="button" ${page >= totalPages - 1 ? "disabled" : ""}>Mais antigas</button><button class="ghost-button" data-print-contract type="button" ${selected ? "" : "disabled"}>Imprimir</button><button class="primary-button" data-download-contract type="button" ${selected ? "" : "disabled"}>Baixar HTML</button></div></div><p class="muted block-help contract-page-help">Exibindo reservas ${rangeStart} a ${rangeEnd} de ${ordered.length}, das mais recentes para as mais antigas.</p>${empty(selected ? "Reserva selecionada. Use Imprimir ou Baixar HTML para gerar o contrato." : "Selecione uma reserva para gerar o contrato.")}</section>`;
}

function standaloneContractHtml(contract) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(contractFileName(contract).replace(/-/g, " "))}</title><style>body{font-family:Arial,sans-serif;line-height:1.45;color:#111;margin:32px}.contract-document{max-width:820px;margin:auto}.contract-document h2{text-align:center;font-size:18px}.contract-document h3{text-align:center;font-size:15px}.contract-document h4{margin-top:18px}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:56px}.signature-grid span{border-top:1px solid #111;text-align:center;padding-top:8px}@media print{body{margin:18mm}}</style></head><body>${contractDocumentHtml(contract)}</body></html>`;
}

function downloadSelectedContract() {
  const contract = state.contracts.find((item) => item.id === state.settings.contractReportId);
  if (!contract) return toast("Selecione uma reserva.");
  download(contractFileName(contract), standaloneContractHtml(contract), "text/html;charset=utf-8");
}

function printSelectedContract() {
  const contract = state.contracts.find((item) => item.id === state.settings.contractReportId);
  if (!contract) return toast("Selecione uma reserva.");
  const printWindow = window.open("", "_blank");
  if (!printWindow) return toast("Nao foi possivel abrir a janela de impressao.");
  printWindow.document.write(standaloneContractHtml(contract));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}
function reportsView() {
  const month = state.settings.reportMonth || state.settings.month || monthIso();
  const apartmentId = state.settings.reportApartment || "";
  const m = buildMetrics(month, apartmentId);
  const showContracts = state.settings.showContractReport === "sim";
  const brokerRows = state.brokers.map((broker) => {
    const contracts = m.contracts.filter((contract) => contract.brokerId === broker.id);
    const total = contracts.reduce((sum, contract) => sum + monthlyContractRevenue(contract, month) * (contractBrokerPercent(contract) / 100), 0);
    return [escapeHtml(broker.name), contracts.length, money(total)];
  }).filter((row) => row[1]);
  const owners = ownerSummaryRows(m, month);
  const contractReport = showContracts ? `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Periodo</p><h2>Contratos no mes</h2></div></div>${m.contracts.length ? table(["Periodo", "Cliente", "Apartamento", "Proprietario", "Hospedes", "Financeiro", "Status", "Acoes"], m.contracts.map((contract) => contractRow(contract, month))) : empty("Nenhum contrato no periodo.")}</section>` : "";
  return contractReportPanel() + `<section class="panel"><div class="toolbar"><div><p class="eyebrow">Filtros</p><h2>Resultado e indicadores</h2></div><div class="filters"><label class="field">Mes<input id="reportMonth" type="month" value="${month}"></label><label class="field">Apartamento<select id="reportApartment">${optionList("apartments", apartmentId, "Todos")}</select></label><button class="ghost-button" onclick="window.print()" type="button">Imprimir</button></div></div></section>
    <div class="grid stats">${metric("Receita", money(m.revenue), `${m.contracts.length} contrato(s)`, "ok")}${metric("Comissoes", money(m.commission), "a pagar", "info")}${metric("Despesas", money(m.expenseTotal), "custos do mes", "warn")}${metric("Resultado", money(m.net), `${percent(m.occupancy)} ocupacao`, m.net >= 0 ? "ok" : "danger")}</div>
    ${occupancyReportPanel(month, apartmentId)}
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Proprietarios</p><h2>Resultado por proprietario</h2></div></div>${owners.length ? table(["Proprietario", "Apartamentos", "Receita", "Comissoes", "Despesas", "Resultado"], owners.map((row) => [escapeHtml(row.owner), escapeHtml([...row.apartments].join(", ") || "-"), money(row.revenue), money(row.commission), money(row.expenses), money(row.net)])) : empty("Nenhum resultado por proprietario no periodo.")}</section>
    <div class="grid two-col"><section class="panel"><div class="toolbar"><div><p class="eyebrow">Corretores</p><h2>Comissoes por corretor</h2></div></div>${brokerRows.length ? table(["Corretor", "Contratos", "Comissao"], brokerRows) : empty("Nenhuma comissao no periodo.")}</section><section class="panel"><div class="toolbar"><div><p class="eyebrow">Custos</p><h2>Despesas do mes</h2></div></div>${m.expenses.length ? table(["Data", "Apartamento", "Proprietario", "Categoria", "Valor"], m.expenses.map((expense) => { const apt = getById("apartments", expense.apartmentId); return [dateBR(expense.date), escapeHtml(apt?.name || "Geral"), escapeHtml(apt ? apartmentOwnerName(apt) : "Despesa geral"), escapeHtml(expense.category), money(expense.amount)]; })) : empty("Nenhuma despesa no periodo.")}</section></div>
    <section class="panel"><div class="toolbar"><div><p class="eyebrow">Opcional</p><h2>Relatorio de contratos no mes</h2></div><button class="ghost-button" data-toggle-contract-report type="button">${showContracts ? "Ocultar relatorio" : "Gerar relatorio"}</button></div>${showContracts ? "" : empty("O relatorio de contratos fica oculto. Clique em Gerar relatorio para exibir.")}</section>
    ${contractReport}`;
}

function occupancyReportPanel(month, apartmentId = "") {
  const { year, monthIndex } = monthRange(month);
  const months = [];
  for (let item = 1; item <= monthIndex; item += 1) months.push(`${year}-${String(item).padStart(2, "0")}`);
  const activeApartments = state.apartments.filter((apt) => apt.status !== "inativo");
  const selectedApartments = apartmentId ? activeApartments.filter((apt) => apt.id === apartmentId) : activeApartments;
  const monthly = buildMetrics(month, apartmentId);
  const accumulatedData = occupancyAccumulated(months, apartmentId);
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const yearRows = months.map((item) => ({ month: item, metrics: buildMetrics(item, apartmentId) }));
  const chart = yearRows.map((row) => {
    const value = Math.max(0, Math.min(1, row.metrics.occupancy));
    const label = monthNames[monthRange(row.month).monthIndex - 1];
    return `<div class="occupancy-bar-row"><span>${label}</span><div class="occupancy-track"><i style="width:${Math.round(value * 100)}%"></i></div><strong>${percent(value)}</strong></div>`;
  }).join("");
  const detailRows = selectedApartments.map((apt) => {
    const aptMonth = buildMetrics(month, apt.id);
    const aptAccumulated = occupancyAccumulated(months, apt.id);
    return [escapeHtml(apt.name), percent(aptMonth.occupancy), `${aptMonth.occupied} diaria(s)`, percent(aptAccumulated.rate), `${aptAccumulated.occupied} diaria(s)`];
  });
  if (!apartmentId && detailRows.length) {
    detailRows.push(["<strong>Media dos imoveis</strong>", `<strong>${percent(monthly.occupancy)}</strong>`, `<strong>${monthly.occupied} diaria(s)</strong>`, `<strong>${percent(accumulatedData.rate)}</strong>`, `<strong>${accumulatedData.occupied} diaria(s)</strong>`]);
  }
  const detail = detailRows.length ? table(["Imovel", "Ocupacao mes", "Diarias mes", "Acumulado ano", "Diarias ano"], detailRows) : empty("Nenhum imovel ativo para calcular ocupacao.");
  return `<section class="panel occupancy-report"><div class="toolbar"><div><p class="eyebrow">Ocupacao</p><h2>Taxa de ocupacao</h2></div></div><div class="grid stats">${metric("Ocupacao mes", percent(monthly.occupancy), `${monthly.occupied} diaria(s) ocupada(s)`, "info")}${metric("Acumulado ano", percent(accumulatedData.rate), `${accumulatedData.occupied} diaria(s) ate ${String(monthIndex).padStart(2, "0")}/${year}`, "ok")}</div><div class="occupancy-chart">${chart || empty("Sem dados de ocupacao no periodo.")}</div><div class="occupancy-detail">${detail}</div></section>`;
}

function occupancyAccumulated(months, apartmentId = "") {
  const rows = months.map((item) => ({ month: item, metrics: buildMetrics(item, apartmentId) }));
  const occupied = rows.reduce((sum, row) => sum + row.metrics.occupied, 0);
  const available = rows.reduce((sum, row) => {
    const range = monthRange(row.month);
    const apartmentCount = apartmentId ? 1 : Math.max(1, state.apartments.filter((apt) => apt.status !== "inativo").length);
    return sum + range.end.getUTCDate() * apartmentCount;
  }, 0);
  return { occupied, available, rate: available ? occupied / available : 0 };
}

function institutionalView() {
  return `<div class="institutional-page">
    <section class="panel institutional-hero">
      <div><p class="eyebrow">Informacoes institucionais</p><h2>Sobre, suporte, privacidade e LGPD</h2><p>Orientacoes sobre o sistema de Administracao de Locacoes, o tratamento de dados e as boas praticas de atendimento e seguranca.</p></div>
      <div class="institutional-version"><span>Versao instalada</span><strong>${escapeHtml(APP_VERSION_LABEL)}</strong><small>Politica atualizada em 10/07/2026</small></div>
    </section>
    <div class="institutional-grid">
      <article class="panel institutional-card">
        <span class="institutional-number">01</span><h2>Sobre o sistema</h2>
        <p>Este aplicativo apoia a administracao de locacoes por temporada, reunindo apartamentos, hospedes, corretores, reservas, contratos, despesas, calendario, relatorios e copias de seguranca.</p>
        <dl class="institutional-details"><div><dt>Responsavel funcional</dt><dd>Administracao responsavel pelas locacoes</dd></div><div><dt>Modalidade</dt><dd>Aplicativo Web Progressivo (PWA)</dd></div><div><dt>Finalidade</dt><dd>Controle operacional, contratual e financeiro das locacoes</dd></div></dl>
        <p class="institutional-note">A pagina nao divulga nome empresarial, CNPJ ou dados pessoais do programador.</p>
      </article>
      <article class="panel institutional-card">
        <span class="institutional-number">02</span><h2>Suporte</h2>
        <p>Em caso de duvida, erro, indisponibilidade ou necessidade de correcao, procure a administracao que forneceu seu acesso ao aplicativo.</p>
        <ol class="institutional-list"><li>Informe a tela e a operacao realizada.</li><li>Descreva o resultado esperado e o que ocorreu.</li><li>Anexe captura somente quando necessario, ocultando dados de terceiros.</li><li>Informe a versao exibida nesta pagina.</li></ol>
        <p class="institutional-note">Nunca envie senha, chave do Supabase, token de acesso ou backup completo por mensagem.</p>
      </article>
      <article class="panel institutional-card">
        <span class="institutional-number">03</span><h2>Privacidade</h2>
        <p>O sistema trata dados necessarios a gestao das reservas, hospedagens e atividades administrativas relacionadas.</p>
        <h3>Dados tratados</h3><ul class="institutional-list"><li>identificacao e contato de hospedes, clientes e usuarios autorizados;</li><li>dados de apartamentos, reservas, estadias e contratos;</li><li>valores, pagamentos, comissoes, despesas e observacoes operacionais;</li><li>configuracoes, backups e registros necessarios a sincronizacao.</li></ul>
        <h3>Armazenamento</h3><p>Os dados podem permanecer no navegador para funcionamento local e no Supabase para autenticacao, sincronizacao e copia remota. O acesso deve ser limitado a usuarios autorizados e nao ha finalidade de venda de dados pessoais.</p>
      </article>
      <article class="panel institutional-card">
        <span class="institutional-number">04</span><h2>LGPD e direitos do titular</h2>
        <p>A administracao responsavel pelas locacoes deve receber e avaliar as solicitacoes dos titulares dos dados mantidos no aplicativo.</p>
        <p>Conforme aplicavel, o titular pode solicitar:</p><ul class="institutional-list"><li>confirmacao e acesso aos dados;</li><li>correcao de informacoes incompletas ou desatualizadas;</li><li>informacoes sobre uso e compartilhamento;</li><li>anonimizacao, bloqueio ou eliminacao quando cabivel;</li><li>revogacao de consentimento, quando essa for a base utilizada.</li></ul>
        <p>Para proteger os dados, a identidade do solicitante pode ser confirmada antes do atendimento. A conservacao deve respeitar obrigacoes contratuais, fiscais, legais e a necessidade de defesa de direitos.</p>
      </article>
    </div>
    <section class="panel institutional-footer"><strong>Compromisso de seguranca</strong><p>Use credenciais individuais, mantenha o dispositivo protegido, encerre a sessao ao terminar e comunique imediatamente qualquer acesso indevido ou suspeita de incidente.</p></section>
  </div>`;
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
  const brokerOptions = () => [["", "Sem corretor"], ...[...state.brokers]
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }))
    .map((broker) => [broker.id, broker.name])];
  const previousRecordsClientId = state.clients.find((client) => normalizedText(client.name) === "lancamento de registros anteriores")?.id || "";
  const reservationTotal = record.reservationTotal ?? (record.dailyRate !== undefined ? contractTotals(record).total : 0);
  const fields = {
    apartments: [
      ["name", "Nome do imovel", "text", null, true], ["colorName", "Cor do imovel", "text"], ["unitNumber", "Numero/apto", "text"], ["block", "Bloco", "text"], ["address", "Endereco do imovel para contrato", "textarea"], ["type", "Tipo", "select", [["Apartamento", "Apartamento"], ["Studio", "Studio"], ["Casa", "Casa"], ["Cobertura", "Cobertura"], ["Flat", "Flat"]]], ["status", "Status", "select", [["ativo", "Ativo"], ["manutencao", "Manutencao"], ["inativo", "Inativo"]]], ["ownerName", "Locador/proprietario", "text", null, true], ["ownerDocument", "CPF/CNPJ do locador", "text"], ["ownerNationality", "Nacionalidade do locador", "text"], ["ownerProfession", "Profissao do locador", "text"], ["ownerPhone", "Telefone do locador", "text"], ["ownerEmail", "E-mail do locador", "email"], ["ownerAddress", "Endereco do locador", "textarea"], ["ownerBankHolder", "Titular da conta/Pix", "text"], ["ownerPixKey", "Chave Pix/CPF", "text"], ["ownerBankName", "Banco", "text"], ["ownerShare", "Participacao do proprietario (%)", "number", null, false, 100], ["rooms", "Quartos", "number"], ["maxGuests", "Capacidade", "number"], ["baseDaily", "Diaria base", "number"], ["cleaningFee", "Taxa limpeza", "number"], ["defaultSecurityDeposit", "Caucao padrao", "number", null, false, 300], ["contractNotes", "Regras/observacoes fixas do contrato", "textarea"], ["notes", "Observacoes internas", "textarea"]
    ],
    clients: [
      ["name", "Nome", "text", null, true], ["document", "CPF/CNPJ", "text"], ["phone", "Telefone", "text"], ["email", "E-mail", "email"], ["address", "Endereco completo para contrato", "textarea"], ["origin", "Origem", "select", [["Indicado", "Indicado"], ["Airbnb", "Airbnb"], ["Booking", "Booking"], ["Instagram", "Instagram"], ["Direto", "Direto"], ["Outro", "Outro"]]], ["notes", "Observacoes", "textarea"]
    ],
    brokers: [
      ["name", "Nome", "text", null, true], ["phone", "Telefone", "text"], ["email", "E-mail", "email"], ["commissionDefault", "Comissao padrao (%)", "number"], ["status", "Status", "select", [["ativo", "Ativo"], ["inativo", "Inativo"]]], ["notes", "Observacoes", "textarea"]
    ],
    contracts: [
      ["code", "Codigo", "text", null, false, `CTR-${Date.now().toString().slice(-6)}`], ["hasFormalContract", "Havera contrato formal?", "select", [["sim", "Sim"], ["nao", "Nao"]], false, "nao"], ["status", "Status", "select", [["reservada", "Reservada"], ["confirmada", "Confirmada"], ["hospedada", "Hospedada"], ["finalizada", "Finalizada"], ["cancelada", "Cancelada"]]], ["clientId", "Cliente", "select", clientOptions, false, previousRecordsClientId], ["apartmentId", "Apartamento", "select", aptOptions, true], ["brokerId", "Corretor", "select", brokerOptions], ["checkIn", "Entrada", "date", null, true, todayIso()], ["checkInTime", "Horario check-in", "time", null, false, "14:00"], ["checkOut", "Saida", "date", null, true, addDays(todayIso(), 3)], ["checkOutTime", "Horario check-out", "time", null, false, "11:00"], ["guests", "Adultos", "number", null, false, 2], ["children", "Criancas", "number", null, false, 0], ["pets", "Pet", "select", [["nao", "Nao"], ["sim", "Sim"]]], ["paymentStatus", "Pagamento", "select", [["pendente", "Pendente"], ["parcial", "Parcial"], ["pago", "Pago"]], false, "pago"], ["reservationTotal", "Valor total da reserva", "number", null, true, reservationTotal], ["dailyRate", "Diaria calculada", "number", null, false, record.dailyRate ?? 0, true], ["cleaningFee", "Taxa limpeza", "number", null, false, 0], ["discount", "Desconto", "number", null, false, 0], ["deposit", "Valor recebido", "number", null, false, 0], ["securityDeposit", "Deposito caucao", "number", null, false, 0], ["firstPayment", "Entrada/sinal", "number", null, false, 0], ["firstPaymentDate", "Data da entrada", "date"], ["balanceDueDate", "Vencimento do saldo", "date"], ["issueDate", "Data de emissao do contrato", "date", null, false, todayIso()], ["cancellationPolicy", "Politica de cancelamento", "text", null, false, "Nao reembolsavel."], ["paymentInstructions", "Instrucoes de pagamento", "textarea"], ["contractNotes", "Observacoes especificas do contrato", "textarea"], ["notes", "Observacoes internas", "textarea"]
    ],
    expenses: [
      ["date", "Data", "date", null, true, todayIso()], ["apartmentId", "Apartamento", "select", () => [["", "Despesa geral"], ...state.apartments.map((apt) => [apt.id, apt.name])]], ["category", "Categoria", "select", [["Limpeza", "Limpeza"], ["Manutencao", "Manutencao"], ["Condominio", "Condominio"], ["Energia", "Energia"], ["Agua", "Agua"], ["Internet", "Internet"], ["Enxoval", "Enxoval"], ["Marketing", "Marketing"], ["Outros", "Outros"]]], ["amount", "Valor", "number", null, true], ["paid", "Status", "select", [["pago", "Pago"], ["pendente", "Pendente"]]], ["description", "Descricao", "textarea"]
    ]
  }[collection] || [];
  return fields.map(([key, label, type, options, required, fallback, readonly]) => ({ key, label, type, options, required, readonly, value: record[key] ?? fallback ?? "" }));
}

function openForm(collection, id = null) {
  const dialog = document.querySelector("#recordDialog");
  const fields = document.querySelector("#formFields");
  const record = id ? state[collection].find((item) => item.id === id) : {};
  const label = collectionLabels[collection]?.[0] || "registro";
  dialog.dataset.collection = collection;
  dialog.dataset.id = id || "";
  dialog.classList.toggle("reservation-dialog", collection === "contracts");
  document.querySelector("#dialogTitle").textContent = id ? `Editar ${label}` : `Novo ${label}`;
  fields.innerHTML = fieldsFor(collection, record).map(fieldHtml).join("");
  bindFormEnhancements(collection);
  dialog.showModal();
}

function bindFormEnhancements(collection) {
  document.querySelectorAll("[data-money-field]").forEach((input) => {
    input.addEventListener("blur", () => input.value = brazilianValue(input.value));
  });
  if (collection === "contracts") {
    const watched = ["checkIn", "checkOut", "reservationTotal", "cleaningFee", "discount"]
      .map((id) => document.querySelector(`#${id}`)).filter(Boolean);
    const updateDailyRate = () => {
      const stayNights = nights(document.querySelector("#checkIn")?.value, document.querySelector("#checkOut")?.value);
      const total = toNumber(document.querySelector("#reservationTotal")?.value);
      const cleaning = toNumber(document.querySelector("#cleaningFee")?.value);
      const discount = toNumber(document.querySelector("#discount")?.value);
      const dailyRate = document.querySelector("#dailyRate");
      if (dailyRate) dailyRate.value = brazilianValue(stayNights > 0 ? Math.max(0, (total - cleaning + discount) / stayNights) : 0);
    };
    watched.forEach((input) => input.addEventListener("input", updateDailyRate));
    updateDailyRate();
    return;
  }
  if (collection !== "clients") return;
  const documentInput = document.querySelector("#document");
  const nameInput = document.querySelector("#name");
  if (!documentInput) return;
  documentInput.addEventListener("blur", async () => {
    const message = validateDocumentValue(documentInput.value);
    documentInput.setCustomValidity(message);
    if (message) {
      toast(message);
      return;
    }
    const digits = onlyDigits(documentInput.value);
    if (digits.length !== 14 || !nameInput) return;
    try {
      const name = await lookupCnpjName(digits);
      if (name && !nameInput.value.trim()) {
        nameInput.value = name;
        toast("Nome preenchido pelo CNPJ.");
      }
    } catch (error) {
      toast(error.message || "Nao foi possivel consultar o CNPJ.");
    }
  });
}

function fieldHtml(field) {
  const full = field.type === "textarea" || ["address", "ownerAddress", "notes", "description", "contractNotes", "paymentInstructions"].includes(field.key) ? " full" : "";
  const required = field.required ? "required" : "";
  if (field.type === "select") {
    const options = typeof field.options === "function" ? field.options() : field.options;
    return `<div class="field${full}"><label for="${field.key}">${field.label}</label><select id="${field.key}" name="${field.key}" ${required}>${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(field.value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></div>`;
  }
  if (field.type === "textarea") return `<div class="field${full}"><label for="${field.key}">${field.label}</label><textarea id="${field.key}" name="${field.key}">${escapeHtml(field.value)}</textarea></div>`;
  const isMoney = moneyFieldKeys.has(field.key);
  const inputType = isMoney ? "text" : field.type;
  const value = isMoney ? brazilianValue(field.value) : field.value;
  return `<div class="field${full}"><label for="${field.key}">${field.label}</label><input id="${field.key}" name="${field.key}" type="${inputType}" value="${escapeHtml(value)}" ${isMoney ? "inputmode='decimal' data-money-field" : field.type === "number" ? "step='0.01'" : ""} ${field.readonly ? "readonly" : ""} ${required} /></div>`;
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

  if (collection === "clients") {
    const documentError = validateDocumentValue(record.document);
    if (documentError) return toast(documentError);
  }

  if (collection === "contracts") {
    const stayNights = nights(record.checkIn, record.checkOut);
    record.dailyRate = stayNights > 0 ? Math.max(0, (toNumber(record.reservationTotal) - toNumber(record.cleaningFee) + toNumber(record.discount)) / stayNights) : 0;
    delete record.brokerPercent;
    const error = validateContract({ ...record, id: id || "draft" });
    if (error) return toast(error);
  }

  const normalizedRecord = collection === "apartments" ? normalizeApartment(record) : record;
  if (id) state[collection] = state[collection].map((item) => item.id === id ? { ...item, ...normalizedRecord } : item);
  else state[collection].push({ id: uid(), createdAt: new Date().toISOString(), ...normalizedRecord });
  saveState("form_save");
  dialog.close();
  render();
  toast("Registro salvo.");
}

function validateContract(contract) {
  if (!state.apartments.length) return "Cadastre ao menos um apartamento.";
  if ((contract.hasFormalContract || "sim") !== "nao" && (!state.clients.length || !contract.clientId)) return "Selecione um cliente para gerar contrato formal.";
  if (parseDate(contract.checkOut) <= parseDate(contract.checkIn)) return "A saida precisa ser posterior a entrada.";
  if (toNumber(contract.reservationTotal) < Math.max(0, toNumber(contract.cleaningFee) - toNumber(contract.discount))) return "O valor total precisa cobrir a taxa de limpeza, considerando o desconto.";
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
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportCalendarForWhatsapp() {
  const month = state.settings.month || monthIso();
  const apartmentId = state.settings.calendarApartment || "";
  const image = calendarWhatsappImage(month, apartmentId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}"><foreignObject width="100%" height="100%">${image.html}</foreignObject></svg>`;
  try {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const picture = new Image();
    await new Promise((resolve, reject) => {
      picture.onload = resolve;
      picture.onerror = reject;
      picture.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(picture, 0, 0);
    URL.revokeObjectURL(url);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    if (!pngBlob) throw new Error("Nao foi possivel gerar PNG.");
    downloadBlob(`calendario-whatsapp-${month}.png`, pngBlob);
    try {
      await navigator.clipboard.writeText(image.summary);
      toast("Imagem do calendario gerada e resumo copiado.");
    } catch {
      toast("Imagem do calendario gerada.");
    }
  } catch {
    download(`calendario-whatsapp-${month}.svg`, svg, "image/svg+xml;charset=utf-8");
    toast("PNG indisponivel neste navegador. Gerei o calendario em SVG.");
  }
}

function calendarWhatsappImage(month, apartmentId = "") {
  const { start, end } = monthRange(month);
  const monthLabel = month.split("-").reverse().join("/");
  const scope = apartmentId ? getById("apartments", apartmentId)?.name || "Apartamento" : "Todos os apartamentos";
  const cells = [];
  for (let i = 0; i < start.getUTCDay(); i++) cells.push(null);
  for (let day = 1; day <= end.getUTCDate(); day++) cells.push(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day)));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Math.max(5, cells.length / 7);
  const summary = calendarWhatsappSummary(month, apartmentId);
  const summaryLines = summary.split("\n");
  const width = 1240;
  const height = 174 + rows * 128 + 64 + Math.max(92, summaryLines.length * 30) + 38;
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => `<div class="export-weekday">${day}</div>`).join("");
  const days = cells.map((date) => {
    if (!date) return `<div class="export-day muted-day"></div>`;
    const events = calendarEventsForDate(date, apartmentId);
    return `<div class="export-day"><strong>${date.getUTCDate()}</strong>${events.map(calendarExportEventHtml).join("")}</div>`;
  }).join("");
  const summaryHtml = summaryLines.map((line, index) => `<div class="${index ? "summary-line" : "summary-title"}">${escapeHtml(line)}</div>`).join("");
  const html = `<div xmlns="http://www.w3.org/1999/xhtml" class="calendar-export-image"><style>
    .calendar-export-image{box-sizing:border-box;width:${width}px;height:${height}px;padding:34px;background:#f8fafc;color:#0f172a;font-family:Arial,'Segoe UI',sans-serif}
    .export-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:24px}
    .export-kicker{margin:0 0 7px;color:#0f766e;font-size:18px;font-weight:900;text-transform:uppercase;white-space:nowrap}
    .export-title{margin:0;font-size:42px;line-height:1;font-weight:900;white-space:nowrap}
    .export-scope{padding:12px 16px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;font-size:20px;font-weight:800;white-space:nowrap}
    .export-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
    .export-weekday{padding:10px 6px;border-radius:10px;background:#0f172a;color:#fff;text-align:center;font-size:15px;font-weight:900;text-transform:uppercase;white-space:nowrap}
    .export-day{min-height:112px;padding:9px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;overflow:hidden}
    .muted-day{background:#e2e8f0}
    .export-day>strong{display:block;margin-bottom:6px;font-size:18px;font-weight:900;white-space:nowrap}
    .export-event{display:grid;gap:2px;margin-top:5px;padding:7px 8px;border-left:6px solid var(--event-color);border-radius:8px;background:var(--event-bg);font-size:13px;line-height:1.1;font-weight:800;overflow:hidden}
    .export-event.checkout{background:#fff7ed;border-left-style:dashed;color:#9a3412}
    .export-event span,.export-event small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .export-summary{margin-top:28px;padding:18px 20px;border:1px solid #cbd5e1;border-radius:14px;background:#fff}
    .summary-title{margin-bottom:10px;color:#0f766e;font-size:20px;font-weight:900;white-space:nowrap}
    .summary-line{padding:5px 0;border-top:1px solid #e2e8f0;font-size:17px;font-weight:700;white-space:nowrap}
  </style><div class="export-header"><div><p class="export-kicker">Ocupacao mensal</p><h1 class="export-title">Calendario ${escapeHtml(monthLabel)}</h1></div><div class="export-scope">${escapeHtml(scope)}</div></div><div class="export-grid">${weekdays}${days}</div><div class="export-summary">${summaryHtml}</div></div>`;
  return { html, width, height, summary };
}

function calendarExportEventHtml(event) {
  const contract = event.contract || event;
  const apt = getById("apartments", contract.apartmentId);
  const client = getById("clients", contract.clientId);
  const aptName = apt?.name || apt?.unitNumber || "Apto";
  const clientName = client?.name || (contract.hasFormalContract === "nao" ? "Reserva simples" : "Cliente");
  const color = colorForName(apt?.colorName || apt?.name) || "#2563eb";
  const isCheckout = event.type === "checkout";
  return `<div class="export-event ${isCheckout ? "checkout" : ""}" style="--event-color:${escapeHtml(color)};--event-bg:${escapeHtml(hexToRgba(color, 0.13))}"><span>${escapeHtml(aptName)}</span><small>${isCheckout ? "Saida - " : ""}${escapeHtml(shortName(clientName))} - ${contract.guests || 0}h</small></div>`;
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || "").replace("#", "");
  const expanded = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const number = /^[0-9a-f]{6}$/i.test(expanded) ? parseInt(expanded, 16) : 0x2563eb;
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function calendarWhatsappSummary(month, apartmentId = "") {
  const contracts = getMonthContracts(month, apartmentId).sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)));
  const lines = [`Calendario de ocupacao ${month.split("-").reverse().join("/")}`];
  if (apartmentId) lines.push(`Apartamento: ${getById("apartments", apartmentId)?.name || "-"}`);
  contracts.forEach((contract) => {
    const client = getById("clients", contract.clientId);
    const apt = getById("apartments", contract.apartmentId);
    lines.push(`${dateBR(contract.checkIn)} a ${dateBR(contract.checkOut)} - ${shortName(client?.name || "Reserva simples")} - ${apt?.name || "Apto"} - ${contract.guests || 0} adulto(s)`);
  });
  if (lines.length === 1 || (apartmentId && lines.length === 2)) lines.push("Sem reservas no periodo.");
  return lines.join("\n");
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
  document.querySelector("#contractFilterStart")?.addEventListener("change", (event) => {
    state.settings.contractFilterStart = event.target.value;
    saveState("contract_filter_start");
    render();
  });
  document.querySelector("#contractFilterEnd")?.addEventListener("change", (event) => {
    state.settings.contractFilterEnd = event.target.value;
    saveState("contract_filter_end");
    render();
  });
  document.querySelector("#contractFilterApartment")?.addEventListener("change", (event) => {
    state.settings.contractFilterApartment = event.target.value;
    saveState("contract_filter_apartment");
    render();
  });
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
  document.querySelector("#calendarMonthSelect")?.addEventListener("change", updateCalendarMonthFromSelects);
  document.querySelector("#calendarYearSelect")?.addEventListener("change", updateCalendarMonthFromSelects);
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
  document.querySelector("#contractReportSelect")?.addEventListener("change", (event) => {
    state.settings.contractReportId = event.target.value;
    saveState("contract_report_change");
    render();
  });
  document.querySelector("[data-calendar-export]")?.addEventListener("click", exportCalendarForWhatsapp);
  document.querySelector("[data-toggle-contract-report]")?.addEventListener("click", () => {
    state.settings.showContractReport = state.settings.showContractReport === "sim" ? "nao" : "sim";
    saveState("toggle_contract_report");
    render();
  });
}

function updateCalendarMonthFromSelects() {
  const month = document.querySelector("#calendarMonthSelect")?.value || monthIso().slice(5, 7);
  const year = document.querySelector("#calendarYearSelect")?.value || monthIso().slice(0, 4);
  state.settings.month = `${year}-${month}`;
  saveState("calendar_month_select_change");
  render();
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
  const accessDate = document.querySelector("#topAccessLabel");
  if (accessDate) accessDate.textContent = APP_CHANGE_DATE_LABEL;

  const access = document.querySelector("#topAccessLabel");
  if (access && !access.textContent) access.textContent = location.host || "Acesso local";
}

function getAccessUrl() {
  const isLocalHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const base = location.protocol.startsWith("http") && !isLocalHost ? location.href : WEB_ACCESS_URL;
  const url = new URL(base, location.href);
  const loginPath = isLocalHost ? "login.html" : "login";
  url.pathname = url.pathname.endsWith("/") ? `${url.pathname}${loginPath}` : url.pathname.replace(/[^/]*$/, loginPath);
  url.searchParams.set("brand", "cupe-beach-living");
  url.searchParams.set("v", "2.1.30-auto-20260715-1709");
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
  location.replace("login.html?v=2.1.30-auto-20260715-1709");
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
  const clearReservationFiltersBtn = event.target.closest("[data-clear-reservation-filters]");
  if (clearReservationFiltersBtn) {
    state.settings.contractFilterStart = "";
    state.settings.contractFilterEnd = "";
    state.settings.contractFilterApartment = "";
    saveState("contract_filters_clear");
    render();
    return;
  }
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

  const printContractBtn = event.target.closest("[data-print-contract]");
  if (printContractBtn) printSelectedContract();

  const downloadContractBtn = event.target.closest("[data-download-contract]");
  if (downloadContractBtn) downloadSelectedContract();

  const contractPageBtn = event.target.closest("[data-contract-page]");
  if (contractPageBtn) {
    const current = Math.max(0, toNumber(state.settings.contractReportPage));
    state.settings.contractReportPage = Math.max(0, current + (contractPageBtn.dataset.contractPage === "next" ? 1 : -1));
    state.settings.contractReportId = "";
    saveState("contract_report_page");
    render();
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
  if (version) version.textContent = APP_VERSION_LABEL + " - " + APP_CHANGE_DATE_LABEL;
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













