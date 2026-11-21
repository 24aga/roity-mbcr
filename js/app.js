// Roity MBCR Control — telas e navegação.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = () => $('#view');
const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
const optS = (list, cur) => list.map((v) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
const stageLabel = (k) => (STAGES.find((s) => s[0] === k) || [k, k])[1];
const segLabel = (k) => ({ estetica: 'Estética', odontologia: 'Odontologia' }[k] || k || '—');
const clinicById = (id) => S.clinics.find((c) => c.id === id);
const taskById = (id) => S.tasks.find((t) => t.id === id);
const journeyClinics = () => S.clinics.filter((c) => c.journey);
const demoBadge = (c) => (c && c.demo ? ' <span class="badge demo">DEMO</span>' : '');
const pill = (k, l) => `<span class="pill st-${k}">${esc(l)}</span>`;
const pillarTag = (k) => (k ? `<span class="ptag" style="--pc:${PILLARS[k].color}">${PILLARS[k].name}</span>` : '');

let route = { name: 'visao', params: [] };
let mm = null; // instância do mapa mental
const ui = { mapClinic: null, mapMode: 'mapa', taskFilter: 'semana', taskOwner: '', taskClinic: '', taskQuery: '', taskStatus: '', calMonth: null, resClinic: null, resMonth: null, crClinic: '', crMonth: '', kanMonth: '', clinicTab: 'hoje', panel: null };

// ================= roteamento =================
const NAV = [
  ['visao', 'Visão geral', '◧'], ['mapa', 'Mapa MBCR', '✳'], ['clinicas', 'Clínicas', '⌂'], ['tarefas', 'Tarefas', '☑'],
  ['calendario', 'Calendário', '▦'], ['criativos', 'Criativos', '✎'], ['apresentar', 'Apresentar ao cliente', '▶'],
  ['financeiro', 'Financeiro', 'R$'], ['config', 'Configurações', '⚙'],
];
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'visao';
  const [name, ...params] = h.split('/');
  route = { name, params };
  if (name === 'clinica' && params[0] !== ui.lastClinic) { ui.clinicTab = 'hoje'; ui.lastClinic = params[0]; }
}
function go(h) { location.hash = h; }
function render() {
  parseRoute();
  if (mm && !(route.name === 'mapa' && ui.mapMode === 'mapa')) { mm.destroy(); mm = null; }
  const fn = VIEWS[route.name] || VIEWS.visao;
  const navKey = route.name === 'clinica' ? 'clinicas' : route.name === 'relatorio' || route.name === 'proposta' ? 'clinicas' : route.name;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  document.body.dataset.route = route.name;
  document.body.classList.remove('present');
  const title = (NAV.find((n) => n[0] === navKey) || [0, 'Roity'])[1];
  $('#topTitle').textContent = title;
  fn();
  if (ui.panel) renderPanel();
  if (route.name === 'config') renderSyncBadge();
}
function rerender() {
  save();
  if (route.name === 'mapa' && ui.mapMode === 'mapa' && mm) { mm.o.overall = overallFor(mm.o.clinic); mm.refresh(); renderMapSide(); }
  else { const y = $('.main').scrollTop; render(); $('.main').scrollTop = y; return; }
  if (ui.panel) renderPanel();
}

// ================= ações em tarefas =================
function setTask(t, field, value) {
  const old = t[field];
  if (old === value) return;
  t[field] = value;
  const labels = { status: 'status', owner: 'responsável', due: 'prazo', priority: 'prioridade', title: 'título', evidence: 'evidência', notes: 'observações' };
  let what = `${labels[field] || field}: ${field === 'status' ? statusName(old) + ' → ' + statusName(value) : value}`;
  if (field === 'status') t.doneAt = value === 'concluido' ? todayStr() : null;
  if (field === 'evidence' || field === 'notes') what = `atualizou ${labels[field]}`;
  t.history.unshift({ at: new Date().toISOString(), who: S.me, what });
  log(`Tarefa “${t.title}” — ${what}`, t.clinicId);
}
const statusName = (k) => (TASK_STATUS.find((s) => s[0] === k) || [k, k])[1];
function toggleDone(id) { const t = taskById(id); if (!t) return; setTask(t, 'status', t.status === 'concluido' ? 'a_fazer' : 'concluido'); rerender(); toast(t.status === 'concluido' ? 'Tarefa concluída' : 'Tarefa reaberta'); }

function monthData(clinic, n) {
  if (!clinic) {
    const m = MONTHS[n - 1];
    return { title: m.title, short: m.short, pillars: m.pillars, desc: m.desc, outputs: m.outputs,
      novo: m.items.map((i) => ({ title: i.t, pillar: i.p, owner: i.o, d: i.d, c: i.c })),
      rotina: ROUTINES.map((i) => ({ title: i.t, pillar: i.p, owner: i.o, d: i.d })), state: null, isCurrent: false };
  }
  const tm = clinic.journey.template[n - 1];
  const tasks = S.tasks.filter((t) => t.clinicId === clinic.id && t.month === n).sort((a, b) => a.due.localeCompare(b.due) || (a.kind === 'novo' ? -1 : 1));
  return { title: tm.title, short: tm.short, pillars: tm.pillars, desc: tm.desc, outputs: tm.outputs,
    novo: tasks.filter((t) => t.kind === 'novo'), rotina: tasks.filter((t) => t.kind !== 'novo'), tasks,
    state: groupState(tasks), isCurrent: currentMonth(clinic) === n };
}
function dayOf(t) { const c = clinicById(t.clinicId); return c ? diffDays(monthStart(c, t.month), t.due) + 1 : t.d; }
function overallFor(clinic) { return clinic ? groupState(S.tasks.filter((t) => t.clinicId === clinic.id)) : null; }

// ================= plano do dia =================
function todayPlan(c) {
  const today = todayStr(); const n = currentMonth(c);
  const inJourney = n >= 1 && n <= 12;
  const dayN = inJourney ? diffDays(monthStart(c, n), today) + 1 : null;
  const open = S.tasks.filter((t) => t.clinicId === c.id && t.status !== 'concluido').sort((a, b) => a.due.localeCompare(b.due) || (a.kind === 'novo' ? -1 : 1));
  const d2 = addDays(today, 2), d6 = addDays(today, 6);
  return {
    today, n, dayN, inJourney,
    late: open.filter((t) => t.due < today),
    hoje: open.filter((t) => t.due === today),
    comecar: open.filter((t) => t.due > today && t.due <= d2),
    semana: open.filter((t) => t.due > d2 && t.due <= d6),
    next: open.find((t) => t.due > d6),
    feitoHoje: S.tasks.filter((t) => t.clinicId === c.id && t.status === 'concluido' && t.doneAt === today),
  };
}
function dayHeader(c, p) {
  if (!c.journey) return 'Jornada não iniciada';
  if (p.n === 0) return `Começa em ${fmtDate(c.startDate)}`;
  if (p.n > 12) return 'Jornada de 12 meses encerrada';
  return `Mês ${p.n} · Dia ${p.dayN} — ${esc(c.journey.template[p.n - 1].short)}`;
}
function todayHTML(c, compact) {
  const p = todayPlan(c);
  const now = [...p.late, ...p.hoje, ...p.comecar];
  const grp = (title, list, cls, how) => list.length ? `<h4 class="dg ${cls}">${title} <small>${list.length}</small></h4><ul class="tlist">${list.map((t) => taskRow(t, { day: true, how })).join('')}</ul>` : '';
  if (compact) {
    const list = now.slice(0, 5);
    return `${list.length ? `<ul class="tlist">${list.map((t) => taskRow(t, { day: true })).join('')}</ul>` : `<div class="free">✓ Nada para hoje.${p.next ? ` Próxima: <b>Dia ${dayOf(p.next)}</b> · ${esc(p.next.title)}` : ''}</div>`}
      <a class="link" href="#/clinica/${c.id}" data-act="openToday" data-id="${c.id}">Abrir o dia completo →</a>`;
  }
  const md = p.inJourney ? monthData(c, p.n) : null;
  const crs = p.inJourney ? S.creatives.filter((x) => x.clinicId === c.id && x.month === p.n && !['em_uso', 'aprovado', 'nao_necessario'].includes(x.status)).length : 0;
  return `
    <section class="today-h"><small>${fmtDate(p.today, { weekday: 'long', day: '2-digit', month: 'long' })}</small>
      <h2>${dayHeader(c, p)}</h2>
      ${md ? `<p>${esc(md.desc)}</p><div class="wk-p"><div class="bar"><i style="width:${md.state.p * 100}%"></i></div><span>${Math.round(md.state.p * 100)}% do mês · ${md.state.done}/${md.state.total}</span></div>` : ''}
    </section>
    ${now.length ? '' : `<div class="free big">✓ Nenhuma entrega do método vence hoje ou nos próximos 2 dias.${p.next ? `<br>Próxima: <b>Dia ${dayOf(p.next)}</b> — ${esc(p.next.title)} (${fmtShort(p.next.due)}). Dá para adiantar.` : ''}</div>`}
    ${grp('Atrasadas — resolver primeiro', p.late, 'late', true)}
    ${grp('Fazer hoje', p.hoje, 'today', true)}
    ${grp('Começar agora (vence em até 2 dias)', p.comecar, 'soon', true)}
    ${grp('Mais adiante nesta semana', p.semana, 'later', false)}
    ${crs ? `<div class="notice">✎ ${crs} criativo(s) do mês ainda em produção. <a href="#/criativos" data-act="goCr" data-c="${c.id}" data-n="${p.n}">Ver criativos</a></div>` : ''}
    ${p.feitoHoje.length ? `<h4 class="dg done">Feito hoje <small>${p.feitoHoje.length}</small></h4><ul class="tlist">${p.feitoHoje.map((t) => taskRow(t, { day: true })).join('')}</ul>` : ''}`;
}

// ================= VIEWS =================
const VIEWS = {};

// ---------- Visão geral ----------
VIEWS.visao = () => {
  const today = todayStr(), wEnd = addDays(today, 7);
  const active = S.clinics.filter((c) => c.stage === 'ativo');
  const onb = S.clinics.filter((c) => c.stage === 'onboarding');
  const mrr = S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage)).reduce((a, c) => a + (+c.price || 0), 0);
  const open = S.tasks.filter((t) => t.status !== 'concluido' && clinicById(t.clinicId));
  const overdue = open.filter((t) => taskOverdue(t));
  const todayT = open.filter((t) => t.due === today);
  const meetings = open.filter((t) => t.meeting && t.due >= today && t.due <= wEnd);
  const pendingCr = S.creatives.filter((x) => { const c = clinicById(x.clinicId); return c && currentMonth(c) === x.month && !['em_uso', 'aprovado', 'nao_necessario'].includes(x.status); });
  const goal = S.settings.goalClinics;
  const cap = capacity();
  const alerts = buildAlerts();
  const hasDemo = S.clinics.some((c) => c.demo);
  const upcoming = open.filter((t) => t.due <= wEnd);

  const weekClinics = journeyClinics().filter((c) => ['ativo', 'onboarding'].includes(c.stage)).map((c) => {
    const n = currentMonth(c);
    const tasks = open.filter((t) => t.clinicId === c.id && t.due <= wEnd).sort((a, b) => a.due.localeCompare(b.due));
    return { c, n, tasks, st: n >= 1 && n <= 12 ? monthData(c, n).state : null };
  });
  const hello = (() => { const h = +new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();

  view().innerHTML = `
    ${hasDemo ? `<div class="notice demo-n"><span>Você está vendo <b>dados de demonstração</b> (marcados DEMO).</span><button class="btn sm danger" data-act="clearDemo">Apagar clínicas DEMO</button></div>` : ''}
    ${(() => { const real = S.clinics.some((c) => !c.demo); const lb = S.settings.lastBackup; const days = lb ? diffDays(lb, today) : null;
      return real && !Sync.enabled() && (days == null || days >= 7) ? `<div class="notice warn demo-n"><span>💾 ${days == null ? 'Você ainda não fez nenhum backup.' : `Último backup há ${days} dias.`} Seus dados ficam só neste aparelho.</span><button class="btn sm primary" data-act="exportJSON">Baixar backup agora</button></div>` : ''; })()}
    <div class="hello"><small>${fmtDate(today, { weekday: 'long', day: '2-digit', month: 'long' })}</small><h2>${hello}, ${esc(S.me)}.</h2>
      <p>${overdue.length ? `<b class="red">${overdue.length} entrega(s) atrasada(s)</b> · ` : ''}${upcoming.length ? `${open.filter((t) => t.due <= wEnd).length} entrega(s) até ${fmtShort(wEnd)}` : 'Nada vencendo esta semana'} · ${meetings.length} reunião(ões)</p></div>
    <div class="kpis k4">
      <a class="kpi" href="#/clinicas"><span>Clínicas ativas</span><b>${active.length}<small> / ${goal}</small></b>
        <div class="bar"><i style="width:${Math.min(100, (active.length / goal) * 100)}%"></i></div></a>
      <a class="kpi" href="#/financeiro"><span>MRR contratado</span><b>${money(mrr)}</b><em>Meta: ${money(goal * 2500)}</em></a>
      <a class="kpi ${overdue.length ? 'warn' : ''}" href="#/tarefas" data-act="tf" data-f="atrasadas"><span>Atrasadas</span><b>${overdue.length}</b><em>${todayT.length} para hoje</em></a>
      <a class="kpi" href="#/criativos"><span>Criativos em produção</span><b>${pendingCr.length}</b><em>${onb.length} clínica(s) em onboarding</em></a>
    </div>
    <h3 class="sec-t">Hoje em cada clínica</h3>
    ${weekClinics.length ? `<div class="wk">${weekClinics.map(({ c, n, tasks, st }) => `
      <section class="card wkc">
        <header><div><h3><a href="#/clinica/${c.id}" data-act="openToday" data-id="${c.id}">${esc(c.name)}</a>${demoBadge(c)}</h3>
          <small>${dayHeader(c, todayPlan(c))}</small></div>
          <a class="btn sm" href="#/mapa/${c.id}" data-act="openMap" data-id="${c.id}">Mapa</a></header>
        ${st ? `<div class="wk-p"><div class="bar"><i style="width:${st.p * 100}%"></i></div><span>${Math.round(st.p * 100)}% do mês</span></div>` : ''}
        ${todayHTML(c, true)}
      </section>`).join('')}</div>` : empty('Nenhuma clínica ativa com jornada. Cadastre uma em Clínicas.')}
    <div class="grid2">
      <section class="card">
        <header><h3>Alertas</h3></header>
        ${alerts.length ? `<ul class="alerts">${alerts.map((a) => `<li class="al-${a.k}"><b>${esc(a.t)}</b><span>${a.d}</span></li>`).join('')}</ul>` : empty('Sem alertas no momento.')}
      </section>
      <section class="card">
        <header><h3>Carga de trabalho estimada (mês)</h3><a class="link" href="#/config">Ajustar →</a></header>
        ${Object.entries(cap.people).map(([p, v]) => `<div class="cap"><div class="cap-h"><b>${p}</b><span>${v.need.toFixed(0)}h de ${v.cap}h</span></div>
          <div class="bar ${v.need > v.cap ? 'over' : ''}"><i style="width:${Math.min(100, (v.need / v.cap) * 100)}%"></i></div></div>`).join('')}
        <p class="hint">Tarefas do mês atual de cada clínica + ${CREATIVES_PER_MONTH} criativos × ${S.settings.hoursPerCreative}h. Reuniões: ${active.length * 2}h/mês. Não inclui suporte.</p>
      </section>
    </div>`;
};

function capacity() {
  const people = {};
  for (const p of ['Tiago', 'Micaela']) people[p] = { need: 0, cap: S.settings.capacity[p] * S.settings.workDays };
  for (const c of S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage) && c.journey)) {
    const n = Math.min(12, Math.max(1, currentMonth(c)));
    S.tasks.filter((t) => t.clinicId === c.id && t.month === n).forEach((t) => { if (people[t.owner]) people[t.owner].need += t.hours || 1; });
    people.Micaela.need += CREATIVES_PER_MONTH * S.settings.hoursPerCreative;
  }
  return { people };
}

