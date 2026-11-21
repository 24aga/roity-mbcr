// Prospecção: importação de listas (Kenai, CSV, Excel), fila diária e Modo ligação.
'use strict';

const SCRIPT_DEFAULT = `ABERTURA
"Oi, tudo bem? Aqui é o Tiago, da Roity. Falo com o responsável pela clínica? É rapidinho."

POR QUE ESTOU LIGANDO
"A gente ajuda clínicas de estética a ter mais pacientes todo mês: anúncios, conteúdo, atendimento 24 horas no WhatsApp e treinamento da recepção, tudo num método só."

PERGUNTAS (QUALIFICAR)
1. Hoje vocês fazem anúncios? Quem cuida disso?
2. Quantos contatos novos chegam por mês, mais ou menos?
3. Quem responde o WhatsApp? Dá conta de responder rápido?
4. Qual procedimento você mais quer vender?

CONVITE
"Faz sentido eu te mostrar em 30 minutos como funcionaria na sua clínica? Tenho horário [dia] às [hora] ou [dia] às [hora]."

OBJEÇÕES
• "Já tenho agência" → "Ótimo! Ela cuida também do atendimento e treina sua recepção? A gente olha o processo inteiro, do anúncio até o paciente pagar."
• "Está caro / sem verba" → "Entendo. Por isso a conversa é rápida: a gente vê se o retorno faz sentido antes de qualquer investimento."
• "Me manda no WhatsApp" → "Mando sim. Pra te mandar o que faz sentido, qual procedimento é prioridade hoje?"
• "Não tenho tempo" → "É justamente para tirar isso das suas costas. 30 minutos e você decide."
• "Já tentei anúncio e não deu certo" → "Normalmente o problema não é só o anúncio, é o que acontece depois: resposta, follow-up e fechamento. É isso que a gente organiza."`;

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const IMPORT_MAX = 1500;

// ---------- utilidades ----------
const noAcc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
function normPhone(ddd, num) {
  let d = digits(ddd), n = digits(num);
  if (!n) return '';
  if (!d && n.length >= 10) { d = n.slice(0, 2); n = n.slice(2); }
  if (n.length === 8 && /[6-9]/.test(n[0])) n = '9' + n; // celular antigo sem o 9
  return d + n;
}
function fmtPhone(p) { const d = digits(p); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return p || ''; }
const isMobile = (p) => digits(p).length === 11;
const waLink = (p) => `https://wa.me/55${digits(p)}`;
function titleCase(s) {
  const small = ['de', 'da', 'do', 'das', 'dos', 'e', 'em'];
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').map((w, i) => (i && small.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
    .replace(/\b(Ltda|Me|Epp|Eireli)\b/g, (m) => m.toUpperCase());
}
function addWeekdays(d, n) { let x = d; let k = 0; while (k < n) { x = addDays(x, 1); const w = parseD(x).getDay(); if (w !== 0 && w !== 6) k++; } return x; }
function nextWeekday(d) { let x = d; while ([0, 6].includes(parseD(x).getDay())) x = addDays(x, 1); return x; }
function loadScript(src) { return new Promise((ok, err) => { if ([...document.scripts].some((s) => s.src === src)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('Sem internet para ler Excel. Tente CSV ou cole as linhas.')); document.head.appendChild(s); }); }

// ---------- leitura de arquivos ----------
function parseDelimited(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows.filter((r) => r.some((c) => String(c).trim()));
  return (rest || []).map((r) => Object.fromEntries((h || []).map((k, i) => [k, r[i] ?? ''])));
}
async function readLeadFile(file) {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return parseDelimited(await file.text());
  await loadScript(XLSX_URL);
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
}

// ---------- mapeamento de colunas ----------
const COLS = {
  fantasia: ['nome fantasia', 'fantasia'], razao: ['razao social', 'razao', 'empresa', 'nome', 'nome da empresa', 'clinica'],
  ddd1: ['ddd 1', 'ddd1', 'ddd'], tel1: ['telefone 1', 'telefone1', 'telefone', 'celular', 'whatsapp', 'fone', 'tel'],
  ddd2: ['ddd 2', 'ddd2'], tel2: ['telefone 2', 'telefone2'], email: ['e-mail', 'email'],
  city: ['municipio', 'cidade'], uf: ['estado', 'uf'], bairro: ['bairro'], cnpj: ['cnpj'],
  nature: ['natureza juridica', 'natureza'], capital: ['capital social', 'capital'], opened: ['data inicio atividade', 'abertura', 'data de abertura'],
  porte: ['porte'], socios: ['socios'], cnae: ['cnae principal', 'cnae'],
};
function mapLeads(rows) {
  if (!rows.length) return [];
  const heads = Object.keys(rows[0]); const pick = {};
  for (const [k, names] of Object.entries(COLS)) pick[k] = heads.find((h) => names.includes(noAcc(h))) || heads.find((h) => names.some((n) => noAcc(h).startsWith(n)));
  const g = (r, k) => (pick[k] ? String(r[pick[k]] ?? '').trim() : '');
  return rows.map((r) => {
    let name = g(r, 'fantasia') || g(r, 'razao');
    name = name.replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, ''); // tira CNPJ do início (MEI)
    const opened = g(r, 'opened'); const y = (opened.match(/(\d{4})/) || [])[1];
    const cap = Number(String(g(r, 'capital')).replace(/\./g, '').replace(',', '.')) || 0;
    const nature = g(r, 'nature');
    return {
      name: titleCase(name), phone: normPhone(g(r, 'ddd1'), g(r, 'tel1')), phone2: normPhone(g(r, 'ddd2') || g(r, 'ddd1'), g(r, 'tel2')),
      email: g(r, 'email').toLowerCase(), city: titleCase(g(r, 'city')), uf: g(r, 'uf').toUpperCase().slice(0, 2), bairro: titleCase(g(r, 'bairro')),
      cnpj: digits(g(r, 'cnpj')), nature, indiv: /individual|mei\b/i.test(nature), capital: cap, openedYear: y ? +y : null,
      porte: g(r, 'porte'), socios: g(r, 'socios'), cnae: g(r, 'cnae'),
    };
  }).filter((l) => l.name && (l.phone || l.phone2));
}
function leadScore(l) { const age = l.openedYear ? new Date().getFullYear() - l.openedYear : 0; return Math.min(l.capital || 0, 500000) / 5000 + age * 6 + (l.indiv ? 0 : 25) + (isMobile(l.phone) ? 5 : 0); }

