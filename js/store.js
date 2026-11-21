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
      capacity: { Tiago: 2, Micaela: 4 }, // horas de operação por dia útil (Tiago: + 2h de prospecção)
      workDays: 21,
      hoursPerCreative: 0.25,
      reviewLimit: 2,
      schedule: { op: ['13:00', '15:00'], pr: ['15:00', '17:00'] },
      goals: { calls: 30, convos: 5, pres: 1 },
    },
    daily: {},
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
function touch() { S.updatedAt = new Date().toISOString(); if (typeof Sync !== 'undefined') Sync.changed(); }
function save() {
  touch();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
    catch (e) { alert('Não foi possível salvar no aparelho: ' + e.message); }
  }, 80);
}
function saveNow() { touch(); clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
// recebe os dados vindos de outro aparelho (não marca como alteração local)
function applyRemote(data) {
  clearTimeout(saveTimer);
  S = Object.assign(defaultState(), data, { settings: Object.assign(defaultState().settings, data.settings) });
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
  if (typeof onRemoteApplied === 'function') onRemoteApplied();
}

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

const AGENDAS = {
  1: 'PAUTA\n1. Resultados do período (investimento, contatos, agendamentos, pacientes)\n2. O que foi feito desde a última reunião\n3. Campanhas e criativos: o que manter e o que mudar\n4. Novidade do mês no método\n5. Pendências da clínica\n\nATA\nPresentes:\nDecisões:\nPróximos passos (quem / até quando):',
  2: 'PAUTA\n1. Atendimento: tempo de resposta, confirmações e faltas\n2. Revisão de conversas reais\n3. Treinamento do dia (objeções e fechamento)\n4. Registro de contatos e fechamentos\n5. Combinados para as próximas 2 semanas\n\nATA\nPresentes:\nDecisões:\nPróximos passos (quem / até quando):',
};
function agendaFor(title) { return /^Reunião 2/.test(title) ? AGENDAS[2] : AGENDAS[1]; }
function fillAgendas() { let n = 0; S.tasks.forEach((t) => { if (t.meeting && !(t.notes || '').trim()) { t.notes = agendaFor(t.title); n++; } }); return n; }

// fins de semana: se a clínica não trabalha (padrão), a data vai para sexta antes ou segunda depois, sem sair do mês
function workday(clinic, n, due) {
  if (clinic.weekends) return due;
  const w = parseD(due).getDay(); if (w !== 0 && w !== 6) return due;
  const s0 = monthStart(clinic, n), e0 = monthEnd(clinic, n);
  const prevFri = addDays(due, w === 6 ? -1 : -2), nextMon = addDays(due, w === 6 ? 2 : 1);
  if (w === 6) return prevFri >= s0 ? prevFri : nextMon <= e0 ? nextMon : due;
  return nextMon <= e0 ? nextMon : prevFri >= s0 ? prevFri : due;
}
function mkTask(clinic, n, it, kind, due) {
  due = workday(clinic, n, due);
  return { id: uid(), clinicId: clinic.id, month: n, kind, pillar: it.p, title: it.t, owner: it.o, due, priority: kind === 'novo' ? 'alta' : 'media',
    status: 'a_fazer', checklist: (it.c || []).map((t) => ({ t, done: false })), meeting: !!it.meeting, weekly: !!it.weekly,
    hours: it.h || 1, evidence: '', notes: it.meeting ? agendaFor(it.t) : '', doneAt: null, history: [{ at: new Date().toISOString(), who: S.me, what: 'Criada pela jornada MBCR' }] };
}
// rotinas do mês n (mensais + segundas-feiras). fromDate: só gera a partir dessa data; withMeetings: inclui reuniões
function genRoutines(clinic, n, fromDate, withMeetings = true) {
  const base = monthStart(clinic, n), end = monthEnd(clinic, n); const out = [];
  ROUTINES.forEach((it) => {
    if (it.skip && it.skip.includes(n)) return;
    if (it.meeting && !withMeetings) return;
    const due = addDays(base, it.d - 1); if (fromDate && due < fromDate) return;
    out.push(mkTask(clinic, n, { ...it, t: n >= 11 && it.alt ? it.alt : it.t }, 'rotina', due));
  });
  for (let d = base; d <= end; d = addDays(d, 1)) {
    if (parseD(d).getDay() !== 1 || (fromDate && d < fromDate)) continue;
    WEEKLY.forEach((it) => out.push(mkTask(clinic, n, { ...it, t: n >= 11 && it.alt ? it.alt : it.t, weekly: true }, 'rotina', d)));
  }
  return out;
}
function startJourney(clinic) {
  // copia o modelo atual para a clínica (snapshot)
  clinic.journey = { startedAt: new Date().toISOString(), routinesV: 2, template: MONTHS.map((m) => ({ n: m.n, title: m.title, short: m.short, pillars: m.pillars, desc: m.desc, outputs: m.outputs })) };
  for (const m of MONTHS) {
    const base = monthStart(clinic, m.n);
    m.items.forEach((it) => S.tasks.push(mkTask(clinic, m.n, it, 'novo', addDays(base, it.d - 1))));
    S.tasks.push(...genRoutines(clinic, m.n));
    for (let i = 1; i <= CREATIVES_PER_MONTH; i++) {
      S.creatives.push({ id: uid(), clinicId: clinic.id, month: m.n, slot: i, type: i <= 3 ? 'video' : 'imagem', title: '', procedure: '', status: 'roteiro', reviews: 0, due: addDays(base, 8), notes: '' });
    }
  }
  log(`Iniciou jornada MBCR a partir de ${fmtDate(clinic.startDate)}`, clinic.id);
}
// atualiza as rotinas de uma jornada já iniciada: só daqui para frente, sem mexer no que foi feito nem nas reuniões
function realignWeekends(clinic) {
  const today = todayStr(); let n = 0;
  S.tasks.forEach((t) => { if (t.clinicId === clinic.id && t.status !== 'concluido' && t.due >= today) { const d = workday(clinic, t.month, t.due); if (d !== t.due) { t.due = d; n++; } } });
  return n;
}
function refreshRoutines(clinic) {
  if (!clinic.journey) return 0;
  const today = todayStr();
  S.tasks = S.tasks.filter((t) => !(t.clinicId === clinic.id && t.kind === 'rotina' && !t.meeting && !t.custom && t.status === 'a_fazer' && t.due >= today));
  let added = 0;
  for (let n = 1; n <= 12; n++) { if (monthEnd(clinic, n) < today) continue; const list = genRoutines(clinic, n, today, false); S.tasks.push(...list); added += list.length; }
  realignWeekends(clinic);
  clinic.journey.routinesV = 2;
  log(`Atualizou as rotinas de ${clinic.name} (ciclo de campanha e rotinas semanais)`, clinic.id);
  return added;
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
  if (!S.settings.v2) { S.settings.v2 = true; if (S.settings.capacity.Tiago === 4) S.settings.capacity.Tiago = 2; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
