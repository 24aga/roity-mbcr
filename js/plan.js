// Plano de Campanhas: classes da base, ondas por região, cota diária, verba e replanejamento.
'use strict';

const HOLIDAYS = ['2026-12-25', '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-26', '2027-04-21', '2027-05-01', '2027-05-27', '2027-09-07', '2027-10-12', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25',
  '2028-01-01', '2028-02-28', '2028-02-29', '2028-04-14', '2028-04-21', '2028-05-01', '2028-06-15', '2028-09-07', '2028-10-12', '2028-11-02', '2028-11-15', '2028-11-20', '2028-12-25'];
const TIERS = { A: 'Qualificada', B: 'Estruturada', C: 'MEI estabelecido', D: 'MEI recente' };
const TIER_DESC = { A: 'Não MEI · 2+ anos · estética', B: 'Não MEI · nova ou outra área', C: 'MEI · 2+ anos', D: 'MEI · menos de 2 anos' };
function planCfg() {
  const d = { start: '2026-11-27', adsLead: 4, budgetDay: 40, perDay: { Tiago: 100, Micaela: 100 }, callsPer: 30, tiers: ['A', 'B'], order: ['MT', 'GO', 'MS', 'MG', 'PR', 'SC'], waveDays: 5, minAdRegion: 80, diagSlots: 3, diagMin: 30, blocked: [] };
  const s = S.settings.plan || {}; return { ...d, ...s, perDay: { ...d.perDay, ...(s.perDay || {}) } };
}
const dailyCap = (cfg) => Object.values(cfg.perDay).reduce((a, b) => a + (+b || 0), 0);
function tierOf(r) { const age = r[8] ? new Date().getFullYear() - r[8] : 0; if (!r[9] && age >= 2 && r[10] === '9602502') return 'A'; if (!r[9]) return 'B'; return age >= 2 ? 'C' : 'D'; }
function isWorkday(d, cfg = planCfg()) { const w = parseD(d).getDay(); return w !== 0 && w !== 6 && !HOLIDAYS.includes(d) && !(cfg.blocked || []).includes(d); }
function nextWork(d, cfg) { let x = d; while (!isWorkday(x, cfg)) x = addDays(x, 1); return x; }
function prevWork(d, cfg) { let x = d; while (!isWorkday(x, cfg)) x = addDays(x, -1); return x; }

// ---------- leads trabalhados (registro compacto) ----------
function isTouched(key) { if (S.touch && S.touch[key]) return true; const c = S.clinics.find((x) => x.poolKey === key); return !!(c && touched(c)); }
function touchedSet() { const s = new Set(Object.keys(S.touch || {})); S.clinics.forEach((c) => { if (c.poolKey && touched(c)) s.add(c.poolKey); }); return s; }
const keyIdx = {};
function rowByKey(uf, key) {
  const st = Pool.data[uf]; if (!st) return null;
  if (!keyIdx[uf] || keyIdx[uf].n !== st.obj.rows.length) { const m = new Map(); st.obj.rows.forEach((r) => m.set(r[0], r)); keyIdx[uf] = { n: st.obj.rows.length, m }; }
  return keyIdx[uf].m.get(key) || null;
}

