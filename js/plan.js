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
async function genPlan(reason) {
  const cfg = planCfg(); const na = (s) => noAcc(s).replace(/'/g, '').replace(/-/g, ' ');
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
    w.adRegions = Object.entries(w.regions).filter(([, n2]) => n2 >= cfg.minAdRegion).map(([r]) => r);
    if (!w.adRegions.length) w.adRegions = [Object.entries(w.regions).sort((a, b) => b[1] - a[1])[0][0]];
  });
  if (waves.length) { for (let d = waves[0].ads; d <= waves[waves.length - 1].last; d = addDays(d, 1)) { const act = waves.filter((w) => w.ads <= d && d <= w.last); act.forEach((w) => (w.budget += cfg.budgetDay / act.length)); } }
  waves.forEach((w) => (w.budget = Math.round(w.budget)));
  const old = S.plan; const v = (old ? old.v : 0) + 1;
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
    const regs = w.adRegions.join(', ');
    S.tasks.push({ id, clinicId: ROITY_ID, month: 0, kind: 'onda', pillar: pil, title: `Onda ${w.i} · ${w.uf}: ${txt}${k === 'k4' ? ' — ' + regs : ''}`, owner: who, due, priority: 'alta', status: 'a_fazer',
      checklist: k === 'k3' ? [{ t: 'Criativo A — dor (atendimento lento, perda de agendamentos)', done: false }, { t: 'Criativo B — solução (MBCR + 24AGÁ, diagnóstico gratuito)', done: false }] : k === 'k4' ? [{ t: `Verba: até ${money(p.cfg.budgetDay)}/dia no total`, done: false }, { t: 'Segmentação por região: ' + regs, done: false }] : [],
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
  const cfgForm = `<details class="card plan-cfg" ${p ? '' : 'open'}><summary><b>Configurar o plano</b> <small class="muted">metas, verba, classes e datas</small></summary>
    <form data-form="planCfg" class="mform">
      <label><span>Começar as ligações em</span><input type="date" name="start" value="${cfg.start}"></label>
      <label><span>Verba de anúncios por dia (total)</span><input type="number" min="0" step="1" name="budgetDay" value="${cfg.budgetDay}"></label>
      <label><span>Novos contatos/dia — Tiago</span><input type="number" min="0" name="pT" value="${cfg.perDay.Tiago}"></label>
      <label><span>Novos contatos/dia — Micaela</span><input type="number" min="0" name="pM" value="${cfg.perDay.Micaela}"></label>
      <label><span>Desses, por ligação (cada um)</span><input type="number" min="0" name="callsPer" value="${cfg.callsPer}"></label>
      <label><span>Aquecimento antes das ligações (dias)</span><input type="number" min="0" max="14" name="adsLead" value="${cfg.adsLead}"></label>
      <label><span>Dias úteis por onda</span><input type="number" min="1" max="15" name="waveDays" value="${cfg.waveDays}"></label>
      <label><span>Diagnósticos por dia (Tiago)</span><input type="number" min="1" max="10" name="diagSlots" value="${cfg.diagSlots}"></label>
      <div class="full"><span class="lbl2">Classes no plano</span><div class="chips">${Object.entries(TIERS).map(([k, l]) => `<label class="chip ${cfg.tiers.includes(k) ? 'on' : ''}"><input type="checkbox" name="tier" value="${k}" ${cfg.tiers.includes(k) ? 'checked' : ''} hidden>${k} · ${l}</label>`).join('')}</div></div>
      <label class="full"><span>Dias sem prospecção (feriados municipais, folgas) — um por linha, ex.: 2026-12-24</span><textarea name="blocked" rows="2">${esc((cfg.blocked || []).join('\n'))}</textarea></label>
      <div class="btns end"><button class="btn primary">${p ? 'Salvar e replanejar' : 'Gerar o plano'}</button></div>
    </form><p class="hint">Feriados nacionais e fins de semana já ficam de fora. A ordem dos estados é MT → GO → MS → MG → PR → SC, cidades maiores primeiro.</p></details>`;
  if (!p) { view().innerHTML = `<div class="notice">Ainda não há plano. Confira os números abaixo e toque em <b>Gerar o plano</b>. Ele usa as clínicas que você ainda não contatou.</div>${cfgForm}`; return; }
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
    ${cur ? `<section class="card wave-now"><header><h3>${waveStatus(cur)[0] === 'ativa' ? 'Agora' : 'Próxima'}: Onda ${cur.i} · ${cur.uf}</h3><span class="btns" style="margin:0"><button class="btn primary" data-act="quotaStart">▶ Minha cota de hoje</button><button class="btn" data-act="planRe">Replanejar</button></span></header>
      <p class="muted">Anúncios em ${esc(cur.adRegions.join(', '))} · ligações ${fmtShort(cur.first)} a ${fmtShort(cur.last)}</p></section>` : ''}
    <h3 class="sec-t">Ondas</h3>
    <div class="waves">${W.slice(0, show).map((w) => { const [k, l] = waveStatus(w); const A = w.cities.reduce((a, c) => a + c[2], 0), B = w.cities.reduce((a, c) => a + c[3], 0), C = w.cities.reduce((a, c) => a + c[4] + c[5], 0);
      const small = Object.keys(w.regions).filter((r) => !w.adRegions.includes(r));
      return `<article class="wave st-${k}"><header><b>Onda ${w.i}</b><span class="wv-uf">${w.uf}</span><span class="wv-st">${l}</span></header>
        <div class="wv-dates"><div><small>ANÚNCIOS</small><b>${dm(w.ads)} → ${dm(w.last)}</b></div><div><small>LIGAÇÕES</small><b>${dm(w.first)} → ${dm(w.last)}</b></div><div><small>CLÍNICAS</small><b>${w.n.toLocaleString('pt-BR')}</b></div></div>
        <p class="wv-reg">📣 ${w.adRegions.map(esc).join(' · ')}${small.length ? `<small> + no mesmo anúncio: ${small.map(esc).join(', ')}</small>` : ''}</p>
        <p class="wv-cls">${A ? `<span class="tg tA">A ${A}</span>` : ''}${B ? `<span class="tg tB">B ${B}</span>` : ''}${C ? `<span class="tg tC">C/D ${C}</span>` : ''}</p>
        <p class="wv-cities">${w.cities.slice(0, 6).map((c) => `${esc(c[1])} <b>${c[2] + c[3] + c[4] + c[5]}</b>`).join(' · ')}${w.cities.length > 6 ? ` · +${w.cities.length - 6} cidades` : ''}</p>
        <div class="wv-bud"><span>Verba prevista <b>${money(w.budget)}</b></span><label><span>Gasto</span><input type="number" min="0" step="1" data-spent="${w.i}" value="${w.spent || ''}" placeholder="R$"></label></div></article>`; }).join('')}</div>
    ${W.length > show ? `<button class="btn block" data-act="waveMore">Ver mais ondas (${W.length - show})</button>` : ''}
    ${cfgForm}
    ${(S.planHist || []).length ? `<section class="card"><header><h3>Versões anteriores</h3></header><ul class="log">${S.planHist.map((h) => `<li><time>${new Date(h.at).toLocaleDateString('pt-BR')}</time><b>v${h.v}</b> ${h.waves} ondas até ${h.end ? fmtDate(h.end) : '—'} · ${esc(h.note)}</li>`).join('')}</ul></section>` : ''}`;
};
