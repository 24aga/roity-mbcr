// Resultados por clínica, relatórios semestral/anual, financeiro e código de bloqueio.
'use strict';

// =================== RESULTADOS DO MÊS ===================
const MF = [['media', 'Investimento em anúncios', 'R$'], ['leads', 'Novos contatos', ''], ['appts', 'Agendamentos', ''], ['shows', 'Comparecimentos', ''], ['sales', 'Pacientes pagantes (vendas)', ''], ['revenue', 'Faturamento das vendas', 'R$']];
const GOALS = [['revenue', 'Faturamento', 'R$'], ['sales', 'Vendas', ''], ['appts', 'Agendamentos', '']];
const nz = (v) => (v === '' || v == null || isNaN(v) ? null : Number(v));
function metric(cid, n) { return S.metrics.find((m) => m.clinicId === cid && m.month === n) || null; }
function metricEnsure(cid, n) { let m = metric(cid, n); if (!m) { m = { id: uid(), clinicId: cid, month: n }; S.metrics.push(m); } return m; }
function kpis(m) {
  const g = (k) => (m ? nz(m[k]) : null); const div = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
  return { cpl: div(g('media'), g('leads')), cac: div(g('media'), g('sales')), agRate: div(g('appts'), g('leads')), showRate: div(g('shows'), g('appts')),
    close: div(g('sales'), g('shows') ?? g('appts')), ticket: div(g('revenue'), g('sales')), roas: div(g('revenue'), g('media')) };
}
function sumMetrics(cid, from, to) {
  const out = {}; MF.forEach(([k]) => (out[k] = null));
  for (let n = from; n <= to; n++) { const m = metric(cid, n); if (!m) continue; MF.forEach(([k]) => { const v = nz(m[k]); if (v != null) out[k] = (out[k] || 0) + v; }); }
  return out;
}
function goalPct(c, n, k = 'revenue') { const m = metric(c.id, n); const goal = nz((c.goals || {})[k]); const v = m ? nz(m[k]) : null; return goal && v != null ? v / goal : null; }
const fmtN = (v, unit) => (v == null ? 'não informado' : unit === 'R$' ? money(v) : Number(v).toLocaleString('pt-BR'));
const fmtX = (v) => (v == null ? 'não informado' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'x');
function monthName(c, n) { return c.startDate ? fmtDate(monthStart(c, n), { month: 'short', year: '2-digit' }).replace('.', '') : ''; }