// ---------- gerar o plano ----------
// nomes da Kenai que diferem do IBGE
const CITY_ALIAS = { 'santo antonio do leverger': 'santo antonio de leverger', 'bom jesus': 'bom jesus de goias', 'brasopolis': 'brazopolis', 'balneario de picarras': 'balneario picarras' };
const naC = (s) => { const k = noAcc(s).replace(/'/g, '').replace(/-/g, ' '); return CITY_ALIAS[k] || k; };
const UF_NAME = { MT: 'Mato Grosso', GO: 'Goiás', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PR: 'Paraná', SC: 'Santa Catarina' };
const AD_MIN_REGION = 25, AD_MIN_CITY = 40, AD_MAX = 8;
// locais do anúncio: cidades-polo das regiões imediatas (IBGE) com 20+ clínicas na onda; cidades grandes fora do polo entram também
function adPlacesFor(w, rm) {
  const tot = (c) => c[2] + c[3] + c[4] + c[5]; const im = {}; const regOf = (city) => (rm[naC(city)] || [null, null])[1];
  w.cities.forEach((c) => { const r = regOf(c[1]) || '?'; im[r] = (im[r] || 0) + tot(c); });
  const out = []; const has = (n) => out.some((x) => noAcc(x.n) === noAcc(n)); let covered = 0;
  const regs = Object.entries(im).filter(([r]) => r !== '?').sort((a, b) => b[1] - a[1]);
  const hubs = (r) => r.split(/\s*[-–—¿]\s*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((x) => x.trim()).filter(Boolean);
  const inTake = new Set();
  regs.forEach(([r, n], i) => { const hs = hubs(r); if (i > 0 && (n < AD_MIN_REGION || out.length + hs.length > AD_MAX)) return; inTake.add(r); covered += n; hs.forEach((h, k) => { if (!has(h)) out.push({ n: h, c: k ? 0 : n, k: 'polo' }); }); });
  w.cities.filter((c) => tot(c) >= AD_MIN_CITY && !has(c[1])).forEach((c) => { out.push({ n: c[1], c: tot(c), k: 'cidade' }); if (!inTake.has(regOf(c[1]))) covered += tot(c); });
  return { places: out, out: Math.max(0, w.n - covered) };
}
const adNames = (w) => (w.adPlaces ? w.adPlaces.map((x) => x.n) : (w.adRegions || []).filter((r) => r !== 'Outras'));
async function ensureAdPlaces() {
  const p = S.plan; if (!p || p.waves.every((w) => w.adPlaces)) return false;
  const reg = (await Pool.get('leads/regions.json')).obj || { states: {} };
  p.waves.forEach((w) => { const a = adPlacesFor(w, (reg.states || {})[w.uf] || {}); w.adPlaces = a.places; w.adOut = a.out; });
  syncPlanTasksAds(); save(); return true;
}
function adCopyText(w) { return adNames(w).map((n) => `${n}, ${UF_NAME[w.uf] || w.uf}, Brasil`).join('\n'); }

async function genPlan(reason) {
  const cfg = planCfg(); const na = naC;
  const reg = (await Pool.get('leads/regions.json')).obj || { states: {} };
  const done = touchedSet(); const cap = dailyCap(cfg); const waveN = cap * cfg.waveDays;
  const blocks = [];
  for (const uf of cfg.order) {
    const idx = await Pool.index(); if (!idx.states[uf]) continue;
    const st = await Pool.state(uf); const rm = (reg.states || {})[uf] || {};
    const by = {};
    st.obj.rows.forEach((r) => { const t = tierOf(r); if (!cfg.tiers.includes(t) || done.has(r[0])) return; const rg = (rm[na(r[5])] || ['Outras'])[0];
      ((by[rg] = by[rg] || {})[r[5]] = by[rg][r[5]] || []).push(r); });
    Object.entries(by).map(([rg, cities]) => [rg, cities, Object.values(cities).reduce((a, l) => a + l.length, 0)]).sort((a, b) => b[2] - a[2])
      .forEach(([rg, cities]) => { const items = [];
        Object.entries(cities).sort((a, b) => b[1].length - a[1].length).forEach(([city, l]) => { l.sort((a, b) => tierOf(a).localeCompare(tierOf(b)) || rowScore(b) - rowScore(a)); l.forEach((r) => items.push([city, tierOf(r)])); });
        blocks.push({ uf, rg, items }); });
  }
  const waves = []; let cur = null;
  blocks.forEach(({ uf, rg, items }) => { let i = 0;
    while (i < items.length) {
      let room = cur ? waveN - cur.n : 0; const rest = items.length - i;
      if (!cur || cur.uf !== uf || room <= 0 || (room < rest && room < waveN * 0.3 && rest <= waveN)) { cur = { uf, n: 0, regions: {}, cities: {} }; waves.push(cur); room = waveN; }
      const take = Math.min(room, rest);
      items.slice(i, i + take).forEach(([city, t]) => { const c = (cur.cities[city] = cur.cities[city] || { A: 0, B: 0, C: 0, D: 0 }); c[t]++; });
      cur.regions[rg] = (cur.regions[rg] || 0) + take; cur.n += take; i += take;
    } });
  // datas (capacidade diária) e verba global
  let day = nextWork(todayStr() > cfg.start ? todayStr() : cfg.start, cfg), left = cap;
  waves.forEach((w, i) => { let n = w.n; w.i = i + 1; w.first = day;
    while (n > 0) { const u = Math.min(left, n); n -= u; left -= u; w.last = day; if (left === 0) { day = nextWork(addDays(day, 1), cfg); left = cap; } }
    w.ads = addDays(w.first, -cfg.adsLead); w.budget = 0; w.spent = 0;
    w.cities = Object.entries(w.cities).map(([c, v]) => [w.uf, c, v.A, v.B, v.C, v.D]);
    w.adRegions = Object.entries(w.regions).filter(([r, n2]) => n2 >= cfg.minAdRegion && r !== 'Outras').map(([r]) => r);
    if (!w.adRegions.length) w.adRegions = [Object.entries(w.regions).sort((a, b) => b[1] - a[1])[0][0]];
    const ap = adPlacesFor(w, (reg.states || {})[w.uf] || {}); w.adPlaces = ap.places; w.adOut = ap.out;
  });
  if (waves.length) { for (let d = waves[0].ads; d <= waves[waves.length - 1].last; d = addDays(d, 1)) { const act = waves.filter((w) => w.ads <= d && d <= w.last); act.forEach((w) => (w.budget += cfg.budgetDay / act.length)); } }
  waves.forEach((w) => (w.budget = Math.round(w.budget)));
  const old = S.plan; const v = (old ? old.v : 0) + 1; if (old) S.planPrev = JSON.parse(JSON.stringify(old));
  if (old) { S.planHist = [{ v: old.v, at: old.createdAt, by: old.by, waves: old.waves.length, end: (old.waves[old.waves.length - 1] || {}).last, note: old.reason || '' }, ...(S.planHist || [])].slice(0, 12);
    old.waves.forEach((w) => { const nw = waves.find((x) => x.uf === w.uf && Object.keys(x.regions).join() === Object.keys(w.regions).join()); if (nw && w.spent) nw.spent = w.spent; }); }
  S.plan = { v, createdAt: new Date().toISOString(), by: S.me, reason: reason || 'Plano gerado', cfg, total: waves.reduce((a, w) => a + w.n, 0), done0: done.size, waves };
  syncPlanTasks(); log(`Plano de campanhas v${v}: ${waves.length} ondas, ${S.plan.total} clínicas (${reason || 'gerado'})`); saveNow();
  return S.plan;
}

// ---------- sequência de contatos e cota do dia ----------
async function planSequence() {
  const p = S.plan; if (!p) return [];
  const seen = new Set(); const seq = [];
  for (const w of p.waves) for (const [uf, city] of w.cities) {
    const k = uf + '|' + city; if (seen.has(k)) continue; seen.add(k);
    const st = await Pool.state(uf);
    st.obj.rows.filter((r) => r[5] === city && p.cfg.tiers.includes(tierOf(r))).sort((a, b) => tierOf(a).localeCompare(tierOf(b)) || rowScore(b) - rowScore(a)).forEach((r) => seq.push([uf, r[0]]));
  }
  return seq;
}
async function allocToday(person) {
  const t = todayStr(); const rec = dayRec(t); rec.alloc = rec.alloc || {};
  if (rec.alloc[person]) return rec.alloc[person];
  const cfg = S.plan ? S.plan.cfg : planCfg(); const quota = +cfg.perDay[person] || 0; if (!S.plan || !quota || !isWorkday(t, cfg)) return (rec.alloc[person] = []);
  const taken = new Set(); Object.entries(S.daily || {}).forEach(([d, r]) => { if (r.alloc) Object.entries(r.alloc).forEach(([who, ks]) => { if (d === t || who !== person) ks.forEach((x) => taken.add(x[1])); }); });
  // sobras dos dias anteriores desta pessoa voltam primeiro
  const carry = []; Object.entries(S.daily || {}).filter(([d]) => d < t && d >= addDays(t, -21)).sort().forEach(([, r]) => ((r.alloc || {})[person] || []).forEach((x) => { if (!isTouched(x[1]) && !carry.some((y) => y[1] === x[1])) carry.push(x); }));
  const out = carry.slice(0, quota); const have = new Set(out.map((x) => x[1]));
  if (out.length < quota) { for (const x of await planSequence()) { if (out.length >= quota) break; if (have.has(x[1]) || taken.has(x[1]) || isTouched(x[1])) continue; out.push(x); have.add(x[1]); } }
  rec.alloc[person] = out; save(); return out;
}
function quotaLeft(person = S.me) { const rec = dayRec(); return ((rec.alloc || {})[person] || []).filter((x) => !isTouched(x[1])); }
function currentWave() { const p = S.plan; if (!p) return null; const t = todayStr(); return p.waves.find((w) => w.first <= t && t <= w.last) || p.waves.find((w) => w.first > t) || null; }
function waveStatus(w) { const t = todayStr(); if (w.last < t) return ['concluida', 'Concluída']; if (w.first <= t) return ['ativa', 'Ligando agora']; if (w.ads <= t) return ['aquec', 'Aquecendo (anúncios)']; return ['prox', 'Planejada']; }
// atraso: se a execução ficou mais de 1 dia de capacidade para trás, replaneja sozinho (no máx. 1x por dia)
async function autoReplan() {
  const p = S.plan; if (!p || !Sync.enabled()) return false; const t = todayStr();
  if (p.lastAuto === t || p.cfg.start > t) return false;
  let exp = 0; for (let d = nextWork(p.cfg.start, p.cfg); d < t; d = nextWork(addDays(d, 1), p.cfg)) exp += dailyCap(p.cfg);
  const did = touchedSet().size - (p.done0 || 0); p.lastAuto = t;
  if (exp - did >= dailyCap(p.cfg)) { await genPlan(`Replanejado sozinho: ${exp - did} contatos atrasados passaram para os próximos dias`); toast('Plano replanejado pelo ritmo real'); return true; }
  save(); return false;
}

// ritmo: previsto até ontem x feito desde que o plano foi gerado
function planPace() {
  const p = S.plan; if (!p || !p.waves.length) return null; const t = todayStr(); const cap = dailyCap(p.cfg);
  let exp = 0; for (let d = p.waves[0].first; d < t; d = nextWork(addDays(d, 1), p.cfg)) if (isWorkday(d, p.cfg)) exp += cap;
  const did = Math.max(0, touchedSet().size - (p.done0 || 0)); return { exp, did, diff: did - exp, cap };
}
function planCtlHTML() {
  const p = S.plan; const pc = planPace(); const t = todayStr(); const blockedToday = (p.cfg.blocked || []).includes(t);
  let msg;
  if (!pc || !pc.exp) msg = `<b>Ainda não começou.</b> As ligações começam em ${fmtShort(p.waves[0].first)}. Se precisar mudar a data, as metas ou a verba, use “Mudar datas e metas”.`;
  else if (pc.diff <= -pc.cap * 0.5) msg = `<b class="late">Atrasados ${(-pc.diff).toLocaleString('pt-BR')} contatos</b> (previsto ${pc.exp.toLocaleString('pt-BR')} até ontem, feitos ${pc.did.toLocaleString('pt-BR')}). Recalcule para empurrar o que faltou para os próximos dias.`;
  else if (pc.diff >= pc.cap * 0.5) msg = `<b class="okc">Adiantados ${pc.diff.toLocaleString('pt-BR')} contatos</b> (previsto ${pc.exp.toLocaleString('pt-BR')}, feitos ${pc.did.toLocaleString('pt-BR')}). Recalcule para puxar as próximas ondas para frente.`;
  else msg = `<b class="okc">No ritmo</b>: previsto ${pc.exp.toLocaleString('pt-BR')} até ontem, feitos ${pc.did.toLocaleString('pt-BR')}.`;
  return `<section class="card plan-ctl"><header><h3>Ajustar o plano</h3><small class="muted">versão ${p.v} · ${esc(p.reason || '')} · ${new Date(p.createdAt).toLocaleDateString('pt-BR')}</small></header>
    <p class="pc-msg">${msg}</p>
    <div class="btns pc-btns"><button class="btn primary" data-act="planRe">↻ Recalcular a partir de hoje</button><button class="btn" data-act="planEdit">✎ Mudar datas e metas</button>
      ${isWorkday(t, p.cfg) || blockedToday ? `<button class="btn" data-act="planSkipToday">${blockedToday ? '↩ Hoje vamos prospectar' : '⏸ Hoje não vamos prospectar'}</button>` : ''}
      ${S.planPrev ? `<button class="btn ghost" data-act="planUndo">⤺ Desfazer (voltar à v${S.planPrev.v})</button>` : ''}<button class="btn ghost danger-t" data-act="planReset">Recriar do zero</button></div>
    <p class="hint">Recalcular mantém tudo o que vocês já fizeram e redistribui só o que falta, a partir de hoje. Nada da base é apagado.</p></section>`;
}

// atualiza o texto das tarefas de anúncio ainda abertas quando os locais mudam
function syncPlanTasksAds() {
  const p = S.plan; if (!p) return;
  S.tasks.forEach((x) => { if (!x.planTask || x.status !== 'a_fazer' || x.planV !== p.v || !/-k4$/.test(x.id)) return; const w = p.waves.find((y) => y.i === x.wave); if (!w) return; const regs = adNames(w).join(', ');
    x.title = `Onda ${w.i} · ${w.uf}: aprovar e ativar os anúncios — ${regs}`; x.checklist = [{ t: `Verba: até ${money(p.cfg.budgetDay)}/dia no total`, done: x.checklist[0]?.done || false }, { t: 'Locais (copie no Plano de campanhas): ' + regs, done: false }, { t: 'Raio de 30–40 km em cada local', done: false }]; });
}

// ---------- tarefas das próximas 3 ondas ----------
const ROITY_ID = '__roity';
function roityClinic() { let c = clinicById(ROITY_ID); if (!c) { c = { id: ROITY_ID, name: 'Roity · Prospecção', stage: 'interno', internal: true, createdAt: new Date().toISOString() }; S.clinics.push(c); } return c; }
const WAVE_TASKS = [
  ['k1', -3, 'Micaela', 'B', 'conferir leads e cidades da onda'], ['k2', -2, 'Tiago', 'M', 'briefing da região (oferta, público e raio)'], ['k3', -1, 'Micaela', 'B', 'criativos A (dor) e B (solução)'],
  ['k4', 0, 'Tiago', 'M', 'aprovar e ativar os anúncios'], ['k5', 'D-1', 'Micaela', 'C', 'preparar contatos e mensagens'], ['k6', 'D0', 'Tiago', 'C', 'começar ligações e mensagens'],
  ['k7', 'D0', 'Micaela', 'C', 'começar ligações e mensagens'], ['k8', 'D+5', 'Tiago', 'M', 'revisar indicadores e a próxima onda'],
];
function syncPlanTasks() {
  const p = S.plan; if (!p) return; const t = todayStr(); roityClinic();
  S.tasks = S.tasks.filter((x) => !(x.planTask && x.status === 'a_fazer' && x.planV !== p.v));
  p.waves.filter((w) => w.last >= t).slice(0, 3).forEach((w) => WAVE_TASKS.forEach(([k, off, who, pil, txt]) => {
    const id = `pt-${p.v}-${w.i}-${k}`; if (S.tasks.some((x) => x.id === id)) return;
    let due = off === 'D-1' ? prevWork(addDays(w.first, -1), p.cfg) : off === 'D0' ? w.first : off === 'D+5' ? addWeekdays(w.first, 5) : prevWork(addDays(w.ads, off), p.cfg);
    if (due < t) due = nextWork(t, p.cfg);
    const regs = adNames(w).join(', ');
    S.tasks.push({ id, clinicId: ROITY_ID, month: 0, kind: 'onda', pillar: pil, title: `Onda ${w.i} · ${w.uf}: ${txt}${k === 'k4' ? ' — ' + regs : ''}`, owner: who, due, priority: 'alta', status: 'a_fazer',
      checklist: k === 'k3' ? [{ t: 'Criativo A — dor (atendimento lento, perda de agendamentos)', done: false }, { t: 'Criativo B — solução (MBCR + 24AGÁ, diagnóstico gratuito)', done: false }] : k === 'k4' ? [{ t: `Verba: até ${money(p.cfg.budgetDay)}/dia no total`, done: false }, { t: 'Locais (copie no Plano de campanhas): ' + regs, done: false }, { t: 'Raio de 30–40 km em cada local', done: false }] : [],
      meeting: false, hours: k === 'k3' ? 1.5 : 0.5, evidence: '', notes: '', doneAt: null, planTask: true, planV: p.v, wave: w.i, history: [{ at: new Date().toISOString(), who: S.me, what: 'Criada pelo plano de campanhas' }] });
  }));
}
Object.assign(HOWTO, {
  'conferir leads e cidades da onda': 'Ver na tela Plano de campanhas as cidades e quantas clínicas entram nesta onda. Conferir se a base está boa (telefones, cidades) e se alguma cidade precisa sair.',
  'briefing da região (oferta, público e raio)': 'Definir a oferta (diagnóstico estratégico gratuito de 30 min), o público (donos e gestores de clínicas de estética) e o raio dos anúncios em cada região da onda.',
  'criativos A (dor) e B (solução)': 'A: clínica recebe mensagens mas perde agendamentos por atendimento lento e falta de acompanhamento. B: método MBCR + 24AGÁ, com diagnóstico gratuito. Sem prometer resultado.',
  'aprovar e ativar os anúncios': 'Aprovar os criativos e ativar a campanha no Meta Ads na região da onda, respeitando a verba total por dia. Registrar o gasto no Plano de campanhas.',
  'preparar contatos e mensagens': 'Conferir a cota de amanhã no Meu dia, revisar a mensagem de abordagem e o roteiro de ligação.',
  'começar ligações e mensagens': 'Abrir o Meu dia e tocar em “Começar minha cota”: 30 ligações e 70 mensagens por pessoa.',
  'revisar indicadores e a próxima onda': 'Ver contatos feitos, conversas, diagnósticos e gasto. Ajustar criativos/verba e conferir a próxima onda.',
});

// ---------- diagnóstico: SDR → agenda do Tiago ----------
const DIAG_AGENDA = 'DIAGNÓSTICO (30 min)\n1. Situação atual: faturamento, procedimentos, equipe\n2. Como chegam os pacientes e quem responde\n3. Principal dificuldade e meta\n4. Apresentar o método MBCR + 24AGÁ\n5. Próximo passo: proposta\n\nANOTAÇÕES\n';
function diagCount(date) { return S.tasks.filter((x) => x.kind === 'venda' && x.due === date && x.owner === 'Tiago').length; }
function nextDiagSlot() { const cfg = planCfg(); let d = nextWork(addDays(todayStr(), 1), cfg); for (let i = 0; i < 30 && diagCount(d) >= cfg.diagSlots; i++) d = nextWork(addDays(d, 1), cfg); const n = diagCount(d); const [h, m] = (S.settings.schedule.pr[0] || '15:00').split(':').map(Number); const mins = h * 60 + m + n * cfg.diagMin; return [d, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`]; }
function createDiag(c, date, time) {
  const cfg = planCfg(); if (diagCount(date) >= cfg.diagSlots && !confirm(`A agenda do Tiago já tem ${cfg.diagSlots} diagnósticos em ${fmtDate(date)}. Marcar assim mesmo?`)) return false;
  S.tasks.push({ id: uid(), clinicId: c.id, month: 0, kind: 'venda', pillar: 'C', title: `Diagnóstico — ${c.name}`, owner: 'Tiago', due: date, time: time || '', priority: 'alta', status: 'a_fazer', checklist: [], meeting: true, hours: cfg.diagMin / 60,
    evidence: '', notes: DIAG_AGENDA + (c.leadLog && c.leadLog[0] && c.leadLog[0].note ? 'Da ligação: ' + c.leadLog[0].note + '\n' : ''), doneAt: null, history: [{ at: new Date().toISOString(), who: S.me, what: `Diagnóstico marcado por ${S.me}` }] });
  c.nextAction = `Diagnóstico ${fmtShort(date)} ${time || ''}`; c.nextDate = date; log(`Diagnóstico marcado: ${c.name} em ${fmtDate(date)} ${time || ''} (por ${S.me})`, c.id); return true;
}

// ---------- registrar resultado (cota, cidade, retornos) ----------
const POSITIVE = ['conversa', 'apresentacao', 'proposta'];
function leadFromTouch(key, t) {
  return { id: uid(), createdAt: new Date().toISOString(), poolKey: key, name: t.nm || 'Clínica', phone: t.p || '', city: t.c || '', uf: t.uf || '', segment: 'estetica', stage: 'lead', owner: t.o || S.me,
    price: 2500, setupFee: 1500, setupWaived: false, mediaBudget: null, startDate: todayStr(), payment: 'na', exclusivity: 'nao_solicitada', guarantee: 'em_definicao', nextAction: '', nextDate: todayStr(), leadLog: [], source: 'Base ' + (t.uf || '') };
}
function registerResult(it, res, o = {}) {
  const t0 = todayStr(); let date = o.date || ''; if (date && !isWorkday(date)) date = nextWork(date);
  if (it.c || POSITIVE.includes(res)) {
    let c = it.c || S.clinics.find((x) => x.poolKey === it.key);
    if (!c) { const row = it.row || (it.uf ? rowByKey(it.uf, it.key) : null); c = row ? leadFromRow(it.uf, row) : leadFromTouch(it.key, it.t || {}); S.clinics.push(c);
      if (S.touch && S.touch[it.key]) { c.leadLog = [{ at: new Date().toISOString(), who: S.me, result: S.touch[it.key].s, note: `${S.touch[it.key].n} tentativa(s) antes` }]; delete S.touch[it.key]; } }
    applyLeadResult(c, res, res === 'apresentacao' ? (o.diagDate || date) : date, '', o.note);
    if (res === 'apresentacao') createDiag(c, o.diagDate || nextDiagSlot()[0], o.diagTime || nextDiagSlot()[1]);
    return c;
  }
  S.touch = S.touch || {}; const r = prospRec(); const first = !S.touch[it.key];
  if (res === 'mensagem') r.msgs = (r.msgs || 0) + 1; else r.calls++; if (first) r.news = (r.news || 0) + 1; if (res === 'sem_interesse') r.convos++;
  const row = it.row || (it.uf ? rowByKey(it.uf, it.key) : null); const tc = S.touch[it.key] || { n: 0, o: S.me };
  tc.n++; tc.s = res; tc.t = t0; tc.uf = it.uf || tc.uf; if (row) { tc.nm = row[1]; tc.p = fmtPhone(row[2]); tc.c = row[5]; }
  if (res === 'sem_interesse') tc.d = null; else if (res === 'sem_resposta' && tc.n >= 3) { tc.s = 'sem_contato'; tc.d = null; } else tc.d = date || addWeekdays(t0, 2);
  S.touch[it.key] = tc; log(`${tc.nm || 'Lead'}: ${(RESULTS.find((x) => x[0] === res) || [0, res])[1]}`); return null;
}
function touchDue(person = S.me) { const t = todayStr(); return Object.entries(S.touch || {}).filter(([, v]) => v.d && v.d <= t && (v.o || S.me) === person).map(([key, v]) => ({ key, uf: v.uf, t: v })); }

// ---------- itens do Modo ligação ----------
function callItems() {
  const t = todayStr(); const skip = ui.callSkip || new Set(); const mode = ui.callMode || 'ret';
  const backs = leadQueue().filter((c) => !skip.has(c.id)).map((c) => ({ c, key: c.id, uf: c.uf }));
  const tback = touchDue().filter((x) => !skip.has(x.key));
  if (mode === 'quota') { const q = quotaLeft().filter((x) => !skip.has(x[1])).map(([uf, key]) => ({ key, uf, row: rowByKey(uf, key) })).filter((x) => x.row); return [...backs, ...tback, ...q]; }
  if (mode === 'city' && ui.callCity) {
    const { uf, city } = ui.callCity; const st = Pool.data[uf]; const f = pf(); const wm = workedMap();
    const fresh = st ? st.obj.rows.filter((r) => r[5] === city && inProfile(r, f) && !isTouched(r[0]) && !skip.has(r[0])).sort((a, b) => rowScore(b) - rowScore(a)).map((r) => ({ r, row: r, uf, key: r[0] })) : [];
    return [...backs.filter((x) => x.c.city === city && x.c.uf === uf && touched(x.c)), ...tback.filter((x) => x.t.c === city && x.uf === uf), ...fresh];
  }
  return [...backs, ...tback];
}
function openCallMode(a, b) {
  ui.callSkip = new Set(); ui.callDone = 0; ui.callMode = a === 'quota' ? 'quota' : a && b ? 'city' : 'ret'; ui.callCity = ui.callMode === 'city' ? { uf: a, city: b } : null;
  if (ui.callCity && !cityOwner(a, b)) { setCityOwner(a, b, S.me); save(); }
  $('#callMode').hidden = false; document.body.classList.add('noscroll'); callRender();
}
async function startQuota() {
  if (!S.plan) { toast('Gere o plano de campanhas primeiro'); go('#/plano'); return; }
  toast('Preparando sua cota…'); const q = await allocToday(S.me); const ufs = [...new Set(q.map((x) => x[0]))]; for (const u of ufs) await Pool.state(u);
  for (const x of touchDue()) if (x.uf && !Pool.data[x.uf]) await Pool.state(x.uf);
  openCallMode('quota');
}
function callRender() {
  const items = callItems(); const it = items[0]; const r = prospRec(); const cfg = S.plan ? S.plan.cfg : planCfg(); const el = $('#callMode');
  const goal = +cfg.perDay[S.me] || 100, gCalls = +cfg.callsPer || 30, gMsg = Math.max(0, goal - gCalls);
  const where = ui.callMode === 'quota' ? 'Minha cota de hoje' : ui.callCity ? `${esc(ui.callCity.city)}/${ui.callCity.uf}` : 'Retornos';
  const prog = `<span class="cm-prog">Novos ${r.news || 0}/${goal} · ligações ${r.calls}/${gCalls} · mensagens ${r.msgs || 0}/${gMsg} · faltam ${items.length}</span>`;
  if (!it) {
    el.innerHTML = `<div class="cm"><div class="cm-top"><b>${where}</b>${prog}<button class="btn sm" data-act="callClose">Fechar</button></div>
      <div class="cm-end"><div class="th-num">✓</div><h2>${ui.callMode === 'quota' ? 'Cota de hoje concluída' : ui.callCity ? 'Cidade concluída' : 'Retornos concluídos'}</h2><p>${pl(ui.callDone, 'contato registrado', 'contatos registrados')} agora · hoje: ${pl(r.calls, 'ligação', 'ligações')}, ${pl(r.msgs || 0, 'mensagem', 'mensagens')}, ${pl(r.pres, 'diagnóstico marcado', 'diagnósticos marcados')}.</p>
      ${ui.callSkip.size ? `<button class="btn" data-act="callUnskip">Voltar aos ${ui.callSkip.size} pulados</button>` : ''}<button class="btn primary" data-act="callClose">Concluir</button></div></div>`;
    return;
  }
  const c = it.c, rw = it.row, tt = it.t; const yNow = new Date().getFullYear();
  const d = c ? { name: c.name, phone: c.phone, phone2: c.phone2, email: c.email, city: c.city, uf: c.uf, bairro: c.bairro, y: c.openedYear, cap: c.capital, next: c.nextAction, due: c.nextDate, log: (c.leadLog || [])[0], tier: '' }
    : rw ? { name: rw[1], phone: fmtPhone(rw[2]), phone2: rw[3] ? fmtPhone(rw[3]) : '', email: rw[4], city: rw[5], uf: it.uf, bairro: rw[6], y: rw[8], cap: rw[7], next: tt ? 'Retorno' : 'Primeira abordagem', due: tt ? tt.d : todayStr(), log: tt ? { at: tt.t, result: tt.s, note: tt.n + 'ª tentativa' } : null, tier: tierOf(rw) }
    : { name: tt.nm, phone: tt.p, city: tt.c, uf: tt.uf, next: 'Retorno', due: tt.d, log: { at: tt.t, result: tt.s, note: tt.n + 'ª tentativa' }, tier: '' };
  const meta = [d.tier && `Classe ${d.tier} · ${TIERS[d.tier]}`, d.y && `desde ${d.y} (${yNow - d.y} anos)`, d.cap && `capital ${money(d.cap)}`].filter(Boolean);
  const [sd, st] = nextDiagSlot();
  el.innerHTML = `<div class="cm">
    <div class="cm-top"><b>${where}</b>${prog}<button class="btn sm" data-act="callClose">Fechar</button></div>
    <div class="cm-grid"><section class="cm-card">
      <small class="cm-eyebrow">${d.due && d.due < todayStr() ? `ATRASADO DESDE ${fmtShort(d.due)}` : tt || c ? 'RETORNO' : 'NOVO CONTATO'} · ${esc(d.next || '')}</small>
      <h2>${esc(d.name || '')}</h2>
      ${d.city ? `<p class="cm-city">📍 <b>${esc(d.city)}${d.uf ? '/' + esc(d.uf) : ''}</b>${d.bairro ? ' · ' + esc(d.bairro) : ''}</p>` : ''}
      ${meta.length ? `<p class="cm-meta">${meta.map(esc).join(' · ')}</p>` : ''}
      ${d.log ? `<p class="cm-last">Último contato (${fmtShort(String(d.log.at).slice(0, 10))}): <b>${esc((RESULTS.find((x) => x[0] === d.log.result) || [0, d.log.result])[1] || '')}</b> ${esc(d.log.note || '')}</p>` : ''}
      <div class="cm-call">${d.phone ? `<a class="btn primary big" href="tel:+55${digits(d.phone)}">📞 ${esc(d.phone)}</a>` : ''}${d.phone && isMobile(d.phone) ? `<a class="btn big" href="${waLink(d.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.phone2 ? `<a class="btn" href="tel:+55${digits(d.phone2)}">📞 ${esc(d.phone2)}</a>` : ''}${d.email ? `<a class="btn" href="mailto:${esc(d.email)}">E-mail</a>` : ''}</div>
      <h4>Como foi?</h4>
      <div class="cm-res"><button class="btn" data-act="callRes" data-r="sem_resposta">Não atendeu</button><button class="btn" data-act="callRes" data-r="mensagem">Mensagem enviada</button><button class="btn" data-act="callRes" data-r="conversa">Conversei</button><button class="btn ok" data-act="callRes" data-r="apresentacao">Diagnóstico marcado</button><button class="btn ok" data-act="callRes" data-r="proposta">Pediu proposta</button><button class="btn danger" data-act="callRes" data-r="sem_interesse">Sem interesse</button></div>
      <div class="cm-opts"><label><span>Próximo contato</span><input type="date" id="cmDate" value="${addWeekdays(todayStr(), 2)}"></label>
        <label><span>Diagnóstico (data e hora)</span><span class="dt2"><input type="date" id="cmDiagD" value="${sd}"><input type="time" id="cmDiagT" value="${st}"></span></label>
        <label class="full"><span>Anotação (opcional)</span><input id="cmNote" placeholder="Ex.: falar com a Dra. depois das 16h"></label></div>
      <div class="cm-foot"><button class="btn sm ghost" data-act="callSkip">Pular</button>${c ? `<button class="btn sm ghost" data-act="callOpen" data-id="${c.id}">Abrir ficha</button>` : ''}</div>
    </section><details class="cm-script" open><summary>Roteiro e objeções</summary><pre>${esc(S.settings.script || SCRIPT_DEFAULT)}</pre></details></div></div>`;
}
function callResult(res) {
  const it = callItems()[0]; if (!it) return;
  const v = (id) => ($('#' + id) ? $('#' + id).value : '');
  registerResult(it, res, { date: v('cmDate'), note: v('cmNote').trim(), diagDate: v('cmDiagD'), diagTime: v('cmDiagT') });
  ui.callDone++; save(); toast((RESULTS.find((x) => x[0] === res) || [0, 'Registrado'])[1]); callRender();
}

// ---------- tela Plano de campanhas ----------
const dm = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—');
VIEWS.plano = () => {
  const p = S.plan; const cfg = p ? p.cfg : planCfg(); const t = todayStr();
  if (!Sync.enabled()) { view().innerHTML = `<div class="notice">O plano usa a base de leads do seu repositório privado. Conecte a sincronização em <a href="#/config">Configurações</a>.</div>`; return; }
  const cfgForm = `<details class="card plan-cfg" id="planCfg" ${p && !ui.planEdit ? '' : 'open'}><summary><b>Configurar o plano</b> <small class="muted">metas, verba, classes e datas</small></summary>
    <form data-form="planCfg" class="mform">
      <label><span>Começar as ligações em</span><input type="date" name="start" value="${cfg.start}"></label>
      <label><span>Verba de anúncios por dia (total)</span><input type="number" min="0" step="1" name="budgetDay" value="${cfg.budgetDay}"></label>
      <label><span>Novos contatos/dia — Tiago</span><input type="number" min="0" name="pT" value="${cfg.perDay.Tiago}"></label>
      <label><span>Novos contatos/dia — Micaela</span><input type="number" min="0" name="pM" value="${cfg.perDay.Micaela}"></label>
      <label><span>Desses, por ligação (cada um)</span><input type="number" min="0" name="callsPer" value="${cfg.callsPer}"></label>
      <label><span>Aquecimento antes das ligações (dias)</span><input type="number" min="0" max="14" name="adsLead" value="${cfg.adsLead}"></label>
      <label><span>Dias úteis por onda</span><input type="number" min="1" max="15" name="waveDays" value="${cfg.waveDays}"></label>
      <label><span>Diagnósticos por dia (Tiago)</span><input type="number" min="1" max="10" name="diagSlots" value="${cfg.diagSlots}"></label>
      <label class="full"><span>Ordem dos estados (o primeiro é trabalhado antes)</span><input name="order" value="${esc(cfg.order.join(', '))}" placeholder="MT, GO, MS, MG, PR, SC"></label>
      <div class="full"><span class="lbl2">Classes no plano</span><div class="chips">${Object.entries(TIERS).map(([k, l]) => `<label class="chip ${cfg.tiers.includes(k) ? 'on' : ''}"><input type="checkbox" name="tier" value="${k}" ${cfg.tiers.includes(k) ? 'checked' : ''} hidden>${k} · ${l}</label>`).join('')}</div></div>
      <label class="full"><span>Dias sem prospecção (feriados municipais, folgas, viagens) — um por linha, ex.: 24/12/2026</span><textarea name="blocked" rows="2">${esc((cfg.blocked || []).map((x) => x.split('-').reverse().join('/')).join('\n'))}</textarea></label>
      <div class="btns end"><button class="btn primary">${p ? 'Salvar e replanejar' : 'Gerar o plano'}</button></div>
    </form><p class="hint">Feriados nacionais e fins de semana já ficam de fora. Dentro de cada estado, as regiões e cidades maiores vêm primeiro. Ao salvar, o plano é recalculado a partir de hoje, sem perder o que já foi feito.</p></details>`;
  if (!p) {
    view().innerHTML = `<section class="card plan-loading"><h3>Montando o plano de campanhas…</h3><p class="muted">Carregando os 6 estados e calculando ondas, cidades, datas e verba. Leva alguns segundos.</p><div class="bar"><i class="indet"></i></div></section>${cfgForm}`;
    if (!ui.planBusy) { ui.planBusy = true; genPlan('Plano inicial').then(() => { ui.planBusy = false; if (route.name === 'plano') render(); toast('Plano de campanhas pronto'); }).catch((er) => { ui.planBusy = false; const b = $('.plan-loading'); if (b) b.innerHTML = `<div class="notice warn">Não consegui montar o plano: ${esc(er.message)}. Confira a sincronização e tente de novo em “Configurar o plano”.</div>`; }); }
    return;
  }
  if (p.waves.some((w) => !w.adPlaces) && !ui.adBusy) { ui.adBusy = true; ensureAdPlaces().then((ch) => { ui.adBusy = false; if (ch && route.name === 'plano') render(); }).catch(() => { ui.adBusy = false; }); }
  const W = p.waves; const cur = currentWave(); const totDone = touchedSet().size - (p.done0 || 0);
  const budPlan = W.reduce((a, w) => a + w.budget, 0), budSpent = W.reduce((a, w) => a + (+w.spent || 0), 0);
  const show = ui.waveShow || 8;
  view().innerHTML = `
    <div class="kpis k4">
      <div class="kpi"><span>Ondas no plano</span><b>${W.length}</b><em>${pl(p.total, 'clínica', 'clínicas')} · classes ${cfg.tiers.join('+')}</em></div>
      <div class="kpi"><span>Período</span><b class="kpi-s">${fmtShort(W[0].first)} → ${fmtShort(W[W.length - 1].last)}</b><em>${W[W.length - 1].last.slice(0, 4)} · ${dailyCap(cfg)} contatos por dia útil</em></div>
      <div class="kpi"><span>Executado</span><b>${Math.max(0, totDone).toLocaleString('pt-BR')}</b><em>${p.total ? Math.round((Math.max(0, totDone) / p.total) * 100) : 0}% das clínicas do plano</em></div>
      <div class="kpi"><span>Verba de anúncios</span><b>${money(budSpent)}</b><em>gasto de ${money(budPlan)} previstos · ${money(cfg.budgetDay)}/dia</em></div>
    </div>
    ${planCtlHTML()}
    ${goalsHTML()}
    ${cronHTML()}
    ${cur ? `<section class="card wave-now"><header><h3>${waveStatus(cur)[0] === 'ativa' ? 'Agora' : 'Próxima'}: Onda ${cur.i} · ${cur.uf}</h3><span class="btns" style="margin:0"><button class="btn primary" data-act="quotaStart">▶ Minha cota de hoje</button><button class="btn" data-act="planRe">Replanejar</button></span></header>
      <p class="muted">Anúncios em ${esc(adNames(cur).join(', '))} · ligações ${fmtShort(cur.first)} a ${fmtShort(cur.last)}</p></section>` : ''}
    <div class="wv-head"><h3 class="sec-t">Ondas</h3><div class="seg">${[['cards', 'Cartões'], ['table', 'Tabela completa']].map(([k, l]) => `<button aria-selected="${(ui.waveView || 'cards') === k}" data-act="waveView" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${(ui.waveView || 'cards') === 'table' ? `<section class="card"><div class="tscroll"><table class="tbl wtbl"><thead><tr><th>Onda</th><th>UF</th><th>Anunciar em (raio 30–40 km)</th><th>Anúncio começa</th><th>Ligações</th><th>Clínicas</th><th>Verba</th><th>Status</th></tr></thead><tbody>
      ${W.map((w) => `<tr class="st-${waveStatus(w)[0]}"><td><b>${w.i}</b></td><td>${w.uf}</td><td>${esc(adNames(w).join(', '))}<br><small>ligações: ${esc(w.cities.slice(0, 4).map((c) => c[1]).join(' → '))}${w.cities.length > 4 ? ` +${w.cities.length - 4}` : ''}</small></td><td><b>${dm(w.ads)}</b></td><td>${dm(w.first)} → ${dm(w.last)}</td><td>${w.n.toLocaleString('pt-BR')}</td><td>${money(w.budget)}</td><td>${waveStatus(w)[1]}</td></tr>`).join('')}
    </tbody></table></div></section>` : `<div class="waves">${W.slice(0, show).map((w) => { const [k, l] = waveStatus(w); const A = w.cities.reduce((a, c) => a + c[2], 0), B = w.cities.reduce((a, c) => a + c[3], 0), C = w.cities.reduce((a, c) => a + c[4] + c[5], 0);
      return `<article class="wave st-${k}"><header><b>Onda ${w.i}</b><span class="wv-uf">${w.uf}</span><span class="wv-st">${l}</span></header>
        <div class="wv-dates"><div><small>ANÚNCIOS</small><b>${dm(w.ads)} → ${dm(w.last)}</b></div><div><small>LIGAÇÕES</small><b>${dm(w.first)} → ${dm(w.last)}</b></div><div><small>CLÍNICAS</small><b>${w.n.toLocaleString('pt-BR')}</b></div></div>
        <div class="wv-ad"><div class="wv-lbl"><span>📣 Anunciar em <small>raio 30–40 km em cada</small></span><button class="btn sm" data-act="copyAd" data-w="${w.i}">Copiar locais</button></div>
          <p class="wv-places">${(w.adPlaces || adNames(w).map((n) => ({ n, c: 0 }))).map((x) => `<span class="pl${x.k === 'cidade' ? ' pc' : ''}">${esc(x.n)}${x.c ? ` <b>${x.c}</b>` : ''}</span>`).join('')}</p>
          ${w.adOut ? `<small class="muted">${w.adOut.toLocaleString('pt-BR')} clínicas de cidades pequenas ficam fora do anúncio: só ligação e WhatsApp.</small>` : ''}</div>
        <p class="wv-cls">${A ? `<span class="tg tA">A ${A}</span>` : ''}${B ? `<span class="tg tB">B ${B}</span>` : ''}${C ? `<span class="tg tC">C/D ${C}</span>` : ''}</p>
        <div class="wv-lbl"><span>📞 Ordem das ligações <small>maior cidade primeiro</small></span></div>
        <p class="wv-cities">${w.cities.slice(0, 6).map((c, k) => `<span class="oc"><i>${k + 1}</i>${esc(c[1])} <b>${c[2] + c[3] + c[4] + c[5]}</b></span>`).join('')}${w.cities.length > 6 ? `<span class="oc oc-more">+${w.cities.length - 6} cidades</span>` : ''}</p>
        <div class="wv-bud"><span>Verba prevista <b>${money(w.budget)}</b></span><label><span>Gasto</span><input type="number" min="0" step="1" data-spent="${w.i}" value="${w.spent || ''}" placeholder="R$"></label></div></article>`; }).join('')}</div>
    ${W.length > show ? `<button class="btn block" data-act="waveMore">Ver mais ondas (${W.length - show})</button>` : ''}`}
    ${cfgForm}
    ${(S.planHist || []).length ? `<section class="card"><header><h3>Versões anteriores</h3></header><ul class="log">${S.planHist.map((h) => `<li><time>${new Date(h.at).toLocaleDateString('pt-BR')}</time><b>v${h.v}</b> ${h.waves} ondas até ${h.end ? fmtDate(h.end) : '—'} · ${esc(h.note)}</li>`).join('')}</ul></section>` : ''}`;
};

function waveEvents() { const ev = {}; (S.plan ? S.plan.waves : []).forEach((w) => { (ev[w.ads] = ev[w.ads] || []).push({ k: 'ads', w, t: `📣 Onda ${w.i}: anúncios (${adNames(w).join(', ')})` }); (ev[w.first] = ev[w.first] || []).push({ k: 'call', w, t: `📞 Onda ${w.i}: começam as ligações (${w.cities.slice(0, 2).map((c) => c[1]).join(', ')}${w.cities.length > 2 ? '…' : ''})` }); }); return ev; }
function campaignCard() {
  const p = S.plan; if (!p) return Sync.enabled() ? `<a class="camp-card empty-c" href="#/plano"><b>📣 Plano de campanhas</b><span>Toque para montar as ondas: cidades, datas dos anúncios, ligações e verba.</span></a>` : '';
  const w = currentWave(); if (!w) return ''; const nx = p.waves[p.waves.indexOf(w) + 1]; const t = todayStr();
  const line = (x) => `<div class="cc-row"><b>Onda ${x.i} · ${x.uf}</b><span>📣 anúncios <b>${dm(x.ads)}</b> em ${esc(adNames(x).join(', '))}</span><span>📞 ligações <b>${dm(x.first)} → ${dm(x.last)}</b> · ${x.n.toLocaleString('pt-BR')} clínicas</span></div>`;
  return `<a class="camp-card" href="#/plano"><div class="cc-h"><small>CAMPANHAS · ${waveStatus(w)[1].toUpperCase()}</small><span class="link">Ver plano e metas →</span></div>${line(w)}${nx ? `<div class="cc-next">Depois:</div>${line(nx)}` : ''}${goalsHTML(true)}</a>`;
}

// ---------- metas da prospecção (dia, semana, mês) ----------
function sumProsp(from, to, person) {
  const out = { news: 0, calls: 0, msgs: 0, convos: 0, pres: 0 };
  Object.entries(S.daily || {}).forEach(([d, r]) => { if (d < from || d > to) return; Object.entries(r.p || {}).forEach(([who, v]) => { if (person && who !== person) return; Object.keys(out).forEach((k) => (out[k] += +v[k] || 0)); }); });
  return out;
}
function workdaysBetween(a, b, cfg) { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isWorkday(d, cfg)) n++; return n; }
function goalsHTML(compact) {
  const cfg = S.plan ? S.plan.cfg : planCfg(); const t = todayStr();
  const wk0 = addDays(t, -((parseD(t).getDay() + 6) % 7)), wk1 = addDays(wk0, 4); const m0 = t.slice(0, 8) + '01', m1 = addDays(addMonths(m0, 1), -1);
  const per = [['Hoje', t, t], ['Semana', wk0, wk1], ['Mês', m0, m1]];
  const people = ['Tiago', 'Micaela']; const g = S.settings.goals || {};
  const row = (label, a, b) => { const wd = workdaysBetween(a, b, cfg) || (label === 'Hoje' ? 0 : 0); const tot = sumProsp(a, b); const goalNews = dailyCap(cfg) * Math.max(wd, label === 'Hoje' && isWorkday(t, cfg) ? 1 : wd);
    const goalCalls = (+cfg.callsPer || 30) * people.length * Math.max(wd, 0); const goalPres = (+g.pres || 1) * people.length * Math.max(wd, 0);
    const cell = (v, goal) => `<div class="gm"><b>${v.toLocaleString('pt-BR')}</b><small>de ${goal.toLocaleString('pt-BR')}</small><div class="bar ${goal && v >= goal ? 'ok' : ''}"><i style="width:${goal ? Math.min(100, (v / goal) * 100) : 0}%"></i></div></div>`;
    return `<tr><th>${label}<small>${wd} ${wd === 1 ? 'dia útil' : 'dias úteis'}</small></th><td>${cell(tot.news, goalNews)}</td><td>${cell(tot.calls, goalCalls)}</td><td>${cell(tot.msgs, Math.max(0, goalNews - goalCalls))}</td><td>${cell(tot.pres, goalPres)}</td></tr>`; };
  const mine = sumProsp(t, t, S.me); const myGoal = +cfg.perDay[S.me] || 0;
  const act = S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage)).length; const capFit = (typeof capacity === 'function' ? capacity().fits : 0);
  const spentMonth = S.plan ? S.plan.waves.reduce((a, w) => a + (+w.spent || 0), 0) : 0;
  if (compact) return `<div class="gl"><span>Meta de hoje: <b>${myGoal}</b> novos (você fez <b>${mine.news}</b>) · equipe <b>${dailyCap(cfg)}</b>/dia</span></div>`;
  return `<section class="card goals"><header><h3>Metas</h3><small class="muted">editáveis em “Configurar o plano”</small></header>
    <div class="goal-cards">
      <div><span>Novos contatos por dia</span><b>${dailyCap(cfg)}</b><small>Tiago ${cfg.perDay.Tiago} · Micaela ${cfg.perDay.Micaela}<br>cada um: ${cfg.callsPer} ligações + ${Math.max(0, (cfg.perDay.Tiago || 0) - cfg.callsPer)} mensagens</small></div>
      <div><span>Diagnósticos</span><b>${(+g.pres || 1) * 2}/dia</b><small>até ${cfg.diagSlots} por dia na agenda do Tiago</small></div>
      <div><span>Anúncios</span><b>${money(cfg.budgetDay)}/dia</b><small>≈ ${money(cfg.budgetDay * 30)}/mês · lançado ${money(spentMonth)}</small></div>
      <div><span>Clientes ativos</span><b>${act} / ${S.settings.goalClinics}</b><small>cabem ~${capFit} com as horas atuais</small></div>
    </div>
    <div class="tscroll"><table class="tbl gtbl"><thead><tr><th></th><th>Novos contatos</th><th>Ligações</th><th>Mensagens</th><th>Diagnósticos</th></tr></thead><tbody>${per.map(([l, a, b]) => row(l, a, b)).join('')}</tbody></table></div>
    <p class="hint">Somando você e a Micaela. O que faltar num dia passa para o dia seguinte e o plano se ajusta sozinho.</p></section>`;
}

// ---------- cronograma: dia a dia, mês a mês, ano a ano ----------
function planDays() {
  const p = S.plan; if (!p) return {};
  const key = p.v + '|' + p.createdAt; if (ui._pd && ui._pd.key === key) return ui._pd.days;
  const cap = dailyCap(p.cfg); const days = {}; const get = (d) => (days[d] = days[d] || { calls: 0, items: [], ads: [], budget: 0 });
  let day = p.waves[0].first, left = cap;
  p.waves.forEach((w) => w.cities.forEach(([uf, city, a, b, c, d2]) => { let n = a + b + c + d2;
    while (n > 0) { const u = Math.min(left, n); const D = get(day); D.calls += u; const last = D.items[D.items.length - 1];
      if (last && last.city === city && last.w === w.i) last.n += u; else D.items.push({ w: w.i, uf, city, n: u });
      n -= u; left -= u; if (left === 0) { day = nextWork(addDays(day, 1), p.cfg); left = cap; } } }));
  for (let d = p.waves[0].ads; d <= p.waves[p.waves.length - 1].last; d = addDays(d, 1)) { const act = p.waves.filter((w) => w.ads <= d && d <= w.last); if (act.length) { const D = get(d); D.ads = act; D.budget = p.cfg.budgetDay; } }
  ui._pd = { key, days }; return days;
}
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const capFirst = (x) => x.charAt(0).toUpperCase() + x.slice(1);
function doneOn(d) { return Object.values(((S.daily || {})[d] || {}).p || {}).reduce((a, v) => a + (+v.news || 0), 0); }
function cronHTML() {
  const p = S.plan; if (!p) return ''; const days = planDays(); const mode = ui.cron || 'dia'; const t = todayStr();
  const tabs = `<div class="seg">${[['dia', 'Dia a dia'], ['mes', 'Mês a mês'], ['ano', 'Ano a ano']].map(([k, l]) => `<button aria-selected="${mode === k}" data-act="cron" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (mode === 'dia') {
    const ym = ui.cronYm || (t >= p.waves[0].ads ? t.slice(0, 7) : p.waves[0].ads.slice(0, 7)); ui.cronYm = ym;
    const label = capFirst(parseD(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    const end = addDays(addMonths(ym + '-01', 1), -1); const rows = [];
    for (let d = ym + '-01'; d <= end; d = addDays(d, 1)) {
      const D = days[d]; const tasks = S.tasks.filter((x) => x.planTask && x.due === d); const off = !isWorkday(d, p.cfg);
      if (!D && !tasks.length) continue;
      const done = doneOn(d); const ads = D && D.ads.length ? D.ads.map((w) => `O${w.i}: ${adNames(w).join(', ')}`).join(' · ') : '';
      rows.push(`<tr class="${d === t ? 'today' : ''} ${off ? 'off' : ''}"><th>${d.slice(8)}/${d.slice(5, 7)}<small>${WD[parseD(d).getDay()]}${HOLIDAYS.includes(d) ? ' · feriado' : ''}</small></th>
        <td data-l="Ligações">${D && D.items.length ? D.items.map((x) => `<span class="ci">O${x.w} · <b>${esc(x.city)}</b>/${x.uf} ${x.n}</span>`).join('') : off ? '<small class="muted">sem ligações</small>' : '—'}</td>
        <td data-l="Contatos">${D && D.calls ? `<b>${D.calls}</b>${d <= t ? `<small class="${done >= D.calls ? 'okc' : done ? '' : 'late'}"> feito ${done}</small>` : ''}` : '—'}</td>
        <td data-l="Anúncios">${ads ? `<small>${esc(ads)}</small>` : '—'}</td><td data-l="Verba">${D && D.budget ? money(D.budget) : '—'}</td>
        <td data-l="Tarefas">${tasks.map((x) => `<small class="tk ${x.status === 'concluido' ? 'done' : ''}">${x.status === 'concluido' ? '✓ ' : ''}${esc(x.title.replace(/^Onda (\d+) · \w{2}: /, 'O$1: '))} · ${x.owner}</small>`).join('') || '—'}</td></tr>`);
    }
    body = `<div class="cal-h"><button class="btn sm" data-act="cronNav" data-d="-1" aria-label="Mês anterior">←</button><h2>${label}</h2><button class="btn sm" data-act="cronNav" data-d="1" aria-label="Próximo mês">→</button><button class="btn sm ghost" data-act="cronNav" data-d="0">Hoje</button></div>
      ${rows.length ? `<div class="tscroll"><table class="tbl cron"><thead><tr><th>Dia</th><th>Ligações (onda · cidade · contatos)</th><th>Contatos</th><th>Anúncios no ar</th><th>Verba</th><th>Tarefas do plano</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('Nada planejado neste mês.', 'calendario')}`;
  } else {
    const keyOf = (d) => (mode === 'mes' ? d.slice(0, 7) : d.slice(0, 4)); const agg = {};
    Object.entries(days).forEach(([d, D]) => { const k = keyOf(d); const a = (agg[k] = agg[k] || { calls: 0, done: 0, budget: 0, waves: new Set(), ufs: new Set(), cities: {} }); a.calls += D.calls; a.budget += D.budget || 0; a.done += d <= t ? doneOn(d) : 0;
      D.items.forEach((x) => { a.waves.add(x.w); a.ufs.add(x.uf); a.cities[x.city] = (a.cities[x.city] || 0) + x.n; }); D.ads.forEach((w) => a.waves.add(w.i)); });
    const spent = {}; p.waves.forEach((w) => { if (w.spent) { const k = keyOf(w.first); spent[k] = (spent[k] || 0) + +w.spent; } });
    const label = (k) => (mode === 'mes' ? capFirst(parseD(k + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })) : k);
    body = `<div class="tscroll"><table class="tbl cron cm"><thead><tr><th>${mode === 'mes' ? 'Mês' : 'Ano'}</th><th>Ondas</th><th>Onde (cidades com mais contatos)</th><th>Contatos previstos</th><th>Feitos</th><th>Verba prevista</th><th>Gasto lançado</th></tr></thead><tbody>
      ${Object.keys(agg).sort().map((k) => { const a = agg[k]; const ws = [...a.waves].sort((x, y) => x - y); const top = Object.entries(a.cities).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([c]) => c);
        return `<tr class="${keyOf(t) === k ? 'today' : ''}"><th>${label(k)}</th><td>${ws.length ? `${ws[0]}${ws.length > 1 ? '–' + ws[ws.length - 1] : ''}` : '—'}</td><td><small><b>${[...a.ufs].join(', ')}</b> · ${esc(top.join(', '))}</small></td><td><b>${a.calls.toLocaleString('pt-BR')}</b></td><td>${a.done ? a.done.toLocaleString('pt-BR') : '—'}</td><td>${money(Math.round(a.budget))}</td><td>${spent[k] ? money(spent[k]) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  return `<section class="card cron-card"><header><h3>Cronograma</h3>${tabs}</header>${body}<p class="hint">Previsto pelo plano atual. “Feito” vem dos contatos registrados por você e pela Micaela. Se o ritmo mudar, o plano se ajusta.</p></section>`;
}