// ---------- modal de importação ----------
function importForm() {
  ui.imp = null;
  modal(`<div class="imp"><h2>Importar leads</h2>
    <p class="muted">Arquivo do Kenai (Excel), CSV ou linhas copiadas de uma planilha (com o cabeçalho).</p>
    <label class="btn primary imp-file">Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv,.txt" data-act="impFile" hidden></label>
    <details class="imp-paste"><summary>ou colar linhas da planilha</summary><textarea id="impPaste" rows="5" placeholder="Copie as linhas (com o cabeçalho) e cole aqui"></textarea><button class="btn sm" data-act="impPaste">Ler linhas coladas</button></details>
    <div id="impBody"></div>
    <div class="btns end"><button type="button" class="btn" data-act="closeModal">Cancelar</button></div></div>`);
}
async function impLoad(rows) {
  const all = mapLeads(rows);
  if (!all.length) { $('#impBody').innerHTML = empty('Não encontrei nome e telefone nas colunas. Confira se a primeira linha tem os títulos.', 'alert'); return; }
  const have = new Set(); S.clinics.forEach((c) => { if (c.cnpj) have.add('c' + c.cnpj); if (c.phone) have.add('p' + digits(c.phone)); });
  all.forEach((l) => (l.dup = (l.cnpj && have.has('c' + l.cnpj)) || (l.phone && have.has('p' + l.phone))));
  const cities = {}; all.forEach((l) => { if (l.city) cities[l.city] = (cities[l.city] || 0) + 1; });
  const cnaes = {}; all.forEach((l) => { const k = (l.cnae || '').replace(/^\d+\s*-\s*/, '').trim(); if (k) cnaes[k] = (cnaes[k] || 0) + 1; });
  ui.imp = { all, cities: Object.entries(cities).sort((a, b) => b[1] - a[1]), cnaes: Object.entries(cnaes).sort((a, b) => b[1] - a[1]).slice(0, 8), f: { noIndiv: true, minAge: 2, minCap: 0, city: '', cnae: '' }, perDay: S.settings.goals.calls || 30, start: nextWeekday(todayStr()), qty: null };
  impRender();
}
function impFiltered() {
  const { all, f } = ui.imp; const yNow = new Date().getFullYear();
  return all.filter((l) => !l.dup && (!f.noIndiv || !l.indiv) && (!f.minAge || (l.openedYear && yNow - l.openedYear >= f.minAge)) && (!f.minCap || l.capital >= f.minCap) && (!f.city || l.city === f.city) && (!f.cnae || (l.cnae || '').includes(f.cnae)))
    .sort((a, b) => leadScore(b) - leadScore(a));
}
function impRender() {
  if (Sync.enabled()) return impRenderBase();
  const im = ui.imp; const list = impFiltered(); const f = im.f;
  const qty = Math.min(im.qty ?? Math.min(list.length, 600), list.length, IMPORT_MAX);
  const days = Math.ceil(qty / Math.max(1, im.perDay)); const end = qty ? addWeekdays(im.start, Math.max(0, days - 1)) : im.start;
  const dups = im.all.filter((l) => l.dup).length; const indiv = im.all.filter((l) => l.indiv).length;
  $('#impBody').innerHTML = `
    <div class="imp-sum"><b>${im.all.length.toLocaleString('pt-BR')}</b> com nome e telefone · ${indiv.toLocaleString('pt-BR')} MEI/individual${dups ? ` · ${dups} já estão no app` : ''}</div>
    <h4>Filtrar pelo perfil do seu cliente</h4>
    <div class="imp-f">
      <label class="chkl"><input type="checkbox" data-imp="noIndiv" ${f.noIndiv ? 'checked' : ''}> Tirar MEI / empresário individual</label>
      <label><span>Aberta há pelo menos</span><select data-imp="minAge">${opt([[0, 'qualquer tempo'], [1, '1 ano'], [2, '2 anos'], [3, '3 anos'], [5, '5 anos']].map(([v, l]) => [String(v), l]), String(f.minAge))}</select></label>
      <label><span>Capital social mínimo</span><select data-imp="minCap">${opt([[0, 'qualquer'], [10000, 'R$ 10 mil'], [50000, 'R$ 50 mil'], [100000, 'R$ 100 mil']].map(([v, l]) => [String(v), l]), String(f.minCap))}</select></label>
      ${im.cnaes.length > 1 ? `<label><span>Atividade (CNAE)</span><select data-imp="cnae"><option value="">Todas</option>${im.cnaes.map(([c, n]) => `<option value="${esc(c)}"${c === f.cnae ? ' selected' : ''}>${esc(c.length > 48 ? c.slice(0, 47) + '…' : c)} (${n})</option>`).join('')}</select></label>` : ''}
      <label><span>Cidade</span><select data-imp="city"><option value="">Todas</option>${im.cities.slice(0, 60).map(([c, n]) => `<option value="${esc(c)}"${c === f.city ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('')}</select></label>
    </div>
    <div class="imp-res"><b>${list.length.toLocaleString('pt-BR')}</b> clínicas no perfil <small>(as mais estruturadas primeiro)</small></div>
    ${list.length ? `<ul class="imp-prev">${list.slice(0, 5).map((l) => `<li><b>${esc(l.name)}</b><small>${esc(l.city)}${l.openedYear ? ' · desde ' + l.openedYear : ''}${l.capital ? ' · capital ' + money(l.capital) : ''} · ${fmtPhone(l.phone)}</small></li>`).join('')}</ul>` : ''}
    <h4>Montar a fila de ligações</h4>
    <div class="imp-f">
      <label><span>Quantas importar</span><input type="number" min="1" max="${Math.min(list.length, IMPORT_MAX)}" data-imp="qty" value="${qty}"></label>
      <label><span>Leads por dia</span><input type="number" min="1" max="200" data-imp="perDay" value="${im.perDay}"></label>
      <label><span>Começar em</span><input type="date" data-imp="start" value="${im.start}"></label>
    </div>
    <p class="hint">${qty ? `${qty.toLocaleString('pt-BR')} leads em ${days} dias úteis — de ${fmtDate(im.start)} até ${fmtDate(end)}. Sábados e domingos ficam de fora.` : 'Nenhum lead no filtro.'}${list.length > IMPORT_MAX ? ` Máximo de ${IMPORT_MAX} por vez para o app continuar leve.` : ''}</p>
    <div class="btns end"><button class="btn primary" data-act="impGo" ${qty ? '' : 'disabled'}>Importar ${qty.toLocaleString('pt-BR')} leads</button></div>`;
}
function impGo() {
  const im = ui.imp; const list = impFiltered(); const qty = Math.min(im.qty ?? Math.min(list.length, 600), list.length, IMPORT_MAX);
  const batch = uid(); let day = nextWeekday(im.start), inDay = 0;
  list.slice(0, qty).forEach((l) => {
    if (inDay >= im.perDay) { day = addWeekdays(day, 1); inDay = 0; }
    S.clinics.push({ id: uid(), createdAt: new Date().toISOString(), name: l.name, phone: fmtPhone(l.phone), phone2: l.phone2 ? fmtPhone(l.phone2) : '', email: l.email, city: l.city, uf: l.uf, bairro: l.bairro,
      cnpj: l.cnpj, capital: l.capital || null, openedYear: l.openedYear, nature: l.nature, segment: 'estetica', stage: 'lead', price: 2500, setupFee: 1500, setupWaived: false, mediaBudget: null,
      startDate: todayStr(), payment: 'na', exclusivity: 'nao_solicitada', guarantee: 'em_definicao', nextAction: 'Primeira ligação', nextDate: day, leadLog: [], source: 'Importação', batch });
    inDay++;
  });
  log(`Importou ${qty} leads (fila de ${im.perDay} por dia a partir de ${fmtDate(im.start)})`); closeModal(); saveNow(); ui.imp = null;
  toast(`${qty} leads importados`); go('#/leads');
}

function impRenderBase() {
  const im = ui.imp; const ufs = {}; im.all.forEach((l) => (ufs[l.uf || '??'] = (ufs[l.uf || '??'] || 0) + 1));
  const indiv = im.all.filter((l) => l.indiv).length;
  $('#impBody').innerHTML = `
    <div class="imp-sum"><b>${im.all.length.toLocaleString('pt-BR')}</b> clínicas com nome e telefone · ${indiv.toLocaleString('pt-BR')} MEI/individual</div>
    <p>${Object.entries(ufs).map(([u, n]) => `<b>${esc(u)}</b>: ${n.toLocaleString('pt-BR')}`).join(' · ')}</p>
    <p class="hint">Todas vão para a <b>base de leads</b> (separada por estado, sem repetir quem já está lá). Depois você monta a fila por cidade e por pessoa.</p>
    <div class="btns end"><button class="btn primary" data-act="impBase">Enviar ${im.all.length.toLocaleString('pt-BR')} para a base</button></div>`;
}
async function impBase() {
  const b = $('[data-act="impBase"]'); if (b) { b.disabled = true; b.textContent = 'Enviando…'; }
  try { const rep = await Pool.merge(ui.imp.all); closeModal(); ui.imp = null;
    toast(Object.entries(rep).map(([u, r]) => `${u}: +${r.add}`).join(' · ') || 'Nada novo'); if (route.name === 'leads') poolPanel(); else go('#/leads');
  } catch (e) { alert('Não consegui enviar: ' + e.message); if (b) { b.disabled = false; b.textContent = 'Tentar de novo'; } }
}

// ---------- registrar resultado ----------
function applyLeadResult(c, res, nextDate, nextAction, note) {
  const r = prospRec(); if (res === 'mensagem') r.msgs = (r.msgs || 0) + 1; else r.calls++; if (!(c.leadLog || []).length) r.news = (r.news || 0) + 1;
  if (!['sem_resposta', 'mensagem'].includes(res)) r.convos++; if (res === 'apresentacao') r.pres++;
  c.leadLog = c.leadLog || []; c.leadLog.unshift({ at: new Date().toISOString(), who: S.me, result: res, note: note || '' });
  if (res === 'sem_interesse') { c.stage = 'encerrado'; c.nextDate = null; c.nextAction = ''; }
  else {
    c.nextDate = nextDate || addWeekdays(todayStr(), 2); c.nextAction = nextAction || ({ sem_resposta: 'Tentar de novo', mensagem: 'Ver resposta da mensagem', conversa: 'Retomar conversa', apresentacao: 'Diagnóstico', proposta: 'Enviar proposta' }[res] || '');
    if (res === 'proposta' && ['lead', 'negociacao'].includes(c.stage)) c.stage = 'proposta';
    if (res === 'apresentacao' && c.stage === 'lead') c.stage = 'negociacao';
  }
  log(`Contato com ${c.name}: ${RESULTS.find((x) => x[0] === res)[1]}`, c.id);
}

// ---------- fila e Modo ligação ----------
function leadQueue() {
  const t = todayStr();
  return leadClinics().filter((c) => mine(c) && c.nextDate && c.nextDate <= t).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || (b.capital || 0) - (a.capital || 0));
}
function openCallMode() { ui.callSkip = new Set(); ui.callDone = 0; $('#callMode').hidden = false; document.body.classList.add('noscroll'); callRender(); }
function closeCallMode() { $('#callMode').hidden = true; document.body.classList.remove('noscroll'); rerender(); }
function callRender() {
  const q = leadQueue().filter((c) => !ui.callSkip.has(c.id)); const c = q[0]; const r = prospRec(); const g = S.settings.goals;
  const el = $('#callMode');
  if (!c) {
    el.innerHTML = `<div class="cm"><div class="cm-top"><b>Modo ligação</b><button class="btn sm" data-act="callClose">Fechar</button></div>
      <div class="cm-end"><div class="th-num">✓</div><h2>Fila de hoje concluída</h2><p>${pl(ui.callDone, 'contato registrado', 'contatos registrados')} agora · hoje: ${pl(r.calls, 'ligação', 'ligações')}, ${pl(r.convos, 'conversa', 'conversas')}, ${pl(r.pres, 'apresentação', 'apresentações')}.</p>
      ${ui.callSkip.size ? `<button class="btn" data-act="callUnskip">Voltar aos ${ui.callSkip.size} pulados</button>` : ''}<button class="btn primary" data-act="callClose">Concluir</button></div></div>`;
    return;
  }
  const yNow = new Date().getFullYear();
  const meta = [c.openedYear && `desde ${c.openedYear} (${yNow - c.openedYear} anos)`, c.capital && `capital ${money(c.capital)}`, c.nature && c.nature.replace(/^\d+\s*-\s*/, '')].filter(Boolean);
  const last = (c.leadLog || [])[0];
  el.innerHTML = `<div class="cm">
    <div class="cm-top"><b>Modo ligação</b><span class="cm-prog">${r.calls}/${g.calls} ligações · faltam ${q.length} na fila</span><button class="btn sm" data-act="callClose">Fechar</button></div>
    <div class="cm-grid">
      <section class="cm-card">
        <small class="cm-eyebrow">${c.nextDate < todayStr() ? `ATRASADO DESDE ${fmtShort(c.nextDate)}` : 'PARA HOJE'} · ${esc(c.nextAction || 'Primeira ligação')}</small>
        <h2>${esc(c.name)}</h2>
        ${c.city ? `<p class="cm-city">📍 <b>${esc(c.city)}${c.uf ? '/' + esc(c.uf) : ''}</b>${c.bairro ? ' · ' + esc(c.bairro) : ''}</p>` : ''}
        <p class="cm-meta">${meta.map(esc).join(' · ')}</p>
        ${last ? `<p class="cm-last">Último contato (${fmtShort(last.at.slice(0, 10))}): <b>${esc(RESULTS.find((x) => x[0] === last.result)?.[1] || '')}</b> ${esc(last.note || '')}</p>` : ''}
        <div class="cm-call">
          ${c.phone ? `<a class="btn primary big" href="tel:+55${digits(c.phone)}">📞 ${esc(c.phone)}</a>` : ''}
          ${c.phone && isMobile(c.phone) ? `<a class="btn big" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${c.phone2 ? `<a class="btn" href="tel:+55${digits(c.phone2)}">📞 ${esc(c.phone2)}</a>` : ''}
          ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">E-mail</a>` : ''}
        </div>
        <h4>Como foi?</h4>
        <div class="cm-res">
          <button class="btn" data-act="callRes" data-r="sem_resposta">Não atendeu</button>
          <button class="btn" data-act="callRes" data-r="conversa">Conversei</button>
          <button class="btn ok" data-act="callRes" data-r="apresentacao">Apresentação marcada</button>
          <button class="btn ok" data-act="callRes" data-r="proposta">Pediu proposta</button>
          <button class="btn danger" data-act="callRes" data-r="sem_interesse">Sem interesse</button>
        </div>
        <div class="cm-opts">
          <label><span>Próximo contato</span><input type="date" id="cmDate" value="${addWeekdays(todayStr(), 2)}"></label>
          <label class="full"><span>Anotação (opcional)</span><input id="cmNote" placeholder="Ex.: falar com a Dra. depois das 16h"></label>
        </div>
        <div class="cm-foot"><button class="btn sm ghost" data-act="callSkip">Pular este lead</button><button class="btn sm ghost" data-act="callOpen" data-id="${c.id}">Abrir ficha</button></div>
      </section>
      <details class="cm-script" ${ui.scriptOpen === false ? '' : 'open'}><summary>Roteiro e objeções</summary><pre>${esc(S.settings.script || SCRIPT_DEFAULT)}</pre></details>
    </div></div>`;
}
function callResult(res) {
  const c = leadQueue().filter((x) => !ui.callSkip.has(x.id))[0]; if (!c) return;
  let d = $('#cmDate') ? $('#cmDate').value : ''; if (d && [0, 6].includes(parseD(d).getDay())) d = nextWeekday(d);
  if (res === 'sem_resposta' && (!d || d === addWeekdays(todayStr(), 2))) d = addWeekdays(todayStr(), 2);
  applyLeadResult(c, res, d, '', $('#cmNote') ? $('#cmNote').value.trim() : '');
  ui.callDone++; save(); toast(RESULTS.find((x) => x[0] === res)[1]); callRender();
}

// ---------- página de leads ----------
VIEWS.leads = () => {
  const t = todayStr(); const lw = ui.lw || 'me'; const all = leadClinics().filter((c) => lw === 'all' || mine(c)); const q = ui.lq || '';
  const today = all.filter((c) => c.nextDate && c.nextDate <= t);
  const week = all.filter((c) => c.nextDate && c.nextDate > t && c.nextDate <= addDays(t, 7));
  const lost = S.clinics.filter((c) => c.stage === 'encerrado' && (c.leadLog || []).length).length;
  const f = ui.lf || 'hoje';
  let list = f === 'hoje' ? today : f === 'semana' ? week : f === 'sem' ? all.filter((c) => !c.nextDate) : all;
  if (q) { const s = noAcc(q); list = list.filter((c) => noAcc(c.name).includes(s) || noAcc(c.city).includes(s) || digits(c.phone).includes(digits(q) || '#')); }
  if (ui.lcity) list = list.filter((c) => c.city === ui.lcity);
  list = [...list].sort((a, b) => (a.nextDate || '9').localeCompare(b.nextDate || '9'));
  const cities = [...new Set(all.map((c) => c.city).filter(Boolean))].sort();
  view().innerHTML = `
    <section class="card"><header><h3>Base de leads</h3><button class="btn sm" data-act="impOpen">Importar lista</button></header><div id="poolBox"></div></section>
    <div class="page-h"><div class="seg">${[['me', 'Minha fila (' + S.me + ')'], ['all', 'Todos']].map(([k, l]) => `<button aria-selected="${lw === k}" data-act="lw" data-w="${k}">${esc(l)}</button>`).join('')}</div>
      <span class="btns" style="margin:0"><button class="btn" data-act="leadNew">+ Lead</button><button class="btn primary" data-act="callStart">▶ Modo ligação (${today.length})</button></span></div>
    <div class="kpis k4">
      <div class="kpi"><span>Na fila de hoje</span><b>${today.length}</b><em>incluindo atrasados</em></div>
      <div class="kpi"><span>Próximos 7 dias</span><b>${week.length}</b><em>já agendados</em></div>
      <div class="kpi"><span>Leads ativos</span><b>${all.length.toLocaleString('pt-BR')}</b><em>lead, negociação e proposta</em></div>
      <div class="kpi"><span>Sem interesse</span><b>${lost}</b><em>fora da fila</em></div>
    </div>
    <div class="seg wrap">${[['hoje', 'Hoje'], ['semana', 'Próximos 7 dias'], ['todos', 'Todos'], ['sem', 'Sem data']].map(([k, l]) => `<button aria-selected="${f === k}" data-act="lf" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="filters"><input type="search" placeholder="Buscar nome, cidade ou telefone" value="${esc(q)}" data-act="lq" aria-label="Buscar lead">
      <select data-act="lcity" aria-label="Cidade"><option value="">Cidade: todas</option>${cities.map((c) => `<option${c === ui.lcity ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${f === 'hoje' && today.some((c) => c.nextDate < t) ? `<button class="btn sm" data-act="leadsToday">Trazer atrasados para hoje</button>` : ''}</div>
    <section class="card">${list.length ? `<ul class="tlist leads">${list.slice(0, 200).map((c) => `<li class="lrow">
      <button class="trow-b" data-act="leadContact" data-id="${c.id}"><span class="trow-t">${esc(c.name)}</span>
        <span class="trow-s">${lw === 'all' && c.owner ? `<b>${esc(c.owner)}</b> · ` : ''}${c.city ? `<b class="lcity">📍 ${esc(c.city)}${c.uf ? '/' + esc(c.uf) : ''}</b> · ` : ''}${esc([stageLabel(c.stage), c.phone].filter(Boolean).join(' · '))}${c.leadLog && c.leadLog[0] ? ' · último: ' + esc(RESULTS.find((x) => x[0] === c.leadLog[0].result)?.[1] || '') : ''}</span></button>
      <span class="lr-date ${c.nextDate && c.nextDate < t ? 'late' : ''}">${c.nextDate ? fmtShort(c.nextDate) : '—'}</span></li>`).join('')}</ul>${list.length > 200 ? `<p class="hint">Mostrando 200 de ${list.length}. Use a busca ou a cidade.</p>` : ''}` : empty(f === 'hoje' ? 'Nenhum lead para hoje. Importe uma lista ou cadastre um lead.' : 'Nenhum lead aqui.', 'clinicas')}</section>
    <section class="card"><header><h3>Roteiro e objeções</h3></header><pre class="script-pre">${esc(S.settings.script || SCRIPT_DEFAULT)}</pre><p class="hint">Edite em Configurações → Roteiro de ligação.</p></section>`;
  setTimeout(poolPanel, 0);
};

// =====================================================================
// BASE DE LEADS por estado (arquivos leads/UF.json no repositório privado)
// =====================================================================
const CNAE_LABEL = { '9602502': 'Estética', '8630501': 'Clínica médica (procedimentos)', '8630502': 'Clínica médica (exames)', '8630503': 'Clínica médica (consultas)', '8630504': 'Odontologia',
  '8650099': 'Profissionais de saúde', '8640202': 'Laboratório', '8650004': 'Fisioterapia', '8650003': 'Psicologia', '8690901': 'Práticas integrativas', '9602501': 'Cabeleireiro / manicure', '8650001': 'Enfermagem', '8650002': 'Nutrição' };
const cnaeLabel = (c) => CNAE_LABEL[c] || (c ? 'CNAE ' + c : 'Sem CNAE');
const Pool = {
  idx: null, idxAt: 0, data: {},
  url(path) { return `https://api.github.com/repos/${Sync.cfg().repo}/contents/${path}`; },
  async get(path) {
    const r = await fetch(this.url(path) + '?t=' + Date.now(), { headers: Sync.headers(false), cache: 'no-store' });
    if (r.status === 404) return { sha: null, obj: null };
    if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
    const j = await r.json(); let text;
    if (j.content && j.encoding === 'base64') text = b64decode(j.content);
    else text = await (await fetch(this.url(path) + '?t=' + Date.now(), { headers: Sync.headers(true), cache: 'no-store' })).text();
    return { sha: j.sha, obj: JSON.parse(text) };
  },
  async put(path, obj, sha, msg) {
    const body = { message: msg, content: b64encode(JSON.stringify(obj)) }; if (sha) body.sha = sha;
    const r = await fetch(this.url(path), { method: 'PUT', headers: { ...Sync.headers(false), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Não consegui salvar ' + path + ' (' + r.status + ')');
    return (await r.json()).content.sha;
  },
  async index(force) {
    if (!force && this.idx && Date.now() - this.idxAt < 300000) return this.idx;
    const { sha, obj } = await this.get('leads/index.json'); this.idx = obj || { v: 1, states: {} }; this.idxSha = sha; this.idxAt = Date.now(); return this.idx;
  },
  async state(uf, force) {
    if (!force && this.data[uf]) return this.data[uf];
    const { sha, obj } = await this.get(`leads/${uf}.json`); this.data[uf] = { sha, obj: obj || { v: 1, uf, cols: ['k', 'n', 'p', 'p2', 'e', 'c', 'b', 'cap', 'y', 'i', 'cnae', 'uf'], rows: [] } }; return this.data[uf];
  },
  worked(uf) { const s = new Set(); S.clinics.forEach((c) => { if (c.poolKey && (!uf || c.uf === uf)) s.add(c.poolKey); }); return s; },
  // mescla leads novos (formato mapLeads) na base e atualiza o índice
  async merge(list) {
    const byUf = {}; list.forEach((l) => (byUf[l.uf || 'XX'] = byUf[l.uf || 'XX'] || []).push(l));
    await this.index(true); const rep = {};
    for (const [uf, arr] of Object.entries(byUf)) {
      const st = await this.state(uf, true); const rows = st.obj.rows;
      const seen = new Set(rows.map((r) => r[0])); const seenP = new Set(rows.map((r) => r[2]).filter(Boolean)); let add = 0;
      arr.forEach((l) => { const k = l.cnpj || 'p' + l.phone; if (seen.has(k) || (l.phone && seenP.has(l.phone))) return;
        rows.push([k, l.name, l.phone, l.phone2 && l.phone2 !== l.phone ? l.phone2 : '', l.email, l.city, l.bairro, Math.round(l.capital || 0), l.openedYear || 0, l.indiv ? 1 : 0, digits(l.cnae).slice(0, 7), uf]); seen.add(k); if (l.phone) seenP.add(l.phone); add++; });
      st.obj.updatedAt = new Date().toISOString();
      st.sha = await this.put(`leads/${uf}.json`, st.obj, st.sha, `Base de leads ${uf}: +${add}`);
      const cities = {}; rows.forEach((r) => (cities[r[5]] = (cities[r[5]] || 0) + 1));
      this.idx.states[uf] = { file: `leads/${uf}.json`, count: rows.length, updatedAt: st.obj.updatedAt, cities: Object.fromEntries(Object.entries(cities).sort((a, b) => b[1] - a[1])) };
      rep[uf] = { add, total: rows.length };
    }
    this.idx.updatedAt = new Date().toISOString(); this.idxSha = await this.put('leads/index.json', this.idx, this.idxSha, 'Índice da base de leads'); this.idxAt = Date.now();
    return rep;
  },
};
const rowScore = (r) => { const age = r[8] ? new Date().getFullYear() - r[8] : 0; return Math.min(r[7] || 0, 500000) / 5000 + age * 6 + (r[9] ? 0 : 25) + (digits(r[2]).length === 11 ? 5 : 0); };

// ---------- painel da base (na página Prospecção) ----------
async function poolPanel() {
  const box = $('#poolBox'); if (!box) return;
  if (!Sync.enabled()) { box.innerHTML = `<div class="notice">A base de leads fica no seu repositório privado. Conecte a sincronização em <a href="#/config">Configurações</a> para usar.</div>`; return; }
  box.innerHTML = '<p class="hint">Carregando a base de leads…</p>';
  try {
    const idx = await Pool.index(); const ufs = Object.entries(idx.states || {}).sort((a, b) => b[1].count - a[1].count);
    if (!ufs.length) { box.innerHTML = empty('A base está vazia. Importe uma lista (Kenai, Excel ou CSV).', 'leads'); return; }
    const w = {}; S.clinics.forEach((c) => { if (c.poolKey) w[c.uf] = (w[c.uf] || 0) + 1; });
    box.innerHTML = `<div class="pool">${ufs.map(([uf, st]) => { const done = w[uf] || 0; const pct = st.count ? done / st.count : 0;
      return `<div class="pool-uf"><div class="pool-h"><b>${uf}</b><span>${st.count.toLocaleString('pt-BR')} clínicas · ${Object.keys(st.cities).length} cidades</span></div>
        <div class="bar"><i style="width:${Math.max(1, pct * 100)}%"></i></div>
        <small>${done.toLocaleString('pt-BR')} já na fila ou trabalhadas · <b>${(st.count - done).toLocaleString('pt-BR')} disponíveis</b></small>
        <div class="pool-top">${Object.entries(st.cities).slice(0, 4).map(([c, n]) => `<span>${esc(c)} ${n}</span>`).join('')}</div>
        <button class="btn primary sm" data-act="queueOpen" data-uf="${uf}">Montar fila em ${uf}</button></div>`; }).join('')}</div>`;
  } catch (e) { box.innerHTML = `<div class="notice warn">Não consegui carregar a base: ${esc(e.message)}</div>`; }
}

// ---------- montar fila (por pessoa e cidade) ----------
async function queueForm(uf) {
  modal(`<div class="imp"><h2>Montar fila — ${uf}</h2><div id="qBody"><p class="hint">Carregando ${uf}…</p></div></div>`);
  try {
    const st = await Pool.state(uf); const worked = Pool.worked();
    const avail = st.obj.rows.filter((r) => !worked.has(r[0]));
    const cities = {}; avail.forEach((r) => (cities[r[5]] = (cities[r[5]] || 0) + 1));
    const cnaes = {}; avail.forEach((r) => (cnaes[r[10]] = (cnaes[r[10]] || 0) + 1));
    ui.q = { uf, avail, cities: Object.entries(cities).sort((a, b) => b[1] - a[1]), cnaes: Object.entries(cnaes).sort((a, b) => b[1] - a[1]).slice(0, 10),
      f: { who: S.me, sel: [], cs: '', noIndiv: true, minAge: 2, cnae: cnaes['9602502'] ? '9602502' : '' }, perDay: S.settings.goals.calls || 30, qty: null, start: nextWeekday(todayStr()) };
    qRender();
  } catch (e) { $('#qBody').innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; }
}
function qFiltered() {
  const q = ui.q, f = q.f, y = new Date().getFullYear(); const sel = new Set(f.sel);
  return q.avail.filter((r) => (!sel.size || sel.has(r[5])) && (!f.noIndiv || !r[9]) && (!f.minAge || (r[8] && y - r[8] >= f.minAge)) && (!f.cnae || r[10] === f.cnae)).sort((a, b) => rowScore(b) - rowScore(a));
}
function qRender() {
  const q = ui.q, f = q.f; const list = qFiltered(); const qty = Math.min(q.qty ?? q.perDay * 10, list.length);
  const days = Math.ceil(qty / Math.max(1, q.perDay)); const end = qty ? addWeekdays(nextWeekday(q.start), Math.max(0, days - 1)) : q.start;
  const cs = noAcc(f.cs); const shown = q.cities.filter(([c]) => !cs || noAcc(c).includes(cs)).slice(0, 80);
  $('#qBody').innerHTML = `
    <div class="imp-f">
      <label><span>Quem vai ligar</span><select data-q="who">${optS(['Tiago', 'Micaela'], f.who)}</select></label>
      <label><span>Atividade</span><select data-q="cnae"><option value="">Todas</option>${q.cnaes.map(([c, n]) => `<option value="${c}"${c === f.cnae ? ' selected' : ''}>${esc(cnaeLabel(c))} (${n})</option>`).join('')}</select></label>
      <label class="chkl"><input type="checkbox" data-q="noIndiv" ${f.noIndiv ? 'checked' : ''}> Tirar MEI / individual</label>
      <label><span>Aberta há pelo menos</span><select data-q="minAge">${opt([['0', 'qualquer tempo'], ['1', '1 ano'], ['2', '2 anos'], ['3', '3 anos'], ['5', '5 anos']], String(f.minAge))}</select></label>
    </div>
    <h4>Cidades <small>${f.sel.length ? `${f.sel.length} escolhida(s) · <button class="lnk" data-act="qClear">limpar</button>` : 'todas do estado'}</small></h4>
    <input type="search" data-q="cs" placeholder="Buscar cidade" value="${esc(f.cs)}" class="q-cs">
    <div class="q-cities">${shown.map(([c, n]) => `<label class="chip ${f.sel.includes(c) ? 'on' : ''}"><input type="checkbox" data-q="city" value="${esc(c)}" ${f.sel.includes(c) ? 'checked' : ''} hidden>${esc(c)} <small>${n}</small></label>`).join('')}</div>
    <div class="imp-res"><b>${list.length.toLocaleString('pt-BR')}</b> clínicas disponíveis no filtro <small>(as mais estruturadas primeiro)</small></div>
    ${list.length ? `<ul class="imp-prev">${list.slice(0, 4).map((r) => `<li><b>${esc(r[1])}</b><small>📍 ${esc(r[5])}${r[8] ? ' · desde ' + r[8] : ''}${r[7] ? ' · capital ' + money(r[7]) : ''} · ${esc(cnaeLabel(r[10]))}</small></li>`).join('')}</ul>` : ''}
    <div class="imp-f">
      <label><span>Quantas colocar na fila</span><input type="number" min="1" data-q="qty" value="${qty}"></label>
      <label><span>Por dia</span><input type="number" min="1" max="200" data-q="perDay" value="${q.perDay}"></label>
      <label><span>Começar em</span><input type="date" data-q="start" value="${q.start}"></label>
    </div>
    <p class="hint">${qty ? `Fila de <b>${f.who}</b>: ${qty.toLocaleString('pt-BR')} clínicas em ${days} dias úteis, de ${fmtDate(nextWeekday(q.start))} até ${fmtDate(end)}.` : 'Nenhuma clínica no filtro.'} As demais continuam na base para as próximas filas.</p>
    <div class="btns end"><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="qGo" ${qty ? '' : 'disabled'}>Criar fila (${qty.toLocaleString('pt-BR')})</button></div>`;
}
function qGo() {
  const q = ui.q; const list = qFiltered(); const qty = Math.min(q.qty ?? q.perDay * 10, list.length);
  let day = nextWeekday(q.start), inDay = 0; const who = q.f.who;
  list.slice(0, qty).forEach((r) => {
    if (inDay >= q.perDay) { day = addWeekdays(day, 1); inDay = 0; }
    S.clinics.push({ id: uid(), createdAt: new Date().toISOString(), poolKey: r[0], name: r[1], phone: fmtPhone(r[2]), phone2: r[3] ? fmtPhone(r[3]) : '', email: r[4], city: r[5], bairro: r[6], uf: q.uf,
      cnpj: /^p/.test(r[0]) ? '' : r[0], capital: r[7] || null, openedYear: r[8] || null, indiv: !!r[9], cnae: r[10], segment: r[10] === '8630504' ? 'odontologia' : 'estetica', stage: 'lead', owner: who,
      price: 2500, setupFee: 1500, setupWaived: false, mediaBudget: null, startDate: todayStr(), payment: 'na', exclusivity: 'nao_solicitada', guarantee: 'em_definicao', nextAction: 'Primeira ligação', nextDate: day, leadLog: [], source: 'Base ' + q.uf });
    inDay++;
  });
  log(`Fila de ${who}: ${qty} clínicas de ${q.uf}${q.f.sel.length ? ' (' + q.f.sel.join(', ') + ')' : ''}, ${q.perDay} por dia`); closeModal(); saveNow(); ui.q = null;
  toast(`Fila criada: ${qty} clínicas para ${who}`); if (route.name === 'leads') render(); else go('#/leads');
}

// =====================================================================
// PROSPECÇÃO POR CIDADE (estado → cidade → ligar). Substitui "montar fila".
// =====================================================================
const PF_KEY = 'roity-pf';
function pf() { try { return Object.assign({ cnae: '9602502', noIndiv: true, minAge: 2 }, JSON.parse(localStorage.getItem(PF_KEY) || '{}')); } catch (e) { return { cnae: '9602502', noIndiv: true, minAge: 2 }; } }
function pfSet(v) { try { localStorage.setItem(PF_KEY, JSON.stringify(v)); } catch (e) {} }
const inProfile = (r, f) => { const y = new Date().getFullYear(); return (!f.noIndiv || !r[9]) && (!f.minAge || (r[8] && y - r[8] >= f.minAge)) && (!f.cnae || r[10] === f.cnae); };
const cityKey = (uf, city) => uf + '|' + city;
function cityOwner(uf, city) { return (S.cityOwner || {})[cityKey(uf, city)] || ''; }
function setCityOwner(uf, city, who) { S.cityOwner = S.cityOwner || {}; if (who) S.cityOwner[cityKey(uf, city)] = who; else delete S.cityOwner[cityKey(uf, city)]; }
function workedMap() { const m = new Map(); S.clinics.forEach((c) => { if (c.poolKey) m.set(c.poolKey, c); }); return m; }
const touched = (c) => c && ((c.leadLog || []).length || c.stage !== 'lead');
function leadFromRow(uf, r) {
  return { id: uid(), createdAt: new Date().toISOString(), poolKey: r[0], name: r[1], phone: fmtPhone(r[2]), phone2: r[3] ? fmtPhone(r[3]) : '', email: r[4], city: r[5], bairro: r[6], uf,
    cnpj: /^p/.test(r[0]) ? '' : r[0], capital: r[7] || null, openedYear: r[8] || null, indiv: !!r[9], cnae: r[10], segment: r[10] === '8630504' ? 'odontologia' : 'estetica', stage: 'lead', owner: S.me,
    price: 2500, setupFee: 1500, setupWaived: false, mediaBudget: null, startDate: todayStr(), payment: 'na', exclusivity: 'nao_solicitada', guarantee: 'em_definicao', nextAction: 'Primeira ligação', nextDate: todayStr(), leadLog: [], source: 'Base ' + uf };
}
function ensureLead(uf, key) {
  const ex = S.clinics.find((c) => c.poolKey === key); if (ex) return ex;
  const st = Pool.data[uf]; const r = st && st.obj.rows.find((x) => x[0] === key); if (!r) return null;
  const c = leadFromRow(uf, r); S.clinics.push(c); if (!cityOwner(uf, c.city)) setCityOwner(uf, c.city, S.me); return c;
}

// ---------- página Prospecção ----------
VIEWS.leads = () => {
  const [uf0, cityEnc] = route.params; const city = cityEnc ? decodeURIComponent(cityEnc) : '';
  if (city) return cityView(uf0, city);
  const t = todayStr(); const backs = leadQueue();
  view().innerHTML = `
    ${!Sync.enabled() ? `<div class="notice">A base de leads fica no seu repositório privado. Conecte a sincronização em <a href="#/config">Configurações</a> para ver estados e cidades.</div>` : ''}
    ${backs.length ? `<section class="card ret"><header><h3>Retornos de hoje <small class="muted">${backs.length}</small></h3><button class="btn primary" data-act="callStart">▶ Ligar retornos</button></header>
      <ul class="backs">${backs.slice(0, 3).map((c) => `<li><span><b>${esc(c.name)}</b><small>📍 ${esc(c.city || '')} · ${esc(c.nextAction || 'Retornar')}${c.nextDate < t ? ` · <em>desde ${fmtShort(c.nextDate)}</em>` : ''}</small></span><span class="btns" style="margin:0"><button class="btn sm" data-act="leadContact" data-id="${c.id}">Resultado</button></span></li>`).join('')}</ul>
      ${backs.length > 3 ? `<p class="hint">+ ${backs.length - 3} no Modo ligação</p>` : ''}</section>` : ''}
    <div class="pr-head"><div class="ufs" id="ufChips"><span class="hint">Carregando estados…</span></div>
      <span class="btns" style="margin:0"><button class="btn sm" data-act="pfOpen">Filtros</button><button class="btn sm ghost" data-act="impOpen">Importar</button></span></div>
    <input type="search" class="city-search" placeholder="Buscar cidade" value="${esc(ui.cq || '')}" data-act="cq" aria-label="Buscar cidade">
    <section class="card cities" id="cityList"><p class="hint">Carregando cidades…</p></section>`;
  if (Sync.enabled()) setTimeout(loadCities, 0); else { $('#ufChips').innerHTML = ''; $('#cityList').innerHTML = empty('Conecte a sincronização para ver as cidades.', 'leads'); }
};
async function loadCities() {
  try {
    const idx = await Pool.index(); const ufs = Object.keys(idx.states || {}).sort((a, b) => idx.states[b].count - idx.states[a].count);
    if (!ufs.length) { $('#ufChips').innerHTML = ''; $('#cityList').innerHTML = empty('A base está vazia. Toque em Importar para adicionar uma lista.', 'leads'); return; }
    let uf = ui.puf; if (!uf) { try { uf = localStorage.getItem('roity-uf'); } catch (e) {} } if (!ufs.includes(uf)) uf = ufs[0]; ui.puf = uf;
    $('#ufChips').innerHTML = ufs.map((u) => `<button class="ufc ${u === uf ? 'on' : ''}" data-act="pufSel" data-uf="${u}">${u}</button>`).join('');
    const box = $('#cityList'); if (!Pool.data[uf]) box.innerHTML = `<p class="hint">Carregando ${uf}…</p>`;
    const st = await Pool.state(uf); renderCities(uf, st);
  } catch (e) { $('#cityList').innerHTML = `<div class="notice warn">Não consegui carregar a base: ${esc(e.message)}</div>`; }
}
function cityStats(uf, st) {
  const f = pf(); const wm = workedMap(); const cs = {};
  st.obj.rows.forEach((r) => { if (!inProfile(r, f)) return; const o = (cs[r[5]] = cs[r[5]] || { city: r[5], prof: 0, done: 0 }); o.prof++; if (touched(wm.get(r[0]))) o.done++; });
  return Object.values(cs).sort((a, b) => b.prof - a.prof);
}
function renderCities(uf, st) {
  const box = $('#cityList'); if (!box || route.name !== 'leads' || route.params[1]) return;
  const q = noAcc(ui.cq || ''); const all = cityStats(uf, st); const list = all.filter((c) => !q || noAcc(c.city).includes(q));
  const tot = all.reduce((a, c) => a + c.prof, 0), done = all.reduce((a, c) => a + c.done, 0);
  box.innerHTML = `<header><h3>${uf} <small class="muted">${tot.toLocaleString('pt-BR')} no perfil · ${done.toLocaleString('pt-BR')} ligadas · ${all.length} cidades</small></h3></header>
    ${list.length ? `<ul class="clist">${list.slice(0, 120).map((c) => { const ow = cityOwner(uf, c.city); const left = c.prof - c.done;
      return `<li><a href="#/leads/${uf}/${encodeURIComponent(c.city)}" class="crow">
        <span class="cname"><b>${esc(c.city)}</b><small>${left.toLocaleString('pt-BR')} a ligar${c.done ? ` · ${c.done} ligadas` : ''}</small></span>
        ${ow ? `<span class="owner ${ow === S.me ? 'me' : ''}">${esc(ow)}</span>` : '<span class="owner free">livre</span>'}
        <span class="cbar"><i style="width:${c.prof ? Math.max(2, (c.done / c.prof) * 100) : 0}%"></i></span>${icon('chev', 'chev')}</a></li>`; }).join('')}</ul>${list.length > 120 ? `<p class="hint">Mostrando 120 de ${list.length}. Use a busca.</p>` : ''}`
      : empty(q ? 'Nenhuma cidade com esse nome no perfil.' : 'Nenhuma clínica no perfil. Ajuste os filtros.', 'search')}`;
}

// ---------- tela da cidade ----------
async function cityView(uf, city) {
  view().innerHTML = `<a class="back" href="#/leads">← Cidades de ${uf}</a><div id="cityBody"><p class="hint">Carregando ${esc(city)}…</p></div>`;
  if (!Sync.enabled()) { $('#cityBody').innerHTML = empty('Conecte a sincronização para ver a base.', 'leads'); return; }
  try { const st = await Pool.state(uf); renderCity(uf, city, st); } catch (e) { $('#cityBody').innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; }
}
function renderCity(uf, city, st) {
  const box = $('#cityBody'); if (!box) return;
  const f = pf(); const wm = workedMap(); const t = todayStr();
  const rows = st.obj.rows.filter((r) => r[5] === city && inProfile(r, f)).sort((a, b) => rowScore(b) - rowScore(a));
  const todo = rows.filter((r) => !touched(wm.get(r[0])));
  const done = rows.filter((r) => touched(wm.get(r[0]))).map((r) => wm.get(r[0]));
  const logs = done.flatMap((c) => c.leadLog || []);
  const conv = done.filter((c) => (c.leadLog || []).some((l) => l.result !== 'sem_resposta')).length;
  const pres = done.filter((c) => (c.leadLog || []).some((l) => l.result === 'apresentacao' || l.result === 'proposta')).length;
  const ow = cityOwner(uf, city); const show = ui.cityShow || 30;
  const rowHTML = (r) => { const c = wm.get(r[0]); const p = fmtPhone(r[2]);
    return `<li class="lead"><div class="ld"><b>${esc(r[1])}</b><small>${esc([r[6], r[8] ? 'desde ' + r[8] : '', r[7] ? 'capital ' + money(r[7]) : ''].filter(Boolean).join(' · '))}</small>
      ${c && c.nextDate ? `<small class="ld-next">Retorno ${fmtShort(c.nextDate)}${c.nextAction ? ' · ' + esc(c.nextAction) : ''}</small>` : ''}</div>
      <div class="ld-b">${p ? `<a class="btn sm primary" href="tel:+55${digits(r[2])}" data-act="dialed" data-uf="${uf}" data-k="${esc(r[0])}">${icon('leads')}<span>Ligar</span></a>` : ''}
        ${isMobile(r[2]) ? `<a class="btn sm" href="${waLink(r[2])}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button class="btn sm" data-act="poolRes" data-uf="${uf}" data-k="${esc(r[0])}">Resultado</button></div></li>`; };
  box.innerHTML = `
    <div class="city-h"><div><h2>📍 ${esc(city)}<span class="muted">/${uf}</span></h2>
      <span class="owner ${ow === S.me ? 'me' : ow ? '' : 'free'}">${ow ? (ow === S.me ? 'Você está trabalhando aqui' : esc(ow) + ' está trabalhando aqui') : 'Cidade livre'}</span>
      ${ow === S.me ? `<button class="lnk" data-act="cityFree" data-uf="${uf}" data-c="${esc(city)}">liberar</button>` : `<button class="lnk" data-act="cityTake" data-uf="${uf}" data-c="${esc(city)}">assumir</button>`}</div></div>
    <div class="cm3"><div class="kpi"><span>A ligar</span><b>${todo.length.toLocaleString('pt-BR')}</b></div><div class="kpi"><span>Ligadas</span><b>${done.length}</b></div><div class="kpi"><span>Conversas</span><b>${conv}</b></div><div class="kpi"><span>Apresentações</span><b>${pres}</b></div></div>
    <button class="btn primary block-call" data-act="cityCall" data-uf="${uf}" data-c="${esc(city)}" ${todo.length || done.some((c) => c.nextDate && c.nextDate <= t) ? '' : 'disabled'}>▶ Ligar em sequência</button>
    <section class="card"><header><h3>A ligar <small class="muted">mais estruturadas primeiro</small></h3></header>
      ${todo.length ? `<ul class="leads-l">${todo.slice(0, show).map(rowHTML).join('')}</ul>${todo.length > show ? `<button class="btn block" data-act="cityMore">Mostrar mais (${todo.length - show})</button>` : ''}` : empty('Todas as clínicas do perfil nesta cidade já foram ligadas ✓', 'tarefas')}</section>
    ${done.length ? `<details class="card"><summary><b>Já ligadas (${done.length})</b></summary><ul class="leads-l">${done.map((c) => { const l = (c.leadLog || [])[0];
      return `<li class="lead"><div class="ld"><b>${esc(c.name)}</b><small>${l ? esc(RESULTS.find((x) => x[0] === l.result)?.[1] || '') + ' · ' + fmtShort(l.at.slice(0, 10)) : stageLabel(c.stage)}${c.nextDate ? ' · retorno ' + fmtShort(c.nextDate) : ''}</small></div>
        <div class="ld-b">${c.phone ? `<a class="btn sm" href="tel:+55${digits(c.phone)}">Ligar</a>` : ''}<button class="btn sm" data-act="leadContact" data-id="${c.id}">Resultado</button></div></li>`; }).join('')}</ul></details>` : ''}`;
}
function poolResultForm(uf, key) {
  const st = Pool.data[uf]; const r = st && st.obj.rows.find((x) => x[0] === key); if (!r) return;
  const ex = S.clinics.find((c) => c.poolKey === key);
  leadContactForm(ex || { id: '', name: r[1], phone: fmtPhone(r[2]), leadLog: [] });
  const fm = $('[data-form="leadContact"]'); if (fm && !ex) { fm.dataset.pool = key; fm.dataset.uf = uf; }
}
function pfForm() {
  const f = pf(); const st = Pool.data[ui.puf]; const cn = {}; if (st) st.obj.rows.forEach((r) => (cn[r[10]] = (cn[r[10]] || 0) + 1));
  const opts = Object.entries(cn).sort((a, b) => b[1] - a[1]).slice(0, 10);
  modal(`<form data-form="pf" class="mform"><h2>Filtros do perfil</h2><p class="full muted">Valem para estados, cidades e o Modo ligação.</p>
    <label class="full"><span>Atividade</span><select name="cnae"><option value="">Todas</option>${opts.map(([c, n]) => `<option value="${c}"${c === f.cnae ? ' selected' : ''}>${esc(cnaeLabel(c))} (${n})</option>`).join('')}</select></label>
    <label class="chkl full"><input type="checkbox" name="noIndiv" ${f.noIndiv ? 'checked' : ''}> Tirar MEI / empresário individual</label>
    <label class="full"><span>Aberta há pelo menos</span><select name="minAge">${opt([['0', 'qualquer tempo'], ['1', '1 ano'], ['2', '2 anos'], ['3', '3 anos'], ['5', '5 anos']], String(f.minAge))}</select></label>
    <div class="btns end"><button type="button" class="btn ghost" data-act="pfReset">Padrão</button><button type="button" class="btn" data-act="closeModal">Cancelar</button><button class="btn primary">Aplicar</button></div></form>`);
}

// ---------- Modo ligação (retornos ou por cidade) ----------
function callItems() {
  const t = todayStr(); const skip = ui.callSkip || new Set();
  const backs = leadQueue().filter((c) => !skip.has(c.id)).map((c) => ({ c, key: c.id }));
  if (!ui.callCity) return backs;
  const { uf, city } = ui.callCity; const st = Pool.data[uf]; if (!st) return backs;
  const f = pf(); const wm = workedMap();
  const cityBacks = backs.filter((x) => x.c.city === city && x.c.uf === uf && touched(x.c));
  const fresh = st.obj.rows.filter((r) => r[5] === city && inProfile(r, f) && !touched(wm.get(r[0])) && !skip.has(r[0])).sort((a, b) => rowScore(b) - rowScore(a)).map((r) => ({ r, uf, key: r[0] }));
  return [...cityBacks, ...fresh];
}
function openCallMode(uf, city) { ui.callSkip = new Set(); ui.callDone = 0; ui.callCity = uf && city ? { uf, city } : null; if (ui.callCity && !cityOwner(uf, city)) { setCityOwner(uf, city, S.me); save(); } $('#callMode').hidden = false; document.body.classList.add('noscroll'); callRender(); }
function callRender() {
  const items = callItems(); const it = items[0]; const r = prospRec(); const g = S.settings.goals; const el = $('#callMode');
  const where = ui.callCity ? `${esc(ui.callCity.city)}/${ui.callCity.uf}` : 'Retornos';
  if (!it) {
    el.innerHTML = `<div class="cm"><div class="cm-top"><b>Modo ligação · ${where}</b><button class="btn sm" data-act="callClose">Fechar</button></div>
      <div class="cm-end"><div class="th-num">✓</div><h2>${ui.callCity ? 'Cidade concluída' : 'Retornos de hoje concluídos'}</h2><p>${pl(ui.callDone, 'contato registrado', 'contatos registrados')} agora · hoje: ${pl(r.calls, 'ligação', 'ligações')}, ${pl(r.convos, 'conversa', 'conversas')}, ${pl(r.pres, 'apresentação', 'apresentações')}.</p>
      ${ui.callSkip.size ? `<button class="btn" data-act="callUnskip">Voltar aos ${ui.callSkip.size} pulados</button>` : ''}<button class="btn primary" data-act="callClose">Concluir</button></div></div>`;
    return;
  }
  const c = it.c; const rw = it.r; const yNow = new Date().getFullYear();
  const d = c ? { name: c.name, phone: c.phone, phone2: c.phone2, email: c.email, city: c.city, uf: c.uf, bairro: c.bairro, y: c.openedYear, cap: c.capital, next: c.nextAction, due: c.nextDate, log: (c.leadLog || [])[0] }
    : { name: rw[1], phone: fmtPhone(rw[2]), phone2: rw[3] ? fmtPhone(rw[3]) : '', email: rw[4], city: rw[5], uf: it.uf, bairro: rw[6], y: rw[8], cap: rw[7], next: 'Primeira ligação', due: todayStr(), log: null };
  const meta = [d.y && `desde ${d.y} (${yNow - d.y} anos)`, d.cap && `capital ${money(d.cap)}`].filter(Boolean);
  el.innerHTML = `<div class="cm">
    <div class="cm-top"><b>Modo ligação · ${where}</b><span class="cm-prog">${r.calls}/${g.calls} ligações hoje · faltam ${items.length}</span><button class="btn sm" data-act="callClose">Fechar</button></div>
    <div class="cm-grid"><section class="cm-card">
      <small class="cm-eyebrow">${c ? (d.due < todayStr() ? `RETORNO ATRASADO DESDE ${fmtShort(d.due)}` : 'RETORNO DE HOJE') : 'NOVA'} · ${esc(d.next || '')}</small>
      <h2>${esc(d.name)}</h2>
      ${d.city ? `<p class="cm-city">📍 <b>${esc(d.city)}${d.uf ? '/' + esc(d.uf) : ''}</b>${d.bairro ? ' · ' + esc(d.bairro) : ''}</p>` : ''}
      ${meta.length ? `<p class="cm-meta">${meta.map(esc).join(' · ')}</p>` : ''}
      ${d.log ? `<p class="cm-last">Último contato (${fmtShort(d.log.at.slice(0, 10))}): <b>${esc(RESULTS.find((x) => x[0] === d.log.result)?.[1] || '')}</b> ${esc(d.log.note || '')}</p>` : ''}
      <div class="cm-call">${d.phone ? `<a class="btn primary big" href="tel:+55${digits(d.phone)}">📞 ${esc(d.phone)}</a>` : ''}${d.phone && isMobile(d.phone) ? `<a class="btn big" href="${waLink(d.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.phone2 ? `<a class="btn" href="tel:+55${digits(d.phone2)}">📞 ${esc(d.phone2)}</a>` : ''}${d.email ? `<a class="btn" href="mailto:${esc(d.email)}">E-mail</a>` : ''}</div>
      <h4>Como foi?</h4>
      <div class="cm-res"><button class="btn" data-act="callRes" data-r="sem_resposta">Não atendeu</button><button class="btn" data-act="callRes" data-r="conversa">Conversei</button><button class="btn ok" data-act="callRes" data-r="apresentacao">Apresentação marcada</button><button class="btn ok" data-act="callRes" data-r="proposta">Pediu proposta</button><button class="btn danger" data-act="callRes" data-r="sem_interesse">Sem interesse</button></div>
      <div class="cm-opts"><label><span>Próximo contato</span><input type="date" id="cmDate" value="${addWeekdays(todayStr(), 2)}"></label><label class="full"><span>Anotação (opcional)</span><input id="cmNote" placeholder="Ex.: falar com a Dra. depois das 16h"></label></div>
      <div class="cm-foot"><button class="btn sm ghost" data-act="callSkip">Pular</button>${c ? `<button class="btn sm ghost" data-act="callOpen" data-id="${c.id}">Abrir ficha</button>` : ''}</div>
    </section><details class="cm-script" open><summary>Roteiro e objeções</summary><pre>${esc(S.settings.script || SCRIPT_DEFAULT)}</pre></details></div></div>`;
}
function callResult(res) {
  const it = callItems()[0]; if (!it) return;
  const c = it.c || ensureLead(it.uf, it.key); if (!c) return;
  let d = $('#cmDate') ? $('#cmDate').value : ''; if (d && [0, 6].includes(parseD(d).getDay())) d = nextWeekday(d);
  applyLeadResult(c, res, d, '', $('#cmNote') ? $('#cmNote').value.trim() : '');
  ui.callDone++; save(); toast(RESULTS.find((x) => x[0] === res)[1]); callRender();
}