function buildAlerts() {
  const out = [];
  for (const c of S.clinics) {
    if (c.journey && ['ativo', 'onboarding'].includes(c.stage)) {
      const n = currentMonth(c);
      const bl = S.tasks.filter((t) => t.clinicId === c.id && t.status === 'bloqueado');
      if (bl.length) out.push({ k: 'warn', t: `${c.name}: ${bl.length} tarefa(s) bloqueada(s)`, d: bl.slice(0, 2).map((t) => esc(t.title)).join(' · ') });
      if (n === 6 || n === 5) out.push({ k: 'warn', t: `${c.name}: avaliação do 1º ciclo se aproxima`, d: 'Garantia só conforme termos assinados e revisão humana/jurídica.' });
      if (n === 10 || n === 11) out.push({ k: 'info', t: `${c.name}: decisão de mídia dos meses 11–12`, d: 'Registrar se pausa (padrão) ou mantém tráfego, com aprovação da clínica.' });
    }
    if (c.exclusivity === 'em_analise') out.push({ k: 'info', t: `${c.name}: exclusividade em análise`, d: 'Não prometer território antes de aprovação manual.' });
    if (c.payment === 'atrasado') out.push({ k: 'warn', t: `${c.name}: pagamento atrasado`, d: 'Ver Financeiro.' });
  }
  return out.slice(0, 12);
}

const empty = (t) => `<div class="empty">${esc(t)}</div>`;
function taskRow(t, o = {}) {
  const c = clinicById(t.clinicId); const s = taskStatusLabel(t);
  const how = o.how ? howTo(t.title) : '';
  return `<li class="trow ${t.status === 'concluido' ? 'done' : ''}">
    <button class="chk ${t.status === 'concluido' ? 'on' : ''}" data-act="done" data-id="${t.id}" aria-label="${t.status === 'concluido' ? 'Reabrir' : 'Concluir'}: ${esc(t.title)}">${t.status === 'concluido' ? '✓' : ''}</button>
    <button class="trow-b" data-act="task" data-id="${t.id}">
      <span class="trow-t">${o.day ? `<span class="dayb">Dia ${dayOf(t)}</span>` : ''}${esc(t.title)}</span>
      ${how ? `<span class="trow-h">${esc(how)}</span>` : ''}
      <span class="trow-s">${pillarTag(t.pillar)} ${o.day ? (t.kind === 'novo' ? 'Novo · ' : 'Rotina · ') : c ? esc(c.name) + ' · Mês ' + t.month + ' · ' : ''}${esc(t.owner)} · ${fmtShort(t.due)}</span>
    </button>${pill(s.k, s.l)}</li>`;
}

