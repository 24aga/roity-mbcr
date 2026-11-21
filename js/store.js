// Persistência local (no aparelho) + utilidades de data/formatação.
'use strict';

const STORE_KEY = 'roity-mbcr-v1';
const TZ = 'America/Sao_Paulo';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- datas (strings YYYY-MM-DD, fuso de São Paulo) ----------
function todayStr() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA => YYYY-MM-DD
}
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtISO(dt) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return fmtISO(d); }
function addMonths(s, n) {
  const d = parseD(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last)); return fmtISO(d);
}
function diffDays(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function fmtDate(s, opts) {
  if (!s) return '—';
  return parseD(s).toLocaleDateString('pt-BR', opts || { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtShort(s) { return s ? parseD(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '—'; }
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function money(v) { return v == null || v === '' || isNaN(v) ? 'não informado' : BRL.format(Number(v)); }
function pct(v) { return v == null || !isFinite(v) ? 'não informado' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'; }
function num(v) { return v == null || v === '' ? null : Number(v); }

// ---------- estado ----------
let S;

function defaultState() {
  return {
    version: 1,
    me: 'Tiago',
    settings: {
      theme: 'auto',
      goalClinics: 20,
      capacity: { Tiago: 4, Micaela: 4 }, // horas por dia útil
      workDays: 21,
      hoursPerCreative: 0.25,
      reviewLimit: 2,
    },
    clinics: [], tasks: [], creatives: [], metrics: [], log: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const s = JSON.parse(raw); return Object.assign(defaultState(), s, { settings: Object.assign(defaultState().settings, s.settings) }); }
  } catch (e) { console.error(e); }
  return null;
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { alert('Não foi possível salvar no aparelho: ' + e.message); }
  }, 80);
}
function saveNow() { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(S)); }

function log(what, clinicId) {
  S.log.unshift({ at: new Date().toISOString(), who: S.me, what, clinicId: clinicId || null });
  if (S.log.length > 1500) S.log.length = 1500;
}

// ---------- jornada ----------
function monthStart(clinic, n) { return addMonths(clinic.startDate, n - 1); }
function monthEnd(clinic, n) { return addDays(addMonths(clinic.startDate, n), -1); }
function currentMonth(clinic, today = todayStr()) {
  if (!clinic.startDate || !clinic.journey) return 0;
  if (today < clinic.startDate) return 0;
  for (let n = 1; n <= 12; n++) if (today <= monthEnd(clinic, n)) return n;
  return 13; // jornada encerrada
}

function startJourney(clinic) {
  // copia o modelo atual para a clínica (snapshot)
  clinic.journey = { startedAt: new Date().toISOString(), template: MONTHS.map((m) => ({ n: m.n, title: m.title, short: m.short, pillars: m.pillars, desc: m.desc, outputs: m.outputs })) };
  for (const m of MONTHS) {
    const base = monthStart(clinic, m.n);
    const mk = (it, kind) => ({
      id: uid(), clinicId: clinic.id, month: m.n, kind, pillar: it.p, title: it.t,
      owner: it.o, due: addDays(base, it.d - 1), priority: kind === 'novo' ? 'alta' : 'media',
      status: 'a_fazer', checklist: (it.c || []).map((t) => ({ t, done: false })), meeting: !!it.meeting,
      hours: it.h || 1, evidence: '', notes: '', doneAt: null, history: [{ at: new Date().toISOString(), who: S.me, what: 'Criada pela jornada MBCR' }],
    });
    m.items.forEach((it) => S.tasks.push(mk(it, 'novo')));
    ROUTINES.forEach((it) => {
      const t = mk(it, 'rotina');
      if (m.n >= 11 && it.t.startsWith('Gestão e otimização Meta Ads')) t.title = 'Meta Ads — conforme decisão de mídia (pausar/manter)';
      S.tasks.push(t);
    });
    for (let i = 1; i <= CREATIVES_PER_MONTH; i++) {
      S.creatives.push({ id: uid(), clinicId: clinic.id, month: m.n, slot: i, type: i <= 3 ? 'video' : 'imagem', title: '', procedure: '', status: 'roteiro', reviews: 0, due: addDays(base, 13), notes: '' });
    }
  }
  log(`Iniciou jornada MBCR a partir de ${fmtDate(clinic.startDate)}`, clinic.id);
}

function deleteClinic(id) {
  S.clinics = S.clinics.filter((c) => c.id !== id);
  S.tasks = S.tasks.filter((t) => t.clinicId !== id);
  S.creatives = S.creatives.filter((t) => t.clinicId !== id);
  S.metrics = S.metrics.filter((t) => t.clinicId !== id);
}

// ---------- status ----------
function taskOverdue(t, today = todayStr()) { return t.status !== 'concluido' && t.due && t.due < today; }
function taskStatusLabel(t) {
  if (taskOverdue(t)) return { k: 'atrasado', l: 'Atrasado' };
  const f = TASK_STATUS.find((s) => s[0] === t.status); return { k: t.status, l: f ? f[1] : t.status };
}
function groupState(tasks) {
  const total = tasks.length; const done = tasks.filter((t) => t.status === 'concluido').length;
  const p = total ? done / total : 0;
  let k = 'nao_iniciado', l = 'Não iniciado';
  if (total && done === total) { k = 'concluido'; l = 'Concluído'; }
  else if (tasks.some((t) => t.status === 'bloqueado')) { k = 'bloqueado'; l = 'Bloqueado'; }
  else if (tasks.some((t) => taskOverdue(t))) { k = 'atrasado'; l = 'Atrasado'; }
  else if (done > 0 || tasks.some((t) => t.status === 'andamento')) { k = 'andamento'; l = 'Em andamento'; }
  return { k, l, p, done, total };
}

// ---------- métricas ----------
function calcMetrics(m) {
  const g = (k) => num(m[k]);
  const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
  const opp = g('qualified') ?? g('leads');
  return {
    cpl: div(g('media'), g('leads')),
    cacMedia: div(g('media'), g('paying')),
    closeRate: div(g('paying'), opp),
    closeBase: g('qualified') != null ? 'qualificados' : 'leads',
    attendRate: div(g('attended'), g('confirmed')),
    roas: div(g('attributedRevenue'), g('media')),
  };
}

// ---------- dados de demonstração ----------
function seedDemo() {
  const start = addMonths(todayStr().slice(0, 8) + '01', -2);
  const c = {
    id: uid(), demo: true, name: 'Clínica Exemplo (DEMO)', legalName: '', segment: 'estetica', city: 'Curitiba', uf: 'PR',
    territory: 'Curitiba — bairros Batel e Água Verde', contact: 'Responsável fictício', phone: '', humanResp: 'Recepcionista (fictícia)',
    baseRevenue: 32000, mediaBudget: 3000, price: 2500, setupFee: 1500, setupWaived: false, setupReason: '',
    startDate: start, stage: 'ativo', payment: 'em_dia', exclusivity: 'em_analise', goal: 'Meta individual a definir no diagnóstico',
    guarantee: 'em_definicao', notes: 'Dados fictícios só para demonstrar o app. Pode excluir em Configurações.', createdAt: new Date().toISOString(),
  };
  S.clinics.push(c); startJourney(c);
  // marca o mês 1 quase inteiro como concluído e parte do mês 2
  // demo realista: quase tudo que já venceu está feito, com uma pendência bloqueada e uma atrasada
  const today = todayStr(); let lateLeft = 1;
  S.tasks.filter((t) => t.clinicId === c.id).forEach((t) => {
    if (t.due >= today) { if (t.due <= addDays(today, 3) && t.kind === 'novo') t.status = 'andamento'; return; }
    if (/CRM operacional/.test(t.title)) { t.status = 'bloqueado'; return; }
    if (t.month >= 3 && t.kind === 'novo' && lateLeft-- > 0) return; // fica atrasada
    t.status = 'concluido'; t.doneAt = t.due; t.checklist.forEach((i) => (i.done = true));
  });
  S.creatives.filter((x) => x.clinicId === c.id && x.month === 1).forEach((x, i) => (x.status = i < 5 ? 'em_uso' : 'nao_necessario'));
  S.clinics.push({
    id: uid(), demo: true, name: 'Odonto Exemplo (DEMO)', segment: 'odontologia', city: 'Londrina', uf: 'PR', territory: 'Londrina — região central',
    contact: '', phone: '', humanResp: '', baseRevenue: 28000, mediaBudget: 2500, price: 2500, setupFee: 1500, setupWaived: true,
    setupReason: 'Campanha comercial (exemplo)', startDate: addMonths(start, 3), stage: 'proposta', payment: 'na', exclusivity: 'nao_solicitada',
    goal: '', guarantee: 'em_definicao', notes: 'Lead fictício no pipeline.', createdAt: new Date().toISOString(),
  });
  log('Criou dados de demonstração');
}

function initStore() {
  S = load();
  if (!S) { S = defaultState(); seedDemo(); saveNow(); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