function resultsTab(c) {
  if (!c.journey) return empty('Os resultados ficam disponíveis quando a jornada começa.', 'calendario');
  const cur = Math.min(12, Math.max(1, currentMonth(c)));
  const n = ui.resN && ui.resClin === c.id ? ui.resN : cur; ui.resN = n; ui.resClin = c.id;
  const m = metric(c.id, n) || {}; const k = kpis(m); const goals = c.goals || {};
  const all = Array.from({ length: 12 }, (_, i) => i + 1).filter((i) => i <= Math.max(cur, n));
  return `
    <div class="res-top"><label class="sel"><span>Mês</span><select data-act="resN">${MONTHS.map((x) => `<option value="${x.n}"${x.n === n ? ' selected' : ''}>Mês ${x.n} · ${monthName(c, x.n)}${x.n === cur ? ' (atual)' : ''}</option>`).join('')}</select></label>
      <span class="btns" style="margin:0"><a class="btn sm" href="#/relatorio/${c.id}/${n}">Relatório do mês</a><a class="btn sm" href="#/relatorio/${c.id}/s1">Semestral</a><a class="btn sm" href="#/relatorio/${c.id}/ano">Anual</a></span></div>
    <div class="grid2">
      <section class="card"><header><h3>Números do mês ${n}</h3><small class="muted" id="mSaved">salvo automaticamente</small></header>
        <div class="mform">${MF.map(([f, l, u]) => `<label><span>${l}${u ? ' (R$)' : ''}</span><input type="number" inputmode="decimal" min="0" step="any" data-mf="${f}" data-c="${c.id}" data-n="${n}" value="${m[f] ?? ''}" placeholder="não informado"></label>`).join('')}</div>
        <p class="hint">Campo vazio aparece como “não informado”, nunca como zero.</p></section>
      <section class="card"><header><h3>Meta do mês</h3><small class="muted">vale para todos os meses</small></header>
        ${GOALS.map(([g, l, u]) => { const v = nz(m[g]); const goal = nz(goals[g]); const p = goal && v != null ? v / goal : null;
          return `<div class="goal"><div class="goal-h"><b>${l}</b><span>${fmtN(v, u)} de <input type="number" min="0" step="any" class="goal-in" data-goal="${g}" data-c="${c.id}" value="${goals[g] ?? ''}" placeholder="meta"></span></div>
          <div class="bar ${p != null && p >= 1 ? 'ok' : ''}"><i style="width:${p == null ? 0 : Math.min(100, p * 100)}%"></i></div><small>${p == null ? (goal ? 'Lance os números do mês' : 'Defina a meta') : Math.round(p * 100) + '% da meta'}</small></div>`; }).join('')}
      </section>
    </div>
    <section class="card"><header><h3>Indicadores</h3></header><div class="kgrid k4g">
      <div><span>Custo por contato</span><b>${money(k.cpl)}</b><small>anúncios ÷ contatos</small></div>
      <div><span>Custo por paciente</span><b>${money(k.cac)}</b><small>anúncios ÷ vendas</small></div>
      <div><span>Taxa de agendamento</span><b>${pct(k.agRate)}</b><small>agendamentos ÷ contatos</small></div>
      <div><span>Comparecimento</span><b>${pct(k.showRate)}</b><small>compareceram ÷ agendados</small></div>
      <div><span>Fechamento</span><b>${pct(k.close)}</b><small>vendas ÷ comparecimentos</small></div>
      <div><span>Ticket médio</span><b>${money(k.ticket)}</b><small>faturamento ÷ vendas</small></div>
      <div><span>Retorno sobre anúncios</span><b>${fmtX(k.roas)}</b><small>faturamento ÷ anúncios</small></div>
      <div><span>Faturamento base</span><b>${money(c.baseRevenue)}</b><small>antes da Roity</small></div>
    </div></section>
    <section class="card"><header><h3>Evolução</h3></header><div class="tscroll"><table class="tbl"><thead><tr><th>Mês</th><th>Contatos</th><th>Agend.</th><th>Vendas</th><th>Faturamento</th><th>Meta</th></tr></thead><tbody>
      ${all.map((i) => { const mm = metric(c.id, i) || {}; const p = goalPct(c, i); return `<tr class="${i === n ? 'sel' : ''}"><td><button class="lnk" data-act="resN2" data-n="${i}">${i} · ${monthName(c, i)}</button></td><td>${mm.leads ?? '—'}</td><td>${mm.appts ?? '—'}</td><td>${mm.sales ?? '—'}</td><td>${mm.revenue != null ? money(mm.revenue) : '—'}</td><td>${p == null ? '—' : Math.round(p * 100) + '%'}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}