// ---------- Mapa ----------
VIEWS.mapa = () => {
  const cl = journeyClinics();
  if (route.params[0]) ui.mapClinic = route.params[0];
  if (ui.mapClinic && !clinicById(ui.mapClinic)) ui.mapClinic = null;
  if (ui.mapClinic === null && cl.length && ui.mapClinicInit !== true) { ui.mapClinic = cl[0].id; }
  ui.mapClinicInit = true;
  const clinic = ui.mapClinic ? clinicById(ui.mapClinic) : null;
  const modes = [['mapa', 'Mapa mental'], ['linha', 'Linha do tempo'], ['kanban', 'Kanban'], ['lista', 'Lista']];
  view().innerHTML = `
    <div class="map-head">
      <label class="sel"><span>Visão</span><select data-act="mapClinic">
        <option value="">Método MBCR (modelo geral)</option>
        ${cl.map((c) => `<option value="${c.id}"${clinic && c.id === clinic.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></label>
      <div class="seg" role="tablist">${modes.map(([k, l]) => `<button role="tab" aria-selected="${ui.mapMode === k}" data-act="mapMode" data-m="${k}">${l}</button>`).join('')}</div>
      ${clinic ? `<div class="map-prog">${progressInline(overallFor(clinic))}<span>Mês atual: <b>${currentMonth(clinic) > 12 ? 'encerrada' : currentMonth(clinic) || 'não iniciou'}</b></span></div>` : '<div class="map-prog muted">Modelo: sem status. Escolha uma clínica para acompanhar.</div>'}
    </div>
    <div id="mapBody" class="map-body mode-${ui.mapMode}"></div>`;
  const body = $('#mapBody');
  if (ui.mapMode === 'mapa') {
    if (mm) mm.destroy();
    const isMobile = matchMedia('(max-width: 760px)').matches;
    const initial = clinic && !isMobile ? Math.min(12, Math.max(1, currentMonth(clinic))) : null;
    mm = new MindMap(body, {
      clinic, overall: overallFor(clinic), initialMonth: initial,
      getMonthData: (n) => monthData(clinic, n),
      onMonth: (n) => openPanel({ type: 'month', clinicId: clinic ? clinic.id : null, n }),
      onTask: (id) => openPanel({ type: 'task', id }),
      onTemplateItem: (n) => openPanel({ type: 'month', clinicId: null, n }),
      dayOf,
      insetRight: () => (innerWidth > 760 && ui.panel ? Math.min(460, innerWidth) : 0),
    });
  } else if (ui.mapMode === 'linha') body.innerHTML = timelineHTML(clinic);
  else if (ui.mapMode === 'kanban') body.innerHTML = kanbanHTML(clinic);
  else body.innerHTML = listHTML(clinic);
};
function renderMapSide() {
  const head = $('.map-prog');
  if (head && mm && mm.o.clinic) head.innerHTML = `${progressInline(overallFor(mm.o.clinic))}<span>Mês atual: <b>${currentMonth(mm.o.clinic) || 'não iniciou'}</b></span>`;
}
function progressInline(st) { return `<div class="pi"><div class="bar"><i style="width:${st.p * 100}%"></i></div><b>${Math.round(st.p * 100)}%</b><small>${st.done}/${st.total} tarefas</small></div>`; }

function timelineHTML(clinic) {
  return `<ol class="timeline">${MONTHS.map((m) => {
    const md = monthData(clinic, m.n); const st = md.state;
    return `<li class="tl-item ${md.isCurrent ? 'current' : ''} st-${st ? st.k : 'tpl'}" style="--pc:${PILLARS[md.pillars[0]].color}">
      <button class="tl-node" data-act="month" data-c="${clinic ? clinic.id : ''}" data-n="${m.n}"><span>${m.n}</span></button>
      <div class="tl-card">
        <button class="tl-h" data-act="month" data-c="${clinic ? clinic.id : ''}" data-n="${m.n}">
          <small>MÊS ${m.n}${clinic ? ' · ' + fmtShort(monthStart(clinic, m.n)) + ' – ' + fmtShort(monthEnd(clinic, m.n)) : ''}${md.isCurrent ? ' · <b>AGORA</b>' : ''}</small>
          <b>${esc(md.title)}</b>
          <span class="tl-p">${md.pillars.map(pillarTag).join('')} ${st ? pill(st.k, st.l + ' · ' + Math.round(st.p * 100) + '%') : ''}</span>
        </button>
        <div class="tl-branches">
          <div class="br"><h5>Nova implantação</h5><ul>${md.novo.map((t) => branchItem(t, clinic)).join('')}</ul></div>
          <details class="br"><summary>Rotinas contínuas (${md.rotina.length})</summary><ul>${md.rotina.map((t) => branchItem(t, clinic)).join('')}</ul></details>
        </div>
      </div></li>`;
  }).join('')}</ol>`;
}
function branchItem(t, clinic) {
  if (!clinic) return `<li><span class="dayb">Dia ${t.d}</span><span class="bi"><span>${esc(t.title)}</span><small>${esc(t.owner)}</small></span></li>`;
  const s = taskStatusLabel(t);
  return `<li class="${t.status === 'concluido' ? 'done' : ''}"><button class="chk sm ${t.status === 'concluido' ? 'on' : ''}" data-act="done" data-id="${t.id}" aria-label="Concluir ${esc(t.title)}">${t.status === 'concluido' ? '✓' : ''}</button>
    <span class="dayb">Dia ${dayOf(t)}</span><span class="bi"><button class="lnk" data-act="task" data-id="${t.id}">${esc(t.title)}</button><small>${esc(t.owner)} · ${fmtShort(t.due)} ${s.k === 'atrasado' || s.k === 'bloqueado' ? pill(s.k, s.l) : ''}</small></span></li>`;
}
function kanbanHTML(clinic) {
  if (!clinic) return empty('Escolha uma clínica para ver o Kanban das tarefas.');
  const cur = Math.min(12, Math.max(1, currentMonth(clinic)));
  const mf = ui.kanMonth === '' ? cur : +ui.kanMonth;
  const tasks = S.tasks.filter((t) => t.clinicId === clinic.id && (mf === 0 || t.month === mf));
  return `<div class="row-f"><label class="sel"><span>Mês</span><select data-act="kanMonth"><option value="0"${mf === 0 ? ' selected' : ''}>Todos</option>${MONTHS.map((m) => `<option value="${m.n}"${m.n === mf ? ' selected' : ''}>Mês ${m.n} — ${m.short}</option>`).join('')}</select></label></div>
  <div class="kanban">${TASK_STATUS.map(([k, l]) => {
    const list = tasks.filter((t) => t.status === k);
    return `<section class="kcol" data-drop="${k}"><header>${pill(k, l)}<b>${list.length}</b></header>
      ${list.map((t) => `<article class="kcard ${taskOverdue(t) ? 'late' : ''}" draggable="true" data-drag="${t.id}">
        <button data-act="task" data-id="${t.id}"><b>${esc(t.title)}</b><span>${pillarTag(t.pillar)} Mês ${t.month} · ${esc(t.owner)} · ${fmtShort(t.due)}${taskOverdue(t) ? ' · <em>Atrasado</em>' : ''}</span></button>
        <select data-act="kstat" data-id="${t.id}" aria-label="Mover para">${opt(TASK_STATUS, t.status)}</select></article>`).join('')}
    </section>`;
  }).join('')}</div>`;
}
function listHTML(clinic) {
  return MONTHS.map((m) => {
    const md = monthData(clinic, m.n);
    return `<section class="card list-m"><header><h3><span class="mnum" style="background:${PILLARS[md.pillars[0]].color}">${m.n}</span>${esc(md.title)}</h3>${md.state ? pill(md.state.k, md.state.l + ' · ' + Math.round(md.state.p * 100) + '%') : ''}</header>
      ${clinic ? `<ul class="tlist">${md.tasks.map(taskRow).join('')}</ul>` : `<ul class="plain">${md.novo.map((t) => `<li>${pillarTag(t.pillar)} ${esc(t.title)} <small>· ${t.owner}</small></li>`).join('')}</ul>`}</section>`;
  }).join('');
}

// ---------- Clínicas ----------
VIEWS.clinicas = () => {
  const cols = STAGES;
  view().innerHTML = `
    <div class="page-h"><p class="muted">Pipeline de clínicas (clientes da Roity). Toque numa clínica para abrir, editar ou excluir.</p>
      <button class="btn primary" data-act="newClinic">+ Nova clínica</button></div>
    ${S.clinics.some((c) => c.demo) ? `<div class="notice demo-n"><span>Estas clínicas marcadas <b>DEMO</b> são só exemplo.</span><button class="btn sm danger" data-act="clearDemo">Apagar clínicas DEMO</button></div>` : ''}
    ${S.clinics.length ? `<div class="pipeline">${cols.map(([k, l]) => {
      const list = S.clinics.filter((c) => c.stage === k);
      return `<section class="pcol"><header><b>${l}</b><span>${list.length}</span></header>
        ${list.map((c) => {
          const st = c.journey ? overallFor(c) : null; const n = currentMonth(c);
          return `<a class="ccard" href="#/clinica/${c.id}"><b>${esc(c.name)}${demoBadge(c)}</b>
            <span>${segLabel(c.segment)} · ${esc(c.city || '—')}${c.uf ? '/' + esc(c.uf) : ''}</span>
            ${st ? `<div class="bar sm"><i style="width:${st.p * 100}%"></i></div><small>${n > 12 ? 'Jornada encerrada' : n ? 'Mês ' + n + ' de 12' : 'Começa ' + fmtShort(c.startDate)} · ${Math.round(st.p * 100)}%</small>` : '<small>Jornada não iniciada</small>'}</a>`;
        }).join('') || '<div class="pempty">—</div>'}</section>`;
    }).join('')}</div>` : empty('Nenhuma clínica ainda. Cadastre a primeira.')}`;
};

VIEWS.clinica = () => {
  const c = clinicById(route.params[0]);
  if (!c) { view().innerHTML = empty('Clínica não encontrada.'); return; }
  const tabs = [['hoje', 'Hoje'], ['resumo', 'Resumo'], ['jornada', 'Jornada'], ['tarefas', 'Tarefas'], ['contrato', 'Contrato e garantia'], ['historico', 'Histórico']];
  const st = c.journey ? overallFor(c) : null; const n = currentMonth(c);
  let body = '';
  if (ui.clinicTab === 'hoje') {
    body = todayHTML(c, false);
  } else if (ui.clinicTab === 'resumo') {
    const conf = conflictsFor(c);
    body = `<div class="grid2">
      <section class="card"><header><h3>Dados</h3><button class="btn sm" data-act="editClinic" data-id="${c.id}">Editar</button></header>
        <dl class="dl">
          <dt>Segmento</dt><dd>${segLabel(c.segment)}</dd><dt>Cidade/UF</dt><dd>${esc(c.city || '—')}${c.uf ? '/' + esc(c.uf) : ''}</dd>
          <dt>Contato</dt><dd>${esc(c.contact || '—')} ${c.phone ? '· ' + esc(c.phone) : ''}</dd>
          <dt>Responsável pelos fechamentos</dt><dd>${esc(c.humanResp || 'não definido')}</dd>
          <dt>Faturamento base</dt><dd>${money(c.baseRevenue)}</dd><dt>Mídia/mês (da clínica)</dt><dd>${money(c.mediaBudget)}</dd>
          <dt>Honorários</dt><dd>${money(c.price)}/mês</dd><dt>Implantação</dt><dd>${c.setupWaived ? 'Isenta — ' + esc(c.setupReason || 'motivo não informado') : money(c.setupFee)}</dd>
          <dt>Início</dt><dd>${fmtDate(c.startDate)}</dd><dt>Etapa</dt><dd>${stageLabel(c.stage)}</dd>
        </dl>${c.notes ? `<p class="hint">${esc(c.notes)}</p>` : ''}</section>
      <section class="card"><header><h3>Jornada MBCR</h3></header>
        ${c.journey ? `${progressInline(st)}<p>${n > 12 ? 'Jornada de 12 meses encerrada.' : n ? `Mês atual: <b>${n} — ${esc(c.journey.template[n - 1].title)}</b>` : `Começa em ${fmtDate(c.startDate)}.`}</p>
          <div class="btns"><a class="btn primary" href="#/mapa/${c.id}" data-act="openMap" data-id="${c.id}">Abrir mapa mental</a>
          ${n >= 1 && n <= 12 ? `<button class="btn" data-act="month" data-c="${c.id}" data-n="${n}">Ver mês ${n}</button><a class="btn" href="#/relatorio/${c.id}/${n}">Relatório do mês</a>` : ''}</div>`
          : `<p>A jornada ainda não foi iniciada. Ao começar, o app gera todas as tarefas, reuniões e ${CREATIVES_PER_MONTH} slots de criativos por mês a partir de <b>${fmtDate(c.startDate)}</b>.</p>
          <button class="btn primary" data-act="startJourney" data-id="${c.id}">Começar jornada MBCR</button>`}
      </section>
      <section class="card"><header><h3>Exclusividade territorial</h3></header>
        <p><b>Área proposta:</b> ${esc(c.territory || 'não informada')}</p>
        <p><b>Status:</b> ${{ nao_solicitada: 'Não solicitada', em_analise: 'Em análise (não prometer ainda)', aprovada: 'Aprovada formalmente', negada: 'Negada / renegociar' }[c.exclusivity] || '—'}</p>
        ${conf.length ? `<div class="notice warn">Possível conflito com: ${conf.map((x) => `<a href="#/clinica/${x.id}">${esc(x.name)}</a>`).join(', ')} (mesmo segmento e cidade). Verificar e decidir manualmente.</div>` : '<p class="hint">Nenhum conflito encontrado com clínicas ativas do mesmo segmento e cidade.</p>'}
      </section>
      <section class="card"><header><h3>Próximas entregas</h3><button class="btn sm" data-act="clinicTab" data-t="tarefas">Ver todas</button></header>${(() => { const l = S.tasks.filter((t) => t.clinicId === c.id && t.status !== 'concluido').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6); return l.length ? `<ul class="tlist">${l.map((t) => taskRow(t, { day: true })).join('')}</ul>` : empty('Nenhuma entrega pendente.'); })()}</section>
    </div>`;
  } else if (ui.clinicTab === 'jornada') {
    body = c.journey ? `<div class="mgrid">${MONTHS.map((m) => { const md = monthData(c, m.n); return `<button class="mcell st-${md.state.k} ${md.isCurrent ? 'current' : ''}" data-act="month" data-c="${c.id}" data-n="${m.n}" style="--pc:${PILLARS[md.pillars[0]].color}">
      <small>MÊS ${m.n} · ${fmtShort(monthStart(c, m.n))}</small><b>${esc(md.short)}</b><div class="bar sm"><i style="width:${md.state.p * 100}%"></i></div><span>${md.state.l} · ${md.state.done}/${md.state.total}</span></button>`; }).join('')}</div>` : empty('Jornada não iniciada.');
  } else if (ui.clinicTab === 'tarefas') {
    const list = S.tasks.filter((t) => t.clinicId === c.id && t.status !== 'concluido').sort((a, b) => a.due.localeCompare(b.due));
    body = `<div class="page-h"><span class="muted">${list.length} tarefas em aberto</span><button class="btn sm" data-act="newTask" data-c="${c.id}">+ Tarefa</button></div>
      <section class="card"><ul class="tlist">${list.slice(0, 80).map(taskRow).join('') || empty('Tudo concluído.')}</ul></section>`;
  } else if (ui.clinicTab === 'contrato') {
    const exp = 6 * ((+c.price || 0) + (+c.mediaBudget || 0));
    body = `<div class="grid2"><section class="card"><header><h3>Meta individual e garantia</h3><button class="btn sm" data-act="editClinic" data-id="${c.id}">Editar</button></header>
      <div class="notice warn">A garantia ainda depende de redação jurídica. O app <b>não</b> decide elegibilidade, “garantia perdida” ou “reembolso devido”: isso é sempre análise humana/jurídica conforme termos assinados.</div>
      <dl class="dl"><dt>Meta individual</dt><dd>${esc(c.goal || 'não definida')}</dd>
      <dt>Status da garantia</dt><dd>${{ em_definicao: 'Em definição', aguardando_juridico: 'Aguardando revisão jurídica', termos_assinados: 'Termos assinados', em_avaliacao: 'Em avaliação humana', avaliado: 'Avaliado manualmente' }[c.guarantee] || '—'}</dd>
      <dt>Exposição estimada (6 × honorários + mídia)</dt><dd>${money(exp)}</dd></dl>
      <p class="hint">Cancelamento sem multa ≠ elegibilidade à garantia especial (exige completar o ciclo de 6 meses e cumprir obrigações). Deixe isso claro no contrato.</p></section>
      <section class="card"><header><h3>Contrato</h3></header><dl class="dl"><dt>Honorários</dt><dd>${money(c.price)}</dd><dt>Implantação</dt><dd>${c.setupWaived ? 'Isenta' : money(c.setupFee)}</dd>
      <dt>Pagamento</dt><dd>${{ em_dia: 'Em dia', pendente: 'Pendente', atrasado: 'Atrasado', na: 'Não se aplica' }[c.payment] || '—'}</dd><dt>Duração</dt><dd>12 meses (1º ciclo: 6 meses)</dd></dl></section></div>`;
  } else {
    const l = S.log.filter((x) => x.clinicId === c.id).slice(0, 100);
    body = `<section class="card"><ul class="log">${l.map(logItem).join('') || empty('Sem histórico.')}</ul></section>`;
  }
  view().innerHTML = `
    <div class="ch"><div class="ch-top"><a href="#/clinicas" class="back">← Clínicas</a><span class="btns" style="margin:0"><a class="btn sm primary" href="#/proposta/${c.id}">Gerar proposta</a><button class="btn sm" data-act="editClinic" data-id="${c.id}">Editar</button><button class="btn sm danger" data-act="delClinic" data-id="${c.id}">Excluir clínica</button></span></div>
      <h2>${esc(c.name)}${demoBadge(c)}</h2><span class="muted">${segLabel(c.segment)} · ${esc(c.city || '')} · ${stageLabel(c.stage)}</span></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${ui.clinicTab === k ? 'on' : ''}" data-act="clinicTab" data-t="${k}">${l}</button>`).join('')}</div>
    ${body}`;
};
const logItem = (x) => `<li><time>${new Date(x.at).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><b>${esc(x.who)}</b> ${esc(x.what)}</li>`;
function conflictsFor(c) {
  const norm = (s) => (s || '').trim().toLowerCase();
  return S.clinics.filter((o) => o.id !== c.id && ['ativo', 'onboarding', 'negociacao'].includes(o.stage) && o.segment === c.segment && norm(o.city) && norm(o.city) === norm(c.city));
}

// ---------- Tarefas ----------
VIEWS.tarefas = () => {
  const today = todayStr(); const wEnd = addDays(today, 6);
  const f = ui.taskFilter;
  let list = S.tasks.filter((t) => clinicById(t.clinicId));
  if (f === 'hoje') list = list.filter((t) => t.status !== 'concluido' && t.due <= today);
  else if (f === 'semana') list = list.filter((t) => t.status !== 'concluido' && t.due <= wEnd);
  else if (f === 'atrasadas') list = list.filter((t) => taskOverdue(t));
  else if (f === 'abertas') list = list.filter((t) => t.status !== 'concluido');
  else if (f === 'concluidas') list = list.filter((t) => t.status === 'concluido');
  if (ui.taskOwner) list = list.filter((t) => t.owner === ui.taskOwner);
  if (ui.taskClinic) list = list.filter((t) => t.clinicId === ui.taskClinic);
  if (ui.taskStatus) list = list.filter((t) => t.status === ui.taskStatus);
  if (ui.taskQuery) { const q = ui.taskQuery.toLowerCase(); list = list.filter((t) => t.title.toLowerCase().includes(q)); }
  list.sort((a, b) => (f === 'concluidas' ? (b.doneAt || '').localeCompare(a.doneAt || '') : a.due.localeCompare(b.due)));
  const filters = [['hoje', 'Hoje'], ['semana', 'Esta semana'], ['atrasadas', 'Atrasadas'], ['abertas', 'Todas abertas'], ['concluidas', 'Concluídas']];
  // agrupamento por cliente
  const groups = {};
  list.slice(0, 300).forEach((t) => (groups[t.clinicId] = groups[t.clinicId] || []).push(t));
  view().innerHTML = `
    <div class="seg wrap">${filters.map(([k, l]) => `<button aria-selected="${f === k}" data-act="tf" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="filters">
      <input type="search" placeholder="Buscar tarefa…" value="${esc(ui.taskQuery)}" data-act="tq" aria-label="Buscar tarefa">
      <select data-act="towner" aria-label="Responsável"><option value="">Todos os responsáveis</option>${optS(OWNERS, ui.taskOwner)}</select>
      <select data-act="tclinic" aria-label="Clínica"><option value="">Todas as clínicas</option>${S.clinics.map((c) => `<option value="${c.id}"${c.id === ui.taskClinic ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select data-act="tstatus" aria-label="Status"><option value="">Qualquer status</option>${opt(TASK_STATUS, ui.taskStatus)}</select>
      <button class="btn sm" data-act="newTask">+ Tarefa</button>
    </div>
    <div class="bulk" hidden><span></span><button class="btn sm" data-act="bulkDone">Concluir selecionadas</button><select data-act="bulkOwner"><option value="">Atribuir a…</option>${optS(OWNERS)}</select></div>
    ${list.length ? Object.entries(groups).map(([cid, ts]) => `<section class="card"><header><h3>${esc(clinicById(cid).name)}${demoBadge(clinicById(cid))}</h3><span class="muted">${ts.length}</span></header>
      <ul class="tlist sel">${ts.map((t) => `<li class="sel-wrap"><input type="checkbox" class="bsel" value="${t.id}" aria-label="Selecionar ${esc(t.title)}">${taskRow(t).replace(/^<li[^>]*>|<\/li>$/g, '')}</li>`).join('')}</ul></section>`).join('') + (list.length > 300 ? '<p class="hint">Mostrando as 300 primeiras. Use os filtros.</p>' : '') : empty('Nenhuma tarefa com esses filtros.')}`;
};

// ---------- Calendário ----------
VIEWS.calendario = () => {
  const today = todayStr();
  const base = ui.calMonth || today.slice(0, 7);
  const [y, mo] = base.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const startPad = (first.getDay() + 6) % 7; // segunda primeiro
  const days = new Date(y, mo, 0).getDate();
  const tasks = S.tasks.filter((t) => t.due && t.due.startsWith(base) && clinicById(t.clinicId));
  const byDay = {}; tasks.forEach((t) => (byDay[t.due] = byDay[t.due] || []).push(t));
  const sel = ui.calDay && ui.calDay.startsWith(base) ? ui.calDay : today.startsWith(base) ? today : base + '-01';
  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="cd pad"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${base}-${String(d).padStart(2, '0')}`; const l = byDay[ds] || [];
    const meet = l.filter((t) => t.meeting).length; const late = l.filter((t) => taskOverdue(t)).length;
    cells += `<button class="cd ${ds === today ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-act="calDay" data-d="${ds}" aria-label="${fmtDate(ds)}: ${l.length} itens">
      <span class="dn">${d}</span>${l.length ? `<span class="cd-c">${meet ? `<i class="m">${meet} reun.</i>` : ''}<i>${l.length - meet} tarefa${l.length - meet === 1 ? '' : 's'}</i>${late ? '<i class="late">!</i>' : ''}</span>` : ''}</button>`;
  }
  const monthName = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const selList = (byDay[sel] || []).sort((a, b) => b.meeting - a.meeting);
  view().innerHTML = `
    <div class="cal-h"><button class="btn sm" data-act="calNav" data-d="-1" aria-label="Mês anterior">←</button><h2>${monthName}</h2><button class="btn sm" data-act="calNav" data-d="1" aria-label="Próximo mês">→</button>
      <button class="btn sm ghost" data-act="calNav" data-d="0">Hoje</button></div>
    <div class="cal-wrap"><div class="cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => `<div class="cw">${d}</div>`).join('')}${cells}</div>
    <section class="card"><header><h3>${fmtDate(sel, { weekday: 'long', day: '2-digit', month: 'long' })}</h3></header>
      ${selList.length ? `<ul class="tlist">${selList.map(taskRow).join('')}</ul>` : empty('Nada neste dia.')}
      <p class="hint">Calendário interno do app. Integração com Google Agenda e lembretes por e-mail ainda não estão ativos.</p></section></div>`;
};

// ---------- Criativos ----------
VIEWS.criativos = () => {
  const cl = journeyClinics();
  if (!cl.length) { view().innerHTML = empty('Inicie a jornada de uma clínica para gerar os slots de criativos.'); return; }
  const c = clinicById(ui.crClinic) || cl[0]; ui.crClinic = c.id;
  const cur = Math.min(12, Math.max(1, currentMonth(c)));
  const m = ui.crMonth ? +ui.crMonth : cur;
  const list = S.creatives.filter((x) => x.clinicId === c.id && x.month === m).sort((a, b) => a.slot - b.slot);
  const used = list.filter((x) => x.status !== 'nao_necessario').length;
  view().innerHTML = `
    <div class="filters">
      <select data-act="crClinic" aria-label="Clínica">${cl.map((x) => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select data-act="crMonth" aria-label="Mês">${MONTHS.map((x) => `<option value="${x.n}"${x.n === m ? ' selected' : ''}>Mês ${x.n}${x.n === cur ? ' (atual)' : ''}</option>`).join('')}</select>
    </div>
    <div class="notice">Até <b>${CREATIVES_PER_MONTH} criativos/mês</b> — é um teto, não obrigação. Marque “Não necessário” quando uma peça boa continuar rodando. Limite de revisões: ${S.settings.reviewLimit} por peça.</div>
    <div class="cr-count"><b>${used}</b> de ${CREATIVES_PER_MONTH} em uso no mês ${m} · ${list.filter((x) => x.type === 'video' && x.status !== 'nao_necessario').length} vídeo(s) · ${list.filter((x) => x.type === 'imagem' && x.status !== 'nao_necessario').length} imagem(ns)</div>
    <div class="crgrid">${list.map((x) => `<article class="crc st-${x.status}">
      <header><b>#${x.slot}</b><select data-act="crf" data-id="${x.id}" data-f="type" aria-label="Tipo">${opt([['video', 'Vídeo curto'], ['imagem', 'Imagem']], x.type)}</select></header>
      <input data-act="crf" data-id="${x.id}" data-f="title" placeholder="Título / ideia" value="${esc(x.title)}" aria-label="Título">
      <input data-act="crf" data-id="${x.id}" data-f="procedure" placeholder="Procedimento" value="${esc(x.procedure)}" aria-label="Procedimento">
      <select data-act="crf" data-id="${x.id}" data-f="status" aria-label="Status">${opt(CREATIVE_STATUS, x.status)}</select>
      <div class="cr-rev"><span>Revisões: <b>${x.reviews}</b>/${S.settings.reviewLimit}</span><button class="btn sm ghost" data-act="crRev" data-id="${x.id}">+1 revisão</button></div>
      <textarea data-act="crf" data-id="${x.id}" data-f="notes" placeholder="Roteiro, orientação de gravação, link do arquivo…" rows="3" aria-label="Notas">${esc(x.notes)}</textarea>
    </article>`).join('')}</div>
    <section class="card"><header><h3>Campanhas e experimentos</h3><button class="btn sm" data-act="newCamp" data-c="${c.id}">+ Registro</button></header>
      ${(c.campaigns || []).length ? `<table class="tbl"><thead><tr><th>Data</th><th>Campanha / hipótese</th><th>Público · Oferta</th><th>Orçamento</th><th>Decisão</th></tr></thead><tbody>${c.campaigns.map((k) => `<tr><td>${fmtShort(k.date)}</td><td><b>${esc(k.name)}</b><br><small>${esc(k.hyp)}</small></td><td>${esc(k.audience)} · ${esc(k.offer)}</td><td>${money(k.budget)}</td><td>${esc(k.decision)}</td></tr>`).join('')}</tbody></table>` : empty('Sem registros. Use para documentar público, criativo, oferta, orçamento, hipóteses e decisões.')}
      <p class="hint">Integração Meta Ads não está ativa — registros manuais.</p></section>`;
};

// ---------- Relatório (imprimir/PDF) ----------
VIEWS.relatorio = () => {
  const c = clinicById(route.params[0]); const n = +route.params[1];
  if (!c || !c.journey) { view().innerHTML = empty('Relatório indisponível.'); return; }
  const md = monthData(c, n);
  const done = md.tasks.filter((t) => t.status === 'concluido'); const pend = md.tasks.filter((t) => t.status !== 'concluido');
  const next = n < 12 ? monthData(c, n + 1) : null;
  const approved = (c.reports || {})[n];
  view().innerHTML = `
    <div class="noprint page-h"><a class="back" href="#/clinica/${c.id}">← ${esc(c.name)}</a>
      <div class="btns"><label class="chkl"><input type="checkbox" data-act="approveReport" data-c="${c.id}" data-n="${n}" ${approved ? 'checked' : ''}> Revisado e aprovado por Tiago</label>
      <button class="btn primary" data-act="print">Salvar PDF / Imprimir</button></div></div>
    <article class="report">
      <div class="r-band"><img class="r-logo" src="icons/logo-white.png" alt="ROITY"><div><b>Relatório mensal — Mês ${n}</b><small>${esc(md.title).toUpperCase()}</small></div></div>
      <div class="r-red"></div>
      <div class="r-body">
        <div class="r-eyebrow">RELATÓRIO MENSAL · ${fmtDate(monthStart(c, n), { month: 'long', year: 'numeric' }).toUpperCase()}</div>
        <h1>${esc(c.name)}</h1>
        <p class="${approved ? 'r-ok' : 'draft'}">${approved ? `Revisado e aprovado por ${esc(approved.who)} em ${fmtDate(approved.at.slice(0, 10))}` : 'RASCUNHO — aguardando revisão de Tiago antes do envio'}</p>
        <div class="r-stats"><div class="hero"><span>ENTREGAS CONCLUÍDAS</span><b>${done.length}/${md.tasks.length}</b></div><div><span>PERÍODO</span><b>${fmtShort(monthStart(c, n))} – ${fmtShort(monthEnd(c, n))}</b></div><div><span>MÊS DA JORNADA</span><b>${n} de 12</b></div></div>
        <h2><span class="r-badge">01</span>Foco do mês</h2><p>${esc(md.desc)}</p>
        <h2><span class="r-badge">02</span>O que entregamos</h2><ol>${done.map((t) => `<li><b>${esc(clientTitle(t.title))}</b>${t.evidence ? ` — ${esc(t.evidence)}` : ''}</li>`).join('') || '<li>—</li>'}</ol>
        ${pend.length ? `<div class="r-alert"><b>PENDÊNCIAS</b><ul>${pend.map((t) => `<li>${esc(clientTitle(t.title))} <small>(${t.owner === 'Clínica' ? 'depende da clínica' : statusName(t.status)})</small></li>`).join('')}</ul></div>` : ''}
        <h2><span class="r-badge">03</span>Próximos passos</h2>
        ${next ? `<p><b>Mês ${n + 1}: ${esc(next.title)}</b></p><ol>${next.novo.map((t) => `<li>${esc(clientTitle(t.title))}</li>`).join('')}</ol>` : '<p>Plano do próximo ciclo e proposta de renovação.</p>'}
        <footer class="r-foot"><span><b>${esc(c.name).toUpperCase()}</b> · RELATÓRIO MENSAL</span><span>ROITY · MÉTODO MBCR</span></footer>
      </div>
    </article>`;
};

// ---------- Apresentar ao cliente (modo venda) ----------
// títulos sem jargão interno para o cliente
const clientTitle = (t) => t.replace(/\s*\((NÃO ativar[^)]*|revisão humana\/jurídica|com consentimento|referência: até 10 min|respeitando indicação clínica)\)/i, '').replace(' — registrar aprovação', '').replace('CRM operacional: todo lead com status, responsável e resultado', 'Organização de todos os contatos');
const PILLAR_DESC = {
  M: 'Anúncios, ofertas e captação de novos pacientes.',
  B: 'Posicionamento, Instagram, conteúdo e criativos.',
  C: 'Atendimento, treinamento comercial e fechamento.',
  R: 'Follow-up, reativação, retorno e indicações.',
};
const MONTHLY = [
  ['Planejamento e gestão de marketing', 'Estratégia do mês definida e acompanhada.'],
  ['Campanhas Meta Ads', 'Público, criativos, oferta e orçamento otimizados.'],
  ['Até 6 criativos por mês', 'Vídeos curtos e imagens com roteiro, edição e identidade visual.'],
  ['Calendário editorial', 'Temas e direcionamento de conteúdo do mês.'],
  ['2 reuniões de 1 hora', 'Estratégia e resultados + treinamento comercial.'],
  ['Atendimento 24AGÁ', 'Pré-atendimento, qualificação e follow-up 24 horas. Fechamento com sua equipe.'],
  ['Treinamento comercial', 'Roteiros, materiais e propostas de atendimento.'],
  ['Relatório mensal', 'Ações, investimento, resultados e próximos passos.'],
];
VIEWS.apresentar = () => {
  document.body.classList.add('present');
  const c = clinicById(ui.presClinic);
  const n = ui.presMonth || 1;
  view().innerHTML = `
    <div class="pres-bar noprint">
      <select data-act="presClinic" aria-label="Preparar para">
        <option value="">Apresentação geral</option>${S.clinics.map((x) => `<option value="${x.id}"${c && x.id === c.id ? ' selected' : ''}>Para: ${esc(x.name)}</option>`).join('')}
      </select>
      <span class="btns" style="margin:0">${c ? `<a class="btn sm" href="#/proposta/${c.id}">Gerar proposta</a>` : ''}<button class="theme-btn" data-act="themeToggle" aria-label="Alternar modo claro/escuro">${isDark() ? '☀' : '☾'}</button><a class="btn sm" href="#/visao">Sair da apresentação</a></span>
    </div>
    <section class="pres-hero">
      <img class="pres-logo" src="icons/logo-white.png" alt="ROITY"><div class="pres-wsub">Assessoria Empresarial · Método MBCR</div>
      <h1>${c ? `Plano de crescimento para<br><em>${esc(c.name)}</em>` : 'Seus próximos 12 meses<br><em>de crescimento</em>'}</h1>
      <p>Nós assumimos o crescimento comercial da sua clínica com estratégia, processo e atendimento 24 horas.</p>
      <div class="pres-pillars">${Object.values(PILLARS).map((p) => `<div style="--pc:${p.color}"><b>${p.name[0]}</b><span>${p.name}</span><small>${PILLAR_DESC[p.key]}</small></div>`).join('')}</div>
    </section>
    <section class="pres-sec">
      <h2>O mapa da jornada</h2><p class="pres-sub">Toque em um mês para ver o que acontece nele.</p>
      <div id="presMap" class="pres-map"></div>
    </section>
    <section class="pres-sec" id="presMonthSec">
      <div id="presMonth"></div>
    </section>
    <section class="pres-sec">
      <h2>Todo mês, sem parar</h2><p class="pres-sub">Além da novidade de cada mês, estas entregas continuam sempre.</p>
      <div class="pres-monthly">${MONTHLY.map(([t, d], i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><b>${t}</b><small>${d}</small></div>`).join('')}</div>
    </section>
    <section class="pres-sec pres-end">
      <h2>Como funciona a parceria</h2>
      <ul class="pres-terms">
        <li><b>12 meses</b> de jornada, com o primeiro ciclo de 6 meses para implantação e avaliação.</li>
        <li><b>Metas individuais</b> definidas no diagnóstico da sua clínica.</li>
        <li><b>Você vê tudo:</b> reuniões quinzenais e relatório todo mês.</li>
        <li><b>Sua equipe fecha:</b> a 24AGÁ atende e qualifica; a confirmação e o fechamento são sempre humanos.</li>
      </ul>
    </section>`;
  if (mm) mm.destroy();
  mm = new MindMap($('#presMap'), {
    clinic: null, present: true, titleFor: clientTitle, getMonthData: (k) => monthData(null, k),
    onMonth: (k) => { ui.presMonth = k; renderPresMonth(); $('#presMonthSec').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    onTask: () => {}, onTemplateItem: () => {},
  });
  renderPresMonth();
};
function renderPresMonth() {
  const n = ui.presMonth || 1; const md = monthData(null, n); const c = clinicById(ui.presClinic);
  const p0 = PILLARS[md.pillars[0]].color;
  const range = c && c.startDate ? `${fmtDate(monthStart(c, n), { month: 'long', year: 'numeric' })}` : '';
  $('#presMonth').innerHTML = `
    <div class="pm-nav">
      <button class="btn sm" data-act="presGo" data-n="${n - 1}" ${n === 1 ? 'disabled' : ''} aria-label="Mês anterior">←</button>
      <div class="pm-dots">${MONTHS.map((m) => `<button class="${m.n === n ? 'on' : ''}" style="--pc:${PILLARS[m.pillars[0]].color}" data-act="presGo" data-n="${m.n}" aria-label="Mês ${m.n}">${m.n}</button>`).join('')}</div>
      <button class="btn sm" data-act="presGo" data-n="${n + 1}" ${n === 12 ? 'disabled' : ''} aria-label="Próximo mês">→</button>
    </div>
    <article class="pm-card" style="--pc:${p0}">
      <header><span class="pm-num">${n}</span><div><small>MÊS ${n}${range ? ' · ' + range : ''}</small><h2>${esc(md.title)}</h2>
        <div class="pm-tags">${md.pillars.map(pillarTag).join('')}</div></div></header>
      <p class="pm-desc">${esc(md.desc)}</p>
      <div class="pm-cols">
        <div><h4>O que fazemos neste mês</h4><ol>${md.novo.map((t) => `<li><b>${esc(clientTitle(t.title))}</b><small>${esc(clientText(t.title))}</small></li>`).join('')}</ol></div>
        <div><h4>O que você recebe</h4><ul class="pm-out">${md.outputs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
          <div class="pm-plus">+ continua: até 6 criativos, 2 reuniões, Meta Ads, 24AGÁ e relatório.</div></div>
      </div>
    </article>`;
}

// ---------- Proposta comercial Roity + 24AGÁ ----------
// Não mostra o ciclo de 12 meses em detalhe (o método fica protegido).
const SCOPE = [
  ['Planejamento estratégico e gestão de marketing', ['Diagnóstico inicial da clínica, posicionamento e ofertas', 'Plano de ação mensal com metas definidas junto com você', 'Coordenação de todas as frentes em um só lugar']],
  ['Gestão de tráfego pago (Meta Ads)', ['Criação, configuração e gestão das campanhas no Instagram e Facebook', 'Otimização contínua de público, criativos, oferta e orçamento', 'Acompanhamento do custo por contato e por paciente']],
  ['Até 6 criativos por mês', ['Vídeos curtos e imagens para anúncios e perfil', 'Roteiros por procedimento e orientação de gravação', 'Edição dos vídeos e artes com a identidade da clínica (a clínica grava, a Roity roteiriza e edita)']],
  ['Calendário editorial', ['Temas e datas de conteúdo do mês', 'Direcionamento do que postar e quando']],
  ['Atendimento 24 horas com a 24AGÁ', ['Implantação e operação dos fluxos de atendimento', 'Pré-atendimento, qualificação, follow-up, reativação e pós-atendimento', 'Encaminhamento para a sua equipe confirmar e fechar']],
  ['Treinamento comercial', ['Treinamento da recepção e da equipe: abordagem, objeções e fechamento', 'Roteiros de conversa, mensagens prontas, materiais e modelos de proposta']],
  ['Follow-up, reativação e retenção', ['Campanhas para recuperar quem não fechou', 'Reativação de pacientes antigos e lembretes de retorno', 'Sempre com consentimento e opção de sair']],
  ['Duas reuniões por mês', ['1 hora cada, quinzenais, com pauta e ata', 'Estratégia e resultados + treinamento e conversão']],
  ['Relatório mensal', ['Ações realizadas, investimento, contatos, agendamentos e pacientes', 'Comparação com o mês anterior e próximos passos']],
  ['Suporte', ['Orientação e suporte em horário comercial, pelo canal combinado']],
];
const NOT_INCLUDED = ['Verba de anúncios (paga direto à plataforma)', 'Google Ads (disponível como plano adicional)', 'Filmagem presencial', 'Gestão ilimitada de postagens'];
const REF_VALUES = [
  ['Estratégia e posicionamento', 750], ['Campanhas Meta', 1200], ['Criativos e roteiros', 900],
  ['24AGÁ (atendimento 24 horas)', 450], ['Treinamento e retenção', 650], ['Duas reuniões e relatório', 550],
];
const PROP_FIELDS = ['title', 'responsible', 'date', 'validUntil', 'startDate', 'objective', 'difficulty', 'procedure', 'recommendation', 'media', 'price', 'setupFee', 'setupWaived', 'setupReason', 'showRef', 'status'];
function newProposal(c) {
  const today = todayStr();
  return { id: uid(), title: 'Proposta', responsible: c.contact || '', date: today, validUntil: addDays(today, 10), startDate: c.startDate && c.startDate >= today ? c.startDate : addDays(today, 7),
    objective: '', difficulty: '', procedure: '', recommendation: '', media: c.mediaBudget ?? null, price: c.price ?? 2500, setupFee: c.setupFee ?? 1500,
    setupWaived: !!c.setupWaived, setupReason: c.setupReason || '', showRef: true, status: 'rascunho', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
function propTotals(p) {
  const price = +p.price || 0; const setup = p.setupWaived ? 0 : (+p.setupFee || 0); const media = p.media == null || p.media === '' ? null : +p.media;
  const roity1 = price + setup;
  return { price, setup, media, roity1, plat: media, first: roity1 + (media || 0), roityN: price, next: price + (media || 0) };
}
const blank = (v, ph) => (v && String(v).trim() ? esc(v) : `<span class="ph">[${ph}]</span>`);
function proposalDoc(c, p) {
  const t = propTotals(p); const refSum = REF_VALUES.reduce((a, r) => a + r[1], 0);
  const mediaTxt = t.media == null ? 'definida na reunião' : money(t.media);
  return `
    <article class="report proposal">
      <div class="r-band"><img class="r-logo" src="icons/logo-white.png" alt="ROITY"><div><b>Proposta Comercial</b><small>ROITY + 24AGÁ</small></div></div>
      <div class="r-red"></div>
      <div class="r-body">
        <div class="r-eyebrow">PROPOSTA COMERCIAL · ${fmtDate(p.date, { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()}</div>
        <h1 class="p-title">Proposta para<br><em>${esc(c.name)}</em></h1>
        ${p.responsible ? `<p class="p-to">A/C <b>${esc(p.responsible)}</b></p>` : ''}
        <div class="r-stats"><div class="hero"><span>MENSALIDADE</span><b>${money(t.price)}</b></div><div><span>INÍCIO PREVISTO</span><b>${fmtDate(p.startDate)}</b></div><div><span>VÁLIDA ATÉ</span><b>${fmtDate(p.validUntil)}</b></div></div>

        <h2><span class="r-badge">01</span>O que entendemos</h2>
        <p>Na nossa reunião, você me contou que a prioridade da clínica é <b>${blank(p.objective, 'objetivo da clínica')}</b> e a principal dificuldade hoje é <b>${blank(p.difficulty, 'principal dificuldade')}</b>.</p>
        <p>A Roity começa por <b>${blank(p.procedure, 'procedimento prioritário')}</b>, com foco em <b>${blank(p.recommendation, 'recomendação da Roity')}</b>.</p>

        <h2><span class="r-badge">02</span>O que está incluído</h2>
        <p>A mensalidade reúne <b>estratégia, execução e tecnologia</b> em um só lugar. O método MBCR (Marketing, Branding, Conversão e Retenção) já está pronto e é aplicado mês a mês pela Roity na sua clínica.</p>
        <div class="p-high"><div><b>6</b><span>criativos por mês</span></div><div><b>2</b><span>reuniões por mês</span></div><div><b>24h</b><span>atendimento com a 24AGÁ</span></div><div><b>1</b><span>relatório por mês</span></div></div>
        <h3 class="p-sub">Escopo completo — todo mês</h3>
        <div class="p-scope">${SCOPE.map(([t, items], i) => `<div><small>${String(i + 1).padStart(2, '0')}</small><b>${t}</b><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>
        <p class="p-notinc"><b>Não incluso:</b> ${NOT_INCLUDED.join(' · ')}.</p>
        ${p.showRef ? `<table class="tbl p-inv p-ref"><thead><tr><th>Valores de referência das entregas</th><th>R$/mês</th></tr></thead><tbody>
          ${REF_VALUES.map(([a, v]) => `<tr><td>${a}</td><td>${money(v)}</td></tr>`).join('')}
          <tr class="sub"><td>Referência das entregas</td><td><s>${money(refSum)}</s></td></tr>
          <tr class="tot"><td>Mensalidade do pacote Roity</td><td>${money(t.price)}</td></tr></tbody></table>` : ''}

        <h2><span class="r-badge">03</span>Implantação da 24AGÁ</h2>
        <p>Configuramos as informações da clínica, os serviços, as perguntas frequentes e as mensagens. Testamos o fluxo completo antes de ativar.</p>
        <div class="p-split"><div><b>A 24AGÁ faz</b><span>Atende 24 horas, qualifica, faz follow-up e encaminha para a sua equipe.</span></div><div><b>Sua equipe faz</b><span>Confirma horários, fecha as vendas e registra os resultados.</span></div></div>

        <h2><span class="r-badge">04</span>Por que a Roity</h2>
        <div class="p-cmp">
          <div><small>EQUIPE PRÓPRIA</small><p>Some as horas de cada função e o custo das ferramentas: estrategista, gestor de tráfego, editor, atendimento e treinamento.</p></div>
          <div><small>OUTRA EMPRESA</small><p>Confira o escopo e a operação: muitas entregam só anúncios ou só conteúdo, sem atendimento e sem treinamento.</p></div>
          <div class="win"><small>ROITY</small><p>Tudo sob <b>uma coordenação</b>: estratégia, anúncios, criativos, 24AGÁ e treinamento, com <b>duas reuniões por mês</b> e acompanhamento.</p></div>
        </div>

        <h2><span class="r-badge">05</span>Investimento</h2>
        <table class="tbl p-inv"><tbody>
          <tr><td>Mensalidade Roity</td><td><b>${money(t.price)}/mês</b></td></tr>
          <tr><td>Implantação (pagamento único)</td><td><b>${p.setupWaived ? `<s>${money(+p.setupFee || 0)}</s> Isenta` : money(t.setup)}</b>${p.setupWaived && p.setupReason ? `<br><small>${esc(p.setupReason)}</small>` : ''}</td></tr>
          <tr><td>Verba de anúncios (paga direto à plataforma)</td><td><b>${t.media == null ? 'Definida na reunião' : money(t.media) + '/mês'}</b></td></tr>
        </tbody></table>
        <div class="p-totals">
          <div><small>1º MÊS</small><b>${money(t.first)}</b><span>Roity: ${money(t.roity1)}</span><span>Plataforma: ${mediaTxt}</span></div>
          <div><small>MESES SEGUINTES</small><b>${money(t.next)}</b><span>Roity: ${money(t.roityN)}</span><span>Plataforma: ${mediaTxt}</span></div>
        </div>
        ${t.media == null ? '<p class="hint">Os totais acima não incluem a verba de anúncios, que será definida na reunião.</p>' : ''}
        <p class="hint">A verba de anúncios é investida diretamente na plataforma (Meta), em nome da clínica, e não é receita da Roity.</p>

        <div class="p-valid">Se estiver de acordo com o escopo e investimento, confirme com a Roity para receber o contrato e combinar a reunião de implantação.<br><small>Proposta válida até ${fmtDate(p.validUntil)}.</small></div>
        <footer class="r-foot"><span><b>${esc(c.name).toUpperCase()}</b> · PROPOSTA COMERCIAL</span><span>ROITY + 24AGÁ</span></footer>
      </div>
    </article>`;
}
function propFileName(c, p) { return `Proposta Roity - ${c.name} - ${fmtDate(p.date).replace(/\//g, '-')}`; }

VIEWS.proposta = () => {
  const c = clinicById(route.params[0]);
  if (!c) { view().innerHTML = empty('Clínica não encontrada.'); return; }
  c.proposals = c.proposals || [];
  const p = route.params[1] ? c.proposals.find((x) => x.id === route.params[1]) : null;
  if (!p) {
    const list = [...c.proposals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    view().innerHTML = `
      <div class="page-h"><a class="back" href="#/clinica/${c.id}">← ${esc(c.name)}</a><button class="btn primary" data-act="propNew" data-c="${c.id}">+ Nova proposta</button></div>
      <section class="card"><header><h3>Propostas de ${esc(c.name)}</h3></header>
        ${list.length ? `<ul class="tlist">${list.map((x) => { const t = propTotals(x); return `<li class="trow"><a class="trow-b" href="#/proposta/${c.id}/${x.id}">
          <span class="trow-t">${esc(x.title || 'Proposta')} · ${fmtDate(x.date)}</span><span class="trow-s">${x.status === 'enviada' ? 'Enviada' : 'Rascunho'} · 1º mês ${money(t.first)} · válida até ${fmtDate(x.validUntil)}</span></a>
          <button class="btn sm" data-act="propDup" data-c="${c.id}" data-id="${x.id}">Duplicar</button></li>`; }).join('')}</ul>` : empty('Nenhuma proposta ainda. Crie a primeira.')}
      </section>`;
    return;
  }
  const f = (k, label, type = 'text', extra = '') => `<label><span>${label}</span><input type="${type}" data-pf="${k}" value="${esc(p[k] ?? '')}" ${extra}></label>`;
  const ta = (k, label, ph) => `<label class="full"><span>${label}</span><textarea data-pf="${k}" rows="2" placeholder="${ph}">${esc(p[k] || '')}</textarea></label>`;
  view().innerHTML = `
    <div class="noprint page-h"><a class="back" href="#/proposta/${c.id}">← Propostas de ${esc(c.name)}</a>
      <div class="btns"><button class="btn sm" data-act="propDup" data-c="${c.id}" data-id="${p.id}">Duplicar</button><button class="btn sm danger" data-act="propDel" data-c="${c.id}" data-id="${p.id}">Excluir</button><button class="btn primary" data-act="propPrint" data-c="${c.id}" data-id="${p.id}">Gerar PDF</button></div></div>
    <div class="seg prop-tabs noprint"><button aria-selected="${ui.propTab !== 'previa'}" data-act="propTab" data-t="editar">Editar</button><button aria-selected="${ui.propTab === 'previa'}" data-act="propTab" data-t="previa">Prévia</button></div>
    <div class="prop-wrap tab-${ui.propTab === 'previa' ? 'previa' : 'editar'}">
      <form class="mform prop-form noprint card" onsubmit="return false">
        <h3 class="full">Dados da proposta <small class="muted" id="propSaved">salvo automaticamente</small></h3>
        ${f('title', 'Nome do rascunho')}
        <label><span>Situação</span><select data-pf="status">${opt([['rascunho', 'Rascunho'], ['enviada', 'Enviada']], p.status)}</select></label>
        ${f('responsible', 'Responsável na clínica')}
        ${f('date', 'Data', 'date')}
        ${f('validUntil', 'Validade', 'date')}
        ${f('startDate', 'Início previsto', 'date')}
        ${ta('objective', 'Objetivo da clínica (prioridade)', 'Ex.: aumentar pacientes de harmonização facial')}
        ${ta('difficulty', 'Principal dificuldade', 'Ex.: muitos contatos e poucos fechamentos')}
        ${ta('procedure', 'Procedimento prioritário', 'Ex.: lentes de contato dental')}
        ${ta('recommendation', 'Recomendação da Roity (foco)', 'Ex.: campanhas para avaliação e treinamento da recepção')}
        ${f('media', 'Verba de anúncios/mês (R$) — vazio = definir na reunião', 'number', 'inputmode="decimal" min="0"')}
        ${f('price', 'Mensalidade (R$)', 'number', 'inputmode="decimal" min="0"')}
        ${f('setupFee', 'Implantação (R$)', 'number', 'inputmode="decimal" min="0"')}
        <label class="chkl"><input type="checkbox" data-pf="setupWaived" ${p.setupWaived ? 'checked' : ''}> Isentar implantação</label>
        ${f('setupReason', 'Motivo da isenção (aparece na proposta)')}
        <label class="chkl full"><input type="checkbox" data-pf="showRef" ${p.showRef ? 'checked' : ''}> Mostrar tabela de valores de referência</label>
        <div class="full prop-sum" id="propSum"></div>
      </form>
      <div class="prop-preview" id="propPreview">${proposalDoc(c, p)}</div>
    </div>`;
  renderPropSum(p);
};
function renderPropSum(p) {
  const t = propTotals(p); const el = $('#propSum'); if (!el) return;
  el.innerHTML = `<b>Conferência:</b> 1º mês ${money(t.first)} (Roity ${money(t.roity1)}${t.media != null ? ` + plataforma ${money(t.media)}` : ''}) · Seguintes ${money(t.next)} (Roity ${money(t.roityN)}${t.media != null ? ` + plataforma ${money(t.media)}` : ''})`;
}
function propUpdate(el) {
  const [, cid, pid] = route.params.length ? ['', route.params[0], route.params[1]] : [];
  const c = clinicById(cid); const p = c && (c.proposals || []).find((x) => x.id === pid); if (!p) return;
  const k = el.dataset.pf; let v = el.type === 'checkbox' ? el.checked : el.value;
  if (['media', 'price', 'setupFee'].includes(k)) v = v === '' ? null : Number(v);
  p[k] = v; p.updatedAt = new Date().toISOString(); save();
  $('#propPreview').innerHTML = proposalDoc(c, p); renderPropSum(p);
  const s = $('#propSaved'); if (s) { s.textContent = 'salvo ✓'; clearTimeout(s._t); s._t = setTimeout(() => (s.textContent = 'salvo automaticamente'), 1200); }
}

// ---------- Financeiro ----------
VIEWS.financeiro = () => {
  const act = S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage));
  const mrr = act.reduce((a, c) => a + (+c.price || 0), 0);
  const setup = S.clinics.filter((c) => !c.setupWaived && ['ativo', 'onboarding'].includes(c.stage)).reduce((a, c) => a + (+c.setupFee || 0), 0);
  const cap = capacity(); const hours = Object.values(cap.people).reduce((a, p) => a + p.need, 0);
  view().innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>MRR bruto contratado</span><b>${money(mrr)}</b><em>${act.length} clínica(s) ativa(s)/onboarding</em></div>
      <div class="kpi"><span>Anualizado (estável)</span><b>${money(mrr * 12)}</b><em>antes de custos, impostos e churn</em></div>
      <div class="kpi"><span>Meta</span><b>${money(S.settings.goalClinics * 2500)}</b><em>${S.settings.goalClinics} × R$ 2.500 — meta, não receita</em></div>
      <div class="kpi"><span>Implantações contratadas</span><b>${money(setup)}</b><em>não isentas</em></div>
      <div class="kpi"><span>Receita por hora estimada</span><b>${hours ? money(mrr / hours) : 'não informado'}</b><em>${hours.toFixed(0)}h/mês estimadas</em></div>
    </div>
    <div class="notice">Verba de mídia é dinheiro da clínica pago à plataforma — <b>não</b> entra no faturamento da Roity.</div>
    <section class="card"><header><h3>Contratos</h3></header><div class="tscroll"><table class="tbl"><thead><tr><th>Clínica</th><th>Etapa</th><th>Honorários</th><th>Implantação</th><th>Pagamento</th><th>Mídia (clínica)</th></tr></thead><tbody>
      ${S.clinics.map((c) => `<tr><td><a href="#/clinica/${c.id}">${esc(c.name)}</a>${demoBadge(c)}</td><td>${stageLabel(c.stage)}</td><td>${money(c.price)}</td><td>${c.setupWaived ? 'Isenta' : money(c.setupFee)}</td>
        <td><select data-act="pay" data-id="${c.id}" aria-label="Pagamento">${opt([['em_dia', 'Em dia'], ['pendente', 'Pendente'], ['atrasado', 'Atrasado'], ['na', 'Não se aplica']], c.payment)}</select></td><td>${money(c.mediaBudget)}</td></tr>`).join('')}
    </tbody></table></div><p class="hint">Contas a receber, recebimentos e custos detalhados ficam para a Fase 2.</p></section>`;
};

// ---------- Configurações ----------
VIEWS.config = () => {
  const st = S.settings;
  const used = new Blob([localStorage.getItem(STORE_KEY) || '']).size;
  view().innerHTML = `
    <div class="grid2">
      <section class="card"><header><h3>Quem está usando</h3></header>
        <div class="seg">${['Tiago', 'Micaela'].map((p) => `<button aria-selected="${S.me === p}" data-act="me" data-p="${p}">${p}</button>`).join('')}</div>
        <p class="hint">Usado no histórico (“quem mudou o quê”).</p>
        <h4>Tema</h4><div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => `<button aria-selected="${st.theme === k}" data-act="theme" data-t="${k}">${l}</button>`).join('')}</div>
      </section>
      <section class="card"><header><h3>Capacidade e metas</h3></header>
        <form class="mform" data-form="settings">
          <label><span>Meta de clínicas ativas</span><input type="number" name="goalClinics" value="${st.goalClinics}"></label>
          <label><span>Horas/dia — Tiago</span><input type="number" step="0.5" name="capT" value="${st.capacity.Tiago}"></label>
          <label><span>Horas/dia — Micaela</span><input type="number" step="0.5" name="capM" value="${st.capacity.Micaela}"></label>
          <label><span>Dias úteis/mês</span><input type="number" name="workDays" value="${st.workDays}"></label>
          <label><span>Horas por criativo</span><input type="number" step="0.05" name="hoursPerCreative" value="${st.hoursPerCreative}"></label>
          <label><span>Limite de revisões por criativo</span><input type="number" name="reviewLimit" value="${st.reviewLimit}"></label>
          <button class="btn primary">Salvar</button></form></section>
      <section class="card"><header><h3>Backup e exportação</h3></header>
        <p>${Sync.enabled() ? 'Seus dados ficam neste aparelho e na nuvem (sincronizados).' : 'Seus dados ficam salvos <b>neste aparelho</b>.'} (${(used / 1024).toFixed(0)} KB). Último backup: <b>${S.settings.lastBackup ? fmtDate(S.settings.lastBackup) : 'nunca'}</b>. Faça backup de vez em quando e para passar dados entre celular e computador.</p>
        <div class="btns"><button class="btn primary" data-act="exportJSON">Baixar backup (.json)</button>
        <label class="btn">Restaurar backup<input type="file" accept="application/json,.json" data-act="importJSON" hidden></label></div>
        <div class="btns"><button class="btn sm" data-act="csv" data-k="clinics">CSV clínicas</button><button class="btn sm" data-act="csv" data-k="tasks">CSV tarefas</button></div>
      </section>
      <section class="card full sync-card"><header><h3>☁ Sincronizar celular e computador</h3></header>
        ${Sync.enabled() ? `<p>Status: <b id="syncState">…</b></p>
          <p class="hint">Repositório privado: <b>${esc(Sync.cfg().repo)}</b>. Tudo que você muda aqui aparece nos outros aparelhos conectados em poucos segundos (ao abrir o app ou voltar para ele).</p>
          <div class="btns"><button class="btn primary" data-act="syncNow">Sincronizar agora</button><button class="btn danger" data-act="syncOff">Desconectar este aparelho</button></div>`
        : `<p>Hoje os dados ficam só neste aparelho. Conecte <b>uma vez em cada aparelho</b> para o PC e o celular mostrarem sempre a mesma coisa. Os dados ficam no seu repositório <b>privado</b> do GitHub (${esc(SYNC_DEFAULT.repo)}).</p>
          <ol class="steps">
            <li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Fine-grained token</a> (entre na sua conta se pedir).</li>
            <li><b>Token name:</b> Roity MBCR · <b>Expiration:</b> a maior disponível.</li>
            <li><b>Repository access:</b> <i>Only select repositories</i> → escolha <b>roity-mbcr-dados</b>.</li>
            <li><b>Permissions → Repository permissions → Contents:</b> <i>Read and write</i>.</li>
            <li>Toque em <b>Generate token</b>, copie e cole abaixo.</li>
          </ol>
          <form class="addrow" data-form="syncConnect"><input type="password" name="token" placeholder="Cole o token aqui (github_pat_…)" autocomplete="off" required aria-label="Token do GitHub"><button class="btn primary">Conectar</button></form>
          <p class="hint">Conecte primeiro no aparelho que tem os dados certos (ex.: o PC) e escolha enviar os dados dele. Depois conecte o celular e escolha usar os dados da nuvem. O token fica salvo só neste aparelho e não vai no backup.</p>`}
      </section>
      <section class="card"><header><h3>Dados</h3></header>
        <div class="btns"><button class="btn" data-act="clearDemo">Remover dados DEMO</button><button class="btn" data-act="addDemo">Recriar dados DEMO</button><button class="btn danger" data-act="wipe">Apagar tudo</button></div>
        <p class="hint">Versão 1.0 · funciona offline · instale pela opção “Adicionar à Tela de Início”.</p></section>
      <section class="card full"><header><h3>Histórico de atividade</h3></header><ul class="log">${S.log.slice(0, 60).map(logItem).join('') || empty('Vazio')}</ul></section>
    </div>`;
};

// ================= painel lateral =================
function openPanel(p) { ui.panel = p; renderPanel(); $('#panel').classList.add('open'); $('#scrim').hidden = false; setTimeout(() => { const f = $('#panel .pfocus'); f && f.focus({ preventScroll: true }); }, 50); }
function closePanel() { ui.panel = null; $('#panel').classList.remove('open'); $('#scrim').hidden = true; }
function renderPanel() {
  const p = ui.panel; const el = $('#panelBody');
  if (!p) return;
  if (p.type === 'task') {
    const t = taskById(p.id); if (!t) { closePanel(); return; }
    const c = clinicById(t.clinicId); const s = taskStatusLabel(t);
    el.innerHTML = `
      <div class="ph"><small>${c ? esc(c.name) : ''} · Mês ${t.month} · <b>Dia ${dayOf(t)}</b> · ${t.kind === 'novo' ? 'Nova implantação' : 'Rotina contínua'}</small>
        <textarea class="ptitle pfocus" data-tf="title" rows="2" aria-label="Título">${esc(t.title)}</textarea>
        <div>${pillarTag(t.pillar)} ${pill(s.k, s.l)} ${t.meeting ? '<span class="pill">Reunião 60 min</span>' : ''}</div></div>
      ${howTo(t.title) ? `<div class="howto"><b>O que fazer</b><p>${esc(howTo(t.title))}</p></div>` : ''}
      <button class="btn ${t.status === 'concluido' ? '' : 'primary'} block" data-act="done" data-id="${t.id}">${t.status === 'concluido' ? 'Reabrir tarefa' : '✓ Marcar como concluída'}</button>
      <div class="pgrid">
        <label><span>Status</span><select data-tf="status">${opt(TASK_STATUS, t.status)}</select></label>
        <label><span>Responsável</span><select data-tf="owner">${optS(OWNERS, t.owner)}</select></label>
        <label><span>Prazo</span><input type="date" data-tf="due" value="${t.due}"></label>
        <label><span>Prioridade</span><select data-tf="priority">${opt([['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], t.priority)}</select></label>
        <label><span>Pilar</span><select data-tf="pillar">${opt(Object.values(PILLARS).map((x) => [x.key, x.name]), t.pillar)}</select></label>
        <label><span>Horas estimadas</span><input type="number" step="0.25" data-tf="hours" value="${t.hours || 1}"></label>
      </div>
      <h4>Checklist ${t.checklist.length ? `<small>${t.checklist.filter((i) => i.done).length}/${t.checklist.length}</small>` : ''}</h4>
      <ul class="cl">${t.checklist.map((i, k) => `<li><label><input type="checkbox" data-act="chk" data-i="${k}" ${i.done ? 'checked' : ''}> <span>${esc(i.t)}</span></label><button class="x" data-act="chkDel" data-i="${k}" aria-label="Remover item">×</button></li>`).join('')}</ul>
      <form class="addrow" data-form="chkAdd"><input name="t" placeholder="Adicionar item…" aria-label="Novo item do checklist"><button class="btn sm">+</button></form>
      <label class="full"><span>Evidência (link, arquivo, resumo)</span><textarea data-tf="evidence" rows="2">${esc(t.evidence)}</textarea></label>
      <label class="full"><span>${t.meeting ? 'Pauta, ata, decisões e presença' : 'Observações / comentários'}</span><textarea data-tf="notes" rows="${t.meeting ? 6 : 3}">${esc(t.notes)}</textarea></label>
      <h4>Histórico</h4><ul class="log sm">${t.history.slice(0, 30).map(logItem).join('')}</ul>
      ${t.custom ? `<button class="btn danger sm" data-act="delTask" data-id="${t.id}">Excluir tarefa</button>` : ''}`;
  } else if (p.type === 'month') {
    const c = p.clinicId ? clinicById(p.clinicId) : null; const md = monthData(c, p.n);
    const crs = c ? S.creatives.filter((x) => x.clinicId === c.id && x.month === p.n) : [];
    el.innerHTML = `
      <div class="ph"><small>MÊS ${p.n}${c ? ' · ' + fmtDate(monthStart(c, p.n)) + ' – ' + fmtDate(monthEnd(c, p.n)) : ' · modelo'}</small>
        <h2 class="pfocus" tabindex="-1">${esc(md.title)}</h2><div>${md.pillars.map(pillarTag).join(' ')} ${md.state ? pill(md.state.k, md.state.l + ' · ' + Math.round(md.state.p * 100) + '%') : ''}</div>
        <p>${esc(md.desc)}</p></div>
      ${md.state ? `<div class="bar"><i style="width:${md.state.p * 100}%"></i></div>` : ''}
      <h4>Roteiro dia a dia</h4>
      ${c ? `<ul class="tlist">${md.tasks.map((t) => taskRow(t, { day: true, how: true })).join('')}</ul>`
        : `<ul class="tlist">${md.novo.map((t) => ({ ...t, kind: 'novo' })).concat(md.rotina.map((t) => ({ ...t, kind: 'rotina' }))).sort((a, b) => a.d - b.d || (a.kind === 'novo' ? -1 : 1)).map((t) => `<li class="trow"><div class="trow-b">
          <span class="trow-t"><span class="dayb">Dia ${t.d}</span>${esc(t.title)}</span>${howTo(t.title) ? `<span class="trow-h">${esc(howTo(t.title))}</span>` : ''}
          <span class="trow-s">${pillarTag(t.pillar)} ${t.kind === 'novo' ? 'Novo' : 'Rotina'} · ${esc(t.owner)}${t.c ? ' · ☑ ' + t.c.map(esc).join(', ') : ''}</span></div></li>`).join('')}</ul>
          <p class="hint">✎ Além disso: até ${CREATIVES_PER_MONTH} criativos no mês (vídeo/imagem).</p>`}
      ${c ? `<h4>Criativos do mês</h4><p>${crs.filter((x) => ['em_uso', 'aprovado'].includes(x.status)).length} aprovados/em uso · ${crs.filter((x) => x.status === 'nao_necessario').length} não necessários · ${crs.filter((x) => !['em_uso', 'aprovado', 'nao_necessario'].includes(x.status)).length} em produção
        <button class="btn sm" data-act="goCr" data-c="${c.id}" data-n="${p.n}">Abrir criativos</button></p>` : ''}
      <h4>Saídas verificáveis</h4><ul class="plain">${md.outputs.map((o) => `<li>◆ ${esc(o)}</li>`).join('')}</ul>
      ${c ? `<div class="btns"><button class="btn" data-act="newTask" data-c="${c.id}" data-n="${p.n}">+ Tarefa neste mês</button><a class="btn" href="#/relatorio/${c.id}/${p.n}">Relatório do mês</a></div>` : '<p class="hint">Este é o modelo. Cada clínica recebe uma cópia própria ao iniciar a jornada.</p>'}`;
  }
}

// ================= formulários (modal) =================
function modal(html) { const d = $('#modal'); $('#modalBody').innerHTML = html; d.showModal(); setTimeout(() => { const f = $('#modalBody input,#modalBody select'); f && f.focus(); }, 30); }
function closeModal() { $('#modal').close(); }
function clinicForm(c) {
  const isNew = !c; c = c || { segment: 'estetica', price: 2500, setupFee: 1500, mediaBudget: 3000, stage: 'onboarding', payment: 'em_dia', exclusivity: 'nao_solicitada', guarantee: 'em_definicao', startDate: todayStr() };
  modal(`<form data-form="clinic" data-id="${c.id || ''}" class="mform">
    <h2>${isNew ? 'Nova clínica' : 'Editar clínica'}</h2>
    <fieldset><legend>Clínica</legend>
      <label class="full"><span>Nome fantasia *</span><input name="name" required value="${esc(c.name || '')}"></label>
      <label><span>Segmento</span><select name="segment">${opt([['estetica', 'Estética'], ['odontologia', 'Odontologia']], c.segment)}</select></label>
      <label><span>Etapa</span><select name="stage">${opt(STAGES, c.stage)}</select></label>
      <label><span>Cidade</span><input name="city" value="${esc(c.city || '')}"></label>
      <label><span>UF</span><input name="uf" maxlength="2" value="${esc(c.uf || '')}"></label>
      <label><span>Contato</span><input name="contact" value="${esc(c.contact || '')}"></label>
      <label><span>Telefone</span><input name="phone" inputmode="tel" value="${esc(c.phone || '')}"></label>
      <label class="full"><span>Responsável humano pelos fechamentos</span><input name="humanResp" value="${esc(c.humanResp || '')}"></label>
    </fieldset>
    <fieldset><legend>Contrato</legend>
      <label><span>Início da jornada</span><input type="date" name="startDate" value="${c.startDate || todayStr()}"></label>
      <label><span>Honorários/mês (R$)</span><input type="number" name="price" value="${c.price ?? ''}"></label>
      <label><span>Faturamento base (R$)</span><input type="number" name="baseRevenue" value="${c.baseRevenue ?? ''}" placeholder="não informado"></label>
      <label><span>Mídia/mês da clínica (R$)</span><input type="number" name="mediaBudget" value="${c.mediaBudget ?? ''}"></label>
      <label><span>Implantação (R$)</span><input type="number" name="setupFee" value="${c.setupFee ?? ''}"></label>
      <label class="chkl"><input type="checkbox" name="setupWaived" ${c.setupWaived ? 'checked' : ''}> Implantação isenta</label>
      <label class="full"><span>Motivo da isenção</span><input name="setupReason" value="${esc(c.setupReason || '')}"></label>
      <label><span>Pagamento</span><select name="payment">${opt([['em_dia', 'Em dia'], ['pendente', 'Pendente'], ['atrasado', 'Atrasado'], ['na', 'Não se aplica']], c.payment)}</select></label>
    </fieldset>
    <fieldset><legend>Exclusividade e garantia</legend>
      <label class="full"><span>Território proposto (cidade, bairros, raio, CEPs)</span><input name="territory" value="${esc(c.territory || '')}"></label>
      <label><span>Exclusividade</span><select name="exclusivity">${opt([['nao_solicitada', 'Não solicitada'], ['em_analise', 'Em análise'], ['aprovada', 'Aprovada formalmente'], ['negada', 'Negada / renegociar']], c.exclusivity)}</select></label>
      <label><span>Garantia</span><select name="guarantee">${opt([['em_definicao', 'Em definição'], ['aguardando_juridico', 'Aguardando jurídico'], ['termos_assinados', 'Termos assinados'], ['em_avaliacao', 'Em avaliação humana'], ['avaliado', 'Avaliado manualmente']], c.guarantee)}</select></label>
      <label class="full"><span>Meta individual (definida no diagnóstico)</span><input name="goal" value="${esc(c.goal || '')}"></label>
      <label class="full"><span>Observações</span><textarea name="notes" rows="2">${esc(c.notes || '')}</textarea></label>
    </fieldset>
    ${isNew ? `<label class="chkl full"><input type="checkbox" name="start" checked> Começar jornada MBCR agora (gera tarefas, reuniões e criativos dos 12 meses)</label>` : ''}
    <div class="btns end">${!isNew ? `<button type="button" class="btn danger" data-act="delClinic" data-id="${c.id}">Excluir</button>` : ''}<button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn primary">Salvar</button></div>
  </form>`);
}
function taskForm(clinicId, month) {
  const cl = journeyClinics();
  if (!cl.length) { toast('Inicie a jornada de uma clínica primeiro'); return; }
  const c = clinicById(clinicId) || cl[0];
  modal(`<form data-form="task" class="mform"><h2>Nova tarefa</h2>
    <label class="full"><span>Título *</span><input name="title" required></label>
    <label><span>Clínica</span><select name="clinicId">${cl.map((x) => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label><span>Mês da jornada</span><select name="month">${MONTHS.map((m) => `<option value="${m.n}"${m.n === (month || Math.min(12, Math.max(1, currentMonth(c)))) ? ' selected' : ''}>Mês ${m.n}</option>`).join('')}</select></label>
    <label><span>Pilar</span><select name="pillar">${opt(Object.values(PILLARS).map((x) => [x.key, x.name]), 'M')}</select></label>
    <label><span>Responsável</span><select name="owner">${optS(OWNERS, S.me)}</select></label>
    <label><span>Prazo</span><input type="date" name="due" value="${todayStr()}"></label>
    <label><span>Tipo</span><select name="kind">${opt([['novo', 'Nova implantação'], ['rotina', 'Rotina']], 'novo')}</select></label>
    <label class="chkl"><input type="checkbox" name="meeting"> É reunião</label>
    <div class="btns end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn primary">Criar</button></div></form>`);
}
function campForm(cid) {
  modal(`<form data-form="camp" data-c="${cid}" class="mform"><h2>Registro de campanha / experimento</h2>
    <label class="full"><span>Campanha *</span><input name="name" required></label>
    <label class="full"><span>Hipótese</span><input name="hyp"></label>
    <label><span>Público</span><input name="audience"></label><label><span>Oferta</span><input name="offer"></label>
    <label><span>Orçamento (R$)</span><input type="number" name="budget"></label><label><span>Data</span><input type="date" name="date" value="${todayStr()}"></label>
    <label class="full"><span>Resultado / decisão</span><input name="decision"></label>
    <div class="btns end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
}

// ================= utilidades =================
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function toCSV(rows, cols) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + cols.join(';') + '\n' + rows.map((r) => cols.map((c) => q(r[c])).join(';')).join('\n');
}
function renderSyncBadge() {
  const b = document.getElementById('syncBadge'); if (!b) return;
  const map = { off: ['☁', 'Sincronizar', 'off'], ok: ['✓', 'Sincronizado', 'ok'], syncing: ['↻', 'Sincronizando…', 'busy'], offline: ['⚠', 'Offline', 'warn'], error: ['⚠', 'Erro na sincronização', 'err'], conflict: ['⚠', 'Conflito', 'warn'] };
  const [i, l, k] = map[Sync.state] || map.off;
  b.className = 'sync-b ' + k; b.innerHTML = `<span>${i}</span><em>${l}</em>`; b.title = Sync.msg || l;
  if (route.name === 'config') { const st = document.getElementById('syncState'); if (st) st.textContent = l + (Sync.msg ? ' — ' + Sync.msg : ''); }
}
function onRemoteApplied() {
  applyTheme();
  const busyForm = $('#modal').open || document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (!busyForm) { const y = $('.main').scrollTop; render(); $('.main').scrollTop = y; }
  toast('Dados atualizados de outro aparelho');
}
function isDark() { const t = S.settings.theme; return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); }
function applyTheme() {
  const t = S.settings.theme; const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = t;
  const b = document.getElementById('themeBtn'); if (b) { b.textContent = isDark() ? '☀' : '☾'; b.title = isDark() ? 'Modo claro' : 'Modo escuro'; }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#010103' : '#f3f5fb');
}

// ================= eventos =================
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const d = a.dataset; const act = d.act;
  const H = {
    done: () => toggleDone(d.id),
    task: () => openPanel({ type: 'task', id: d.id }),
    month: () => openPanel({ type: 'month', clinicId: d.c || null, n: +d.n }),
    mapMode: () => { ui.mapMode = d.m; render(); },
    clinicTab: () => { ui.clinicTab = d.t; render(); },
    newClinic: () => clinicForm(),
    editClinic: () => clinicForm(clinicById(d.id)),
    delClinic: () => { const c = clinicById(d.id); if (confirm(`Excluir “${c.name}” e todas as tarefas, criativos e métricas dela? Não dá para desfazer.`)) { deleteClinic(d.id); log(`Excluiu a clínica ${c.name}`); if ($('#modal').open) closeModal(); if (ui.mapClinic === d.id) ui.mapClinic = null; save(); toast('Clínica excluída'); if (location.hash === '#/clinicas') render(); else go('#/clinicas'); } },
    startJourney: () => { const c = clinicById(d.id); startJourney(c); if (c.stage !== 'ativo') c.stage = 'onboarding'; save(); render(); toast('Jornada criada: 12 meses de tarefas'); },
    openMap: () => { ui.mapClinic = d.id; ui.mapMode = 'mapa'; },
    closeModal: () => closeModal(),
    newTask: () => taskForm(d.c, d.n ? +d.n : null),
    delTask: () => { if (confirm('Excluir esta tarefa?')) { S.tasks = S.tasks.filter((t) => t.id !== d.id); closePanel(); rerender(); } },
    chkDel: () => { const t = taskById(ui.panel.id); t.checklist.splice(+d.i, 1); rerender(); },
    tf: () => { ui.taskFilter = d.f; if (route.name === 'tarefas') render(); },
    calDay: () => { ui.calDay = d.d; render(); },
    calNav: () => { if (+d.d === 0) { ui.calMonth = null; ui.calDay = null; } else { const b = (ui.calMonth || todayStr().slice(0, 7)) + '-01'; ui.calMonth = addMonths(b, +d.d).slice(0, 7); } render(); },
    crRev: () => { const x = S.creatives.find((y) => y.id === d.id); x.reviews++; if (x.reviews > S.settings.reviewLimit) toast('Acima do limite de revisões combinado'); rerender(); },
    presFor: () => { ui.presClinic = d.id; },
    propNew: () => { const c = clinicById(d.c); c.proposals = c.proposals || []; const p = newProposal(c); c.proposals.push(p); log(`Criou proposta para ${c.name}`, c.id); saveNow(); ui.propTab = 'editar'; go(`#/proposta/${c.id}/${p.id}`); },
    propDup: () => { const c = clinicById(d.c); const o = c.proposals.find((x) => x.id === d.id); const p = { ...JSON.parse(JSON.stringify(o)), id: uid(), title: (o.title || 'Proposta') + ' (cópia)', date: todayStr(), validUntil: addDays(todayStr(), 10), status: 'rascunho', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; c.proposals.push(p); log(`Duplicou proposta de ${c.name}`, c.id); saveNow(); toast('Proposta duplicada'); go(`#/proposta/${c.id}/${p.id}`); },
    propDel: () => { const c = clinicById(d.c); if (!confirm('Excluir esta proposta?')) return; c.proposals = c.proposals.filter((x) => x.id !== d.id); saveNow(); go(`#/proposta/${c.id}`); },
    propTab: () => { ui.propTab = d.t; $('.prop-wrap').className = 'prop-wrap tab-' + d.t; $$('.prop-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === d.t)); },
    propPrint: () => { const c = clinicById(d.c); const p = c.proposals.find((x) => x.id === d.id); const old = document.title; document.title = propFileName(c, p); const back = () => { document.title = old; removeEventListener('afterprint', back); }; addEventListener('afterprint', back); log(`Gerou PDF da proposta de ${c.name}`, c.id); save(); window.print(); setTimeout(back, 3000); },
    openToday: () => { ui.clinicTab = 'hoje'; ui.lastClinic = d.id; },
    goCr: () => { ui.crClinic = d.c; ui.crMonth = d.n; closePanel(); go('#/criativos'); },
    newCamp: () => campForm(d.c),
    res: () => { ui.resClinic = d.c; if (d.m) ui.resMonth = +d.m; },
    me: () => { S.me = d.p; save(); render(); toast(`Usando como ${d.p}`); },
    theme: () => { S.settings.theme = d.t; applyTheme(); save(); render(); },
    exportJSON: () => { S.settings.lastBackup = todayStr(); saveNow(); download(`roity-mbcr-backup-${todayStr()}.json`, JSON.stringify(S, null, 1), 'application/json'); toast('Backup baixado. Guarde no iCloud ou Drive.'); if (route.name === 'visao' || route.name === 'config') setTimeout(render, 300); },
    csv: () => {
      if (d.k === 'clinics') download('clinicas.csv', toCSV(S.clinics, ['name', 'segment', 'city', 'uf', 'stage', 'price', 'setupFee', 'setupWaived', 'mediaBudget', 'baseRevenue', 'startDate', 'payment', 'exclusivity', 'territory', 'demo']), 'text/csv');
      if (d.k === 'tasks') download('tarefas.csv', toCSV(S.tasks.map((t) => ({ ...t, clinica: clinicById(t.clinicId)?.name, statusLabel: statusName(t.status) })), ['clinica', 'month', 'kind', 'pillar', 'title', 'owner', 'due', 'statusLabel', 'doneAt', 'evidence']), 'text/csv');
    },
    clearDemo: () => { const ds = S.clinics.filter((c) => c.demo); if (!ds.length) return toast('Não há dados DEMO'); if (confirm(`Apagar ${ds.length} clínica(s) DEMO e todas as tarefas delas? Suas clínicas reais não são afetadas.`)) { ds.forEach((c) => deleteClinic(c.id)); if (ds.some((c) => c.id === ui.mapClinic)) ui.mapClinic = null; log('Removeu dados DEMO'); saveNow(); render(); toast('Clínicas DEMO apagadas'); } },
    addDemo: () => { seedDemo(); save(); render(); toast('Dados DEMO criados'); },
    wipe: () => { if (confirm('Apagar TODOS os dados deste aparelho? Faça backup antes.') && confirm('Tem certeza? Não dá para desfazer.')) { const me = S.me; S = defaultState(); S.me = me; saveNow(); render(); toast('Tudo apagado'); } },
    print: () => window.print(),
    syncNow: () => { Sync.setMeta({}); Sync.meta().dirty ? Sync.push() : Sync.pull(); },
    syncOff: () => { if (confirm('Desconectar a sincronização neste aparelho? Os dados continuam aqui, só param de sincronizar.')) { Sync.disconnect(); render(); } },
    themeToggle: () => { S.settings.theme = isDark() ? 'light' : 'dark'; applyTheme(); save(); render(); },
    presGo: () => { ui.presMonth = Math.min(12, Math.max(1, +d.n)); renderPresMonth(); },
    more: () => { $('#moreSheet').hidden = !$('#moreSheet').hidden; },
  };
  if (H[act]) { if (a.tagName === 'BUTTON' || act === 'more') e.preventDefault(); H[act](); }
});

document.addEventListener('change', (e) => {
  const el = e.target; const d = el.dataset;
  if (d.tf && ui.panel && ui.panel.type === 'task') {
    const t = taskById(ui.panel.id); let v = el.value;
    if (d.tf === 'hours') v = +v || 1;
    if (d.tf === 'title' && !v.trim()) return;
    setTask(t, d.tf, v); rerender(); return;
  }
  const H = {
    chk: () => { const t = taskById(ui.panel.id); const i = t.checklist[+d.i]; i.done = el.checked; t.history.unshift({ at: new Date().toISOString(), who: S.me, what: `checklist “${i.t}”: ${i.done ? 'feito' : 'desmarcado'}` });
      if (t.checklist.every((x) => x.done) && t.status === 'a_fazer') setTask(t, 'status', 'andamento'); if (t.checklist.some((x) => x.done) && t.status === 'a_fazer') setTask(t, 'status', 'andamento'); rerender(); },
    presClinic: () => { ui.presClinic = el.value || null; render(); },
    mapClinic: () => { ui.mapClinic = el.value || null; history.replaceState(null, '', '#/mapa'); closePanel(); render(); },
    kanMonth: () => { ui.kanMonth = el.value; render(); },
    kstat: () => { setTask(taskById(d.id), 'status', el.value); rerender(); },
    towner: () => { ui.taskOwner = el.value; render(); }, tclinic: () => { ui.taskClinic = el.value; render(); }, tstatus: () => { ui.taskStatus = el.value; render(); },
    crClinic: () => { ui.crClinic = el.value; ui.crMonth = ''; render(); }, crMonth: () => { ui.crMonth = el.value; render(); },
    crf: () => { const x = S.creatives.find((y) => y.id === d.id); x[d.f] = el.value; if (d.f === 'status') log(`Criativo #${x.slot} (mês ${x.month}): ${CREATIVE_STATUS.find((s) => s[0] === el.value)[1]}`, x.clinicId); save(); if (d.f === 'status' || d.f === 'type') render(); },
    resClinic: () => { ui.resClinic = el.value; ui.resMonth = null; render(); }, resMonth: () => { ui.resMonth = +el.value; render(); },
    pay: () => { const c = clinicById(d.id); c.payment = el.value; log(`Pagamento de ${c.name}: ${el.selectedOptions[0].text}`, c.id); save(); },
    approveReport: () => { const c = clinicById(d.c); c.reports = c.reports || {}; if (el.checked) c.reports[d.n] = { who: S.me, at: new Date().toISOString() }; else delete c.reports[d.n]; log(`Relatório do mês ${d.n} ${el.checked ? 'aprovado' : 'voltou a rascunho'}`, c.id); save(); render(); },
    importJSON: () => {
      const f = el.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { try { const data = JSON.parse(r.result); if (!data.clinics || !data.tasks) throw new Error('arquivo não parece um backup do app');
        if (!confirm(`Restaurar backup com ${data.clinics.length} clínica(s)? Os dados atuais deste aparelho serão substituídos.`)) return;
        S = Object.assign(defaultState(), data, { settings: Object.assign(defaultState().settings, data.settings) }); log('Restaurou backup'); saveNow(); applyTheme(); render(); toast('Backup restaurado'); } catch (err) { alert('Não foi possível restaurar: ' + err.message); } };
      r.readAsText(f);
    },
    bsel: () => {},
  };
  if (H[d.act]) H[d.act]();
  if (el.classList.contains('bsel')) { const n = $$('.bsel:checked').length; const b = $('.bulk'); b.hidden = !n; b.querySelector('span').textContent = `${n} selecionada(s)`; }
  if (d.act === 'bulkOwner' && el.value) { $$('.bsel:checked').forEach((c) => setTask(taskById(c.value), 'owner', el.value)); rerender(); toast('Responsável atualizado'); }
});
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="bulkDone"]')) { const ids = $$('.bsel:checked').map((c) => c.value); ids.forEach((id) => setTask(taskById(id), 'status', 'concluido')); rerender(); toast(`${ids.length} tarefa(s) concluída(s)`); }
});
let tqTimer;
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.pf) { propUpdate(e.target); return; }
  if (e.target.dataset.act === 'tq') { clearTimeout(tqTimer); const v = e.target.value; tqTimer = setTimeout(() => { ui.taskQuery = v; render(); const i = $('[data-act="tq"]'); i.focus(); i.setSelectionRange(v.length, v.length); }, 250); }
});

document.addEventListener('submit', (e) => {
  const f = e.target; const kind = f.dataset.form; if (!kind) return; e.preventDefault();
  const fd = new FormData(f); const g = (k) => (fd.get(k) ?? '').toString().trim();
  const n = (k) => (g(k) === '' ? null : Number(g(k)));
  if (kind === 'clinic') {
    const isNew = !f.dataset.id;
    const c = isNew ? { id: uid(), createdAt: new Date().toISOString() } : clinicById(f.dataset.id);
    const oldStart = c.startDate;
    Object.assign(c, { name: g('name'), segment: g('segment'), stage: g('stage'), city: g('city'), uf: g('uf').toUpperCase(), contact: g('contact'), phone: g('phone'), humanResp: g('humanResp'),
      startDate: g('startDate') || todayStr(), price: n('price'), baseRevenue: n('baseRevenue'), mediaBudget: n('mediaBudget'), setupFee: n('setupFee'), setupWaived: fd.get('setupWaived') === 'on', setupReason: g('setupReason'),
      payment: g('payment'), territory: g('territory'), exclusivity: g('exclusivity'), guarantee: g('guarantee'), goal: g('goal'), notes: g('notes') });
    if (c.setupWaived && !c.setupReason) { alert('Informe o motivo da isenção da implantação.'); return; }
    const conf = conflictsFor(c);
    if (conf.length && c.exclusivity !== 'nao_solicitada' && !confirm(`Possível conflito de exclusividade com: ${conf.map((x) => x.name).join(', ')} (mesmo segmento e cidade).\n\nSalvar assim mesmo? A exclusividade ficará “em análise” até decisão manual.`)) return;
    if (conf.length && c.exclusivity === 'aprovada') c.exclusivity = 'em_analise';
    if (isNew) { S.clinics.push(c); log(`Cadastrou a clínica ${c.name}`, c.id); if (fd.get('start') === 'on') startJourney(c); }
    else { log(`Editou dados da clínica ${c.name}`, c.id); if (c.journey && oldStart !== c.startDate) alert('A data de início mudou. As tarefas já geradas mantêm os prazos originais (ajuste-as individualmente se precisar).'); }
    closeModal(); save(); go('#/clinica/' + c.id); ui.clinicTab = 'hoje'; render(); toast(isNew ? 'Clínica cadastrada' : 'Clínica atualizada');
  } else if (kind === 'task') {
    const t = { id: uid(), clinicId: g('clinicId'), month: +g('month'), kind: g('kind'), pillar: g('pillar'), title: g('title'), owner: g('owner'), due: g('due') || todayStr(), priority: 'media', status: 'a_fazer', checklist: [], meeting: fd.get('meeting') === 'on', hours: 1, evidence: '', notes: '', doneAt: null, custom: true, history: [{ at: new Date().toISOString(), who: S.me, what: 'Criada manualmente' }] };
    S.tasks.push(t); log(`Criou tarefa “${t.title}”`, t.clinicId); closeModal(); rerender(); openPanel({ type: 'task', id: t.id });
  } else if (kind === 'chkAdd') {
    const t = taskById(ui.panel.id); if (!g('t')) return; t.checklist.push({ t: g('t'), done: false }); rerender(); setTimeout(() => $('#panel [name="t"]')?.focus(), 30);
  } else if (kind === 'syncConnect') {
    const tok = g('token'); if (!tok) return;
    f.querySelector('button').disabled = true; toast('Conectando…');
    Sync.connect(tok).then((ok) => { if (ok) toast('Sincronização ligada'); else { alert('Não consegui conectar: ' + (Sync.msg || 'confira o token e a permissão Contents (Read and write) no repositório roity-mbcr-dados.')); Sync.disconnect(); } render(); });
  } else if (kind === 'settings') {
    Object.assign(S.settings, { goalClinics: n('goalClinics') || 20, workDays: n('workDays') || 21, hoursPerCreative: n('hoursPerCreative') ?? 0.25, reviewLimit: n('reviewLimit') ?? 2 });
    S.settings.capacity = { Tiago: n('capT') ?? 4, Micaela: n('capM') ?? 4 }; save(); toast('Configurações salvas');
  } else if (kind === 'camp') {
    const c = clinicById(f.dataset.c); c.campaigns = c.campaigns || [];
    c.campaigns.unshift({ id: uid(), name: g('name'), hyp: g('hyp'), audience: g('audience'), offer: g('offer'), budget: n('budget'), date: g('date'), decision: g('decision') });
    log(`Registrou campanha “${g('name')}”`, c.id); closeModal(); save(); render();
  }
});

// arrastar no kanban (desktop)
document.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-drag]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.drag); });
document.addEventListener('dragover', (e) => { if (e.target.closest('[data-drop]')) e.preventDefault(); });
document.addEventListener('drop', (e) => { const col = e.target.closest('[data-drop]'); if (!col) return; e.preventDefault(); const t = taskById(e.dataTransfer.getData('text/plain')); if (t) { setTask(t, 'status', col.dataset.drop); rerender(); } });

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.panel && !$('#modal').open) closePanel(); });

