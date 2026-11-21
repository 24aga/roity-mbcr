// Arrastar clínicas entre as etapas do pipeline (mouse no PC, segurar e arrastar no celular).
'use strict';

function moveClinicStage(c, to) {
  if (!c || !to || c.stage === to) return false;
  const from = c.stage;
  if (to === 'encerrado' && !confirm(`Encerrar ${c.name}? As cobranças param e a clínica sai das listas ativas. Dá para voltar depois.`)) return false;
  c.stage = to; log(`Etapa de ${c.name}: ${stageLabel(from)} → ${stageLabel(to)}`, c.id);
  if (['onboarding', 'ativo'].includes(to) && !c.journey) {
    if (confirm(`Começar a jornada MBCR de ${c.name}?\n\nOK = começa hoje (${fmtDate(todayStr())}) e cria as tarefas dos 12 meses\nCancelar = só muda a etapa`)) {
      c.startDate = todayStr(); startJourney(c); toast(`${c.name}: jornada criada`);
    }
  }
  saveNow(); const y = $('.main').scrollTop; render(); $('.main').scrollTop = y;
  toast(`${c.name} → ${stageLabel(to)}`); return true;
}

(() => {
  const css = document.createElement('style');
  css.textContent = `
    .ccard { touch-action: pan-y; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: grab; }
    .ccard.dragging { opacity: .35; }
    .drag-ghost { position: fixed; left: 0; top: 0; z-index: 300; pointer-events: none; margin: 0 !important; box-shadow: 0 18px 40px rgba(0, 20, 80, .35); border-color: var(--accent) !important; }
    .pcol.drop { outline: 2px dashed var(--accent); outline-offset: -2px; background: color-mix(in srgb, var(--accent) 10%, var(--bg2)); }
    body.noselect, body.noselect * { -webkit-user-select: none !important; user-select: none !important; cursor: grabbing !important; }
    .touch-only { display: none; } @media (pointer: coarse) { .touch-only { display: inline; } }`;
  document.head.appendChild(css);

  let st = null;
  const colAt = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('.pcol[data-stage]') : null; };
  const clearDrop = () => document.querySelectorAll('.pcol.drop').forEach((c) => c.classList.remove('drop'));
  const finish = () => { if (!st) return; clearTimeout(st.timer); if (st.ghost) st.ghost.parentNode && st.ghost.parentNode.removeChild(st.ghost); if (st.card) st.card.classList.remove('dragging'); document.body.classList.remove('noselect'); clearDrop(); };

  function begin(x, y) {
    const r = st.card.getBoundingClientRect();
    const g = st.card.cloneNode(true); g.classList.add('drag-ghost'); g.style.width = r.width + 'px'; document.body.appendChild(g);
    st.ghost = g; st.dx = x - r.left; st.dy = y - r.top; st.active = true;
    st.card.classList.add('dragging'); document.body.classList.add('noselect'); place(x, y);
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
  }
  function place(x, y) {
    st.ghost.style.transform = `translate(${x - st.dx}px, ${y - st.dy}px) rotate(2deg)`;
    clearDrop(); const col = colAt(x, y); if (col) col.classList.add('drop'); st.over = col;
    const m = $('.main'); const mr = m.getBoundingClientRect();
    if (y > mr.bottom - 70) m.scrollTop += 16; else if (y < mr.top + 90) m.scrollTop -= 16;
    const pp = $('.pipeline'); if (pp) { const pr = pp.getBoundingClientRect(); if (x > pr.right - 50) pp.scrollLeft += 16; else if (x < pr.left + 50) pp.scrollLeft -= 16; }
  }
  document.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.ccard[data-cid]'); if (!card || e.button > 0) return;
    st = { card, id: card.dataset.cid, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', active: false, pid: e.pointerId, lx: e.clientX, ly: e.clientY };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.active) begin(st.lx, st.ly); }, 350);
  });
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.lx = e.clientX; st.ly = e.clientY;
    const dist = Math.hypot(e.clientX - st.x, e.clientY - st.y);
    if (!st.active) {
      if (st.touch) { if (dist > 10) { clearTimeout(st.timer); st = null; } return; }
      if (dist > 6) begin(e.clientX, e.clientY); else return;
    }
    e.preventDefault(); place(e.clientX, e.clientY);
  }, { passive: false });
  // no toque, o navegador pode cancelar os eventos de ponteiro; seguimos pelos eventos de toque
  document.addEventListener('touchmove', (e) => {
    if (!st || !st.active) return; e.preventDefault();
    const t = e.touches[0]; if (t) { st.lx = t.clientX; st.ly = t.clientY; place(t.clientX, t.clientY); }
  }, { passive: false });
  function drop(x, y) {
    if (!st) return; const s0 = st; const wasActive = s0.active; finish(); st = null;
    if (!wasActive) return;
    s0.card.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { once: true, capture: true });
    const col = s0.over || colAt(x, y);
    if (col) moveClinicStage(clinicById(s0.id), col.dataset.stage);
  }
  document.addEventListener('pointerup', (e) => { if (st && st.touch && st.active) return; drop(e.clientX, e.clientY); });
  document.addEventListener('touchend', (e) => { if (!st || !st.touch) return; const t = e.changedTouches[0]; drop(t ? t.clientX : st.lx, t ? t.clientY : st.ly); });
  document.addEventListener('pointercancel', () => { if (st && st.touch && st.active) return; finish(); st = null; });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.ccard[data-cid]')) e.preventDefault(); });
})();