function metricsBlock(c, n) {
  const m = metric(c.id, n) || {}; const p = metric(c.id, n - 1); const k = kpis(m); const kp = p ? kpis(p) : null; const goals = c.goals || {};
  const rows = [['Novos contatos', fmtN(nz(m.leads)), p ? fmtN(nz(p.leads)) : '—'], ['Agendamentos', fmtN(nz(m.appts)), p ? fmtN(nz(p.appts)) : '—'], ['Comparecimentos', fmtN(nz(m.shows)), p ? fmtN(nz(p.shows)) : '—'],
    ['Pacientes pagantes', fmtN(nz(m.sales)), p ? fmtN(nz(p.sales)) : '—'], ['Faturamento das vendas', fmtN(nz(m.revenue), 'R$'), p ? fmtN(nz(p.revenue), 'R$') : '—'], ['Investimento em anúncios', fmtN(nz(m.media), 'R$'), p ? fmtN(nz(p.media), 'R$') : '—'],
    ['Custo por contato', money(k.cpl), kp ? money(kp.cpl) : '—'], ['Custo por paciente', money(k.cac), kp ? money(kp.cac) : '—'], ['Fechamento', pct(k.close), kp ? pct(kp.close) : '—']];
  const gp = GOALS.map(([g, l, u]) => { const v = nz(m[g]); const goal = nz(goals[g]); return goal ? `<div><span>${l.toUpperCase()}</span><b>${v == null ? '—' : Math.round((v / goal) * 100) + '%'}</b><small>${fmtN(v, u)} de ${fmtN(goal, u)}</small></div>` : ''; }).join('');
  return `${gp ? `<div class="r-stats r-goals">${gp}</div>` : ''}<table class="tbl p-tbl"><thead><tr><th>Indicador</th><th>Mês ${n}</th><th>Mês anterior</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <p class="hint">Faturamento base (antes da Roity): ${money(c.baseRevenue)}. Valores não lançados aparecem como “não informado”.</p>`;
}

// relatórios semestral e anual
function periodReport(c, from, to, title) {
  const s = sumMetrics(c.id, from, to); const k = kpis(s);
  const tasks = S.tasks.filter((t) => t.clinicId === c.id && t.month >= from && t.month <= to);
  const done = tasks.filter((t) => t.status === 'concluido'); const novos = done.filter((t) => t.kind === 'novo');
  const months = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const revs = months.map((i) => nz((metric(c.id, i) || {}).revenue)); const maxR = Math.max(1, ...revs.map((v) => v || 0));
  view().innerHTML = `
    <div class="noprint page-h"><a class="back" href="#/clinica/${c.id}">← ${esc(c.name)}</a><div class="btns"><button class="btn primary" data-act="print">Salvar PDF / Imprimir</button></div></div>
    <article class="report">
      <div class="r-band"><img class="r-logo" src="icons/logo-white.png" alt="ROITY"><div><b>${title}</b><small>MESES ${from} A ${to} · MÉTODO MBCR</small></div></div><div class="r-red"></div>
      <div class="r-body">
        <div class="r-eyebrow">${title.toUpperCase()} · ${c.startDate ? fmtDate(monthStart(c, from), { month: 'long', year: 'numeric' }).toUpperCase() + ' A ' + fmtDate(monthStart(c, to), { month: 'long', year: 'numeric' }).toUpperCase() : ''}</div>
        <h1>${esc(c.name)}</h1>
        <div class="r-stats"><div class="hero"><span>FATURAMENTO DAS VENDAS</span><b>${fmtN(s.revenue, 'R$')}</b></div><div><span>PACIENTES PAGANTES</span><b>${fmtN(s.sales)}</b></div><div><span>ENTREGAS CONCLUÍDAS</span><b>${done.length}/${tasks.length}</b></div></div>
        <h2><span class="r-badge">01</span>Resultados do período</h2>
        <table class="tbl p-tbl"><thead><tr><th>Indicador</th><th>Total do período</th></tr></thead><tbody>
          ${[['Novos contatos', fmtN(s.leads)], ['Agendamentos', fmtN(s.appts)], ['Comparecimentos', fmtN(s.shows)], ['Pacientes pagantes', fmtN(s.sales)], ['Faturamento das vendas', fmtN(s.revenue, 'R$')], ['Investimento em anúncios', fmtN(s.media, 'R$')], ['Custo por paciente', money(k.cac)], ['Ticket médio', money(k.ticket)], ['Retorno sobre anúncios', fmtX(k.roas)]].map((r) => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}
        </tbody></table>
        <h2><span class="r-badge">02</span>Evolução mês a mês</h2>
        <div class="r-chart">${months.map((i, j) => `<div><i style="height:${revs[j] ? Math.max(4, (revs[j] / maxR) * 100) : 2}%"></i><small>${i}</small></div>`).join('')}</div>
        <p class="hint">Faturamento das vendas por mês da jornada. Faturamento base antes da Roity: ${money(c.baseRevenue)}.</p>
        <h2><span class="r-badge">03</span>O que implantamos</h2>
        <ol>${months.map((i) => { const md = monthData(c, i); const d = md.tasks.filter((t) => t.status === 'concluido').length; return `<li><b>Mês ${i} — ${esc(md.title)}</b> <small>(${d}/${md.tasks.length} entregas)</small></li>`; }).join('')}</ol>
        <p>${pl(novos.length, 'entrega estratégica concluída', 'entregas estratégicas concluídas')} no período, além das rotinas mensais (campanhas, criativos, reuniões e relatórios).</p>
        <h2><span class="r-badge">04</span>Próximos passos</h2>
        ${to < 12 ? `<ol>${[7, 8, 9, 10, 11, 12].map((i) => `<li>Mês ${i}: ${esc(c.journey.template[i - 1].title)}</li>`).join('')}</ol>` : '<p>Revisão do ano, plano do próximo ciclo e proposta de renovação.</p>'}
        <div class="r-alert"><b>AVALIAÇÃO</b><p style="margin:6px 0 0">Metas e eventuais garantias são avaliadas conforme o contrato assinado, com revisão humana. Este relatório não substitui essa avaliação.</p></div>
        <footer class="r-foot"><span><b>${esc(c.name).toUpperCase()}</b> · ${title.toUpperCase()}</span><span>ROITY · MÉTODO MBCR</span></footer>
      </div></article>`;
}