// ================= início =================
function boot() {
  initStore(); applyTheme();
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}"><span class="ni" aria-hidden="true">${i}</span><span>${l}</span></a>`).join('');
  const bottom = ['visao', 'mapa', 'clinicas', 'tarefas'];
  $('#bottomNav').innerHTML = bottom.map((k) => { const n = NAV.find((x) => x[0] === k); return `<a href="#/${k}" data-nav="${k}"><span class="ni" aria-hidden="true">${n[2]}</span><span>${n[1].split(' ')[0]}</span></a>`; }).join('') + `<a href="#" data-act="more"><span class="ni" aria-hidden="true">⋯</span><span>Mais</span></a>`;
  $('#moreSheet').innerHTML = NAV.filter((n) => !bottom.includes(n[0])).map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}"><span class="ni">${i}</span>${l}</a>`).join('');
  $('#moreSheet').addEventListener('click', () => ($('#moreSheet').hidden = true));
  $('#panelClose').addEventListener('click', closePanel);
  $('#scrim').addEventListener('click', closePanel);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#quickAdd').addEventListener('click', () => clinicForm());
  $('#themeBtn').addEventListener('click', () => { S.settings.theme = isDark() ? 'light' : 'dark'; applyTheme(); save(); if (route.name === 'config') render(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  applyTheme();
  window.addEventListener('hashchange', () => { closePanel(); $('#moreSheet').hidden = true; render(); $('.main').scrollTop = 0; });
  render();
  renderSyncBadge(); Sync.start();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