// =================== FINANCEIRO ===================
const ymAdd = (ym, n) => addMonths(ym + '-01', n).slice(0, 7);
function chargeStatus(p) { if (p.paidAt) return ['pago', 'Recebido']; return p.due < todayStr() ? ['atrasado', 'Atrasado'] : ['pendente', 'A receber']; }
function ensureCharges(ym) {
  S.payments = S.payments || []; let created = 0;
  S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage) && c.startDate && c.price).forEach((c) => {
    const sYm = c.startDate.slice(0, 7); if (ym < sYm) return;
    const day = Math.min(+(c.dueDay || c.startDate.slice(8, 10)) || 10, 28); const due = `${ym}-${String(day).padStart(2, '0')}`;
    const add = (kind, amount) => { const id = `${c.id}|${ym}|${kind}`; if (S.payments.some((p) => p.id === id)) return; S.payments.push({ id, clinicId: c.id, ym, kind, amount, due, paidAt: null }); created++; };
    add('mensalidade', +c.price);
    if (ym === sYm && !c.setupWaived && +c.setupFee > 0) add('implantacao', +c.setupFee);
  });
  return created;
}
function clinicHours(c) {
  const n = Math.min(12, Math.max(1, currentMonth(c))); let h = 0;
  S.tasks.filter((t) => t.clinicId === c.id && t.month === n).forEach((t) => (h += t.hours || 1));
  DAILY_CHECKS.forEach((dc) => (h += (dc.min * S.settings.workDays) / 60)); return h;
}
VIEWS.financeiro = () => {
  const ym = ui.finYm || todayStr().slice(0, 7); ui.finYm = ym;
  if (ensureCharges(ym)) save();
  const list = (S.payments || []).filter((p) => p.ym === ym && clinicById(p.clinicId)).sort((a, b) => a.due.localeCompare(b.due));
  const sum = (arr) => arr.reduce((a, p) => a + (+p.amount || 0), 0);
  const prev = sum(list), rec = sum(list.filter((p) => p.paidAt)), late = sum(list.filter((p) => !p.paidAt && p.due < todayStr())), open = prev - rec;
  const allLate = (S.payments || []).filter((p) => !p.paidAt && p.due < todayStr() && clinicById(p.clinicId));
  const act = S.clinics.filter((c) => ['ativo', 'onboarding'].includes(c.stage)); const mrr = act.reduce((a, c) => a + (+c.price || 0), 0);
  const started = S.clinics.filter((c) => c.journey); const gone = started.filter((c) => c.stage === 'encerrado');
  const retention = started.length ? (started.length - gone.length) / started.length : null;
  const hc = +S.settings.hourCost || 0, tc = +S.settings.toolsCost || 0;
  const monthLabel = ((x) => x.charAt(0).toUpperCase() + x.slice(1))(parseD(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  view().innerHTML = `
    <div class="cal-h"><button class="btn sm" data-act="finNav" data-d="-1" aria-label="Mês anterior">←</button><h2>${monthLabel}</h2><button class="btn sm" data-act="finNav" data-d="1" aria-label="Próximo mês">→</button><button class="btn sm ghost" data-act="finNav" data-d="0">Hoje</button></div>
    <div class="kpis k4">
      <div class="kpi"><span>Previsto no mês</span><b>${money(prev)}</b><em>${pl(list.length, 'cobrança', 'cobranças')}</em></div>
      <div class="kpi"><span>Recebido</span><b class="okc">${money(rec)}</b><em>${prev ? Math.round((rec / prev) * 100) + '% do previsto' : '—'}</em></div>
      <div class="kpi ${late ? 'warn' : ''}"><span>Atrasado</span><b>${money(late)}</b><em>em aberto: ${money(open)}</em></div>
      <div class="kpi"><span>Receita mensal (MRR)</span><b>${money(mrr)}</b><em>${pl(act.length, 'cliente', 'clientes')} · meta ${money(S.settings.goalClinics * 2500)}</em></div>
    </div>
    <section class="card"><header><h3>Cobranças de ${monthLabel}</h3></header>
      ${list.length ? `<ul class="tlist">${list.map((p) => { const c = clinicById(p.clinicId); const [k, l] = chargeStatus(p);
        return `<li class="pay"><span class="pay-n"><b>${esc(c.name)}</b><small>${p.kind === 'implantacao' ? 'Implantação' : 'Mensalidade'} · vence ${fmtShort(p.due)}${p.paidAt ? ' · recebido ' + fmtShort(p.paidAt) : ''}</small></span>
          <b class="pay-v">${money(p.amount)}</b>${pill(k === 'pago' ? 'concluido' : k === 'atrasado' ? 'atrasado' : 'andamento', l)}
          <button class="btn sm ${p.paidAt ? '' : 'primary'}" data-act="payToggle" data-id="${esc(p.id)}">${p.paidAt ? 'Desfazer' : '✓ Recebido'}</button></li>`; }).join('')}</ul>`
      : empty('Nenhuma cobrança neste mês. As mensalidades aparecem para clínicas ativas ou em onboarding.', 'financeiro')}</section>
    ${allLate.length ? `<div class="notice warn">Inadimplência: ${pl(allLate.length, 'cobrança atrasada', 'cobranças atrasadas')}, total ${money(sum(allLate))}. ${[...new Set(allLate.map((p) => clinicById(p.clinicId).name))].map(esc).join(', ')}.</div>` : ''}
    <div class="grid2">
      <section class="card"><header><h3>Margem por cliente (estimada)</h3></header>
        ${act.length ? `<div class="tscroll"><table class="tbl rtbl"><thead><tr><th>Clínica</th><th>Mensalidade</th><th>Horas/mês</th><th>Custo</th><th>Margem</th></tr></thead><tbody>
          ${act.map((c) => { const h = clinicHours(c); const cost = h * hc + tc; const mg = (+c.price || 0) - cost;
            return `<tr><td data-l="Clínica"><a href="#/clinica/${c.id}">${esc(c.name)}</a></td><td data-l="Mensalidade">${money(c.price)}</td><td data-l="Horas/mês">${h.toFixed(0)}h</td><td data-l="Custo">${hc || tc ? money(cost) : '—'}</td><td data-l="Margem"><b>${hc || tc ? money(mg) + ' (' + Math.round((mg / (+c.price || 1)) * 100) + '%)' : '—'}</b></td></tr>`; }).join('')}
        </tbody></table></div><p class="hint">${hc || tc ? `Custo = horas × ${money(hc)}/h + ${money(tc)} de ferramentas por cliente.` : 'Defina o custo da sua hora e das ferramentas em Configurações para ver a margem.'}</p>` : empty('Sem clientes ativos.', 'clinicas')}</section>
      <section class="card"><header><h3>Clientes e retenção</h3></header>
        <dl class="dl"><dt>Clientes ativos</dt><dd>${act.length}</dd><dt>Já atendidos (com jornada)</dt><dd>${started.length}</dd><dt>Encerrados</dt><dd>${gone.length}</dd>
        <dt>Retenção</dt><dd><b>${retention == null ? 'não informado' : Math.round(retention * 100) + '%'}</b></dd><dt>Projeção em 12 meses</dt><dd>${money(mrr * 12)} (antes de custos e impostos)</dd></dl>
        <p class="hint">A verba de anúncios é paga pela clínica direto à plataforma e não entra na receita da Roity.</p></section>
    </div>`;
};

// =================== CÓDIGO DE BLOQUEIO (por aparelho) ===================
const PIN_KEY = 'roity-pin';
async function pinHash(p) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('roity:' + p)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function pinSet() { try { return !!localStorage.getItem(PIN_KEY); } catch (e) { return false; } }
function lockShow() {
  if (!pinSet()) return; try { if (sessionStorage.getItem('roity-unlocked') === '1') return; } catch (e) {}
  const d = document.createElement('div'); d.id = 'lock'; d.className = 'lock';
  d.innerHTML = `<form class="lock-box" id="lockForm"><img src="icons/logo-white.png" alt="ROITY" class="lock-logo"><h2>Digite seu código</h2><input type="password" inputmode="numeric" autocomplete="off" id="lockIn" maxlength="8" aria-label="Código de acesso"><p class="lock-err" id="lockErr" hidden>Código incorreto</p><button class="btn primary">Entrar</button></form>`;
  document.body.appendChild(d); setTimeout(() => $('#lockIn').focus(), 50);
  $('#lockForm').addEventListener('submit', async (e) => { e.preventDefault(); const ok = (await pinHash($('#lockIn').value)) === localStorage.getItem(PIN_KEY);
    if (ok) { try { sessionStorage.setItem('roity-unlocked', '1'); } catch (er) {} d.remove(); } else { $('#lockErr').hidden = false; $('#lockIn').value = ''; } });
}
window.addEventListener('DOMContentLoaded', lockShow);

// campos de texto crescem com o conteúdo (nada de texto cortado), até 60% da tela
(() => {
  const skip = (ta) => ta.name === 'script' || ta.id === 'impPaste';
  const grow = (ta) => { if (skip(ta) || !ta.isConnected) return; ta.style.height = 'auto'; const max = Math.round(window.innerHeight * 0.6); const h = Math.min(ta.scrollHeight + 2, max); if (h > 4) { ta.style.height = h + 'px'; ta.style.overflowY = ta.scrollHeight + 2 > max ? 'auto' : 'hidden'; } };
  const all = (root) => (root.querySelectorAll ? root.querySelectorAll('textarea') : []).forEach(grow);
  document.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') grow(e.target); });
  new MutationObserver((ms) => { let any = false; ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && (n.tagName === 'TEXTAREA' || n.querySelector && n.querySelector('textarea'))) any = true; })); if (any) requestAnimationFrame(() => all(document)); }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => all(document));
  document.addEventListener('toggle', (e) => all(e.target), true);
})();
