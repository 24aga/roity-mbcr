// Mapa mental MBCR em SVG puro: nó central, 4 pilares, 12 meses em trilha,
// relações cruzadas pilar→mês e expansão progressiva mês → grupos → entregas.
'use strict';

const R_PILLAR = 200, R_MONTH = 500, MW = 220, MH = 80, LW = 330, LH = 46, GH = 40, ROW = 54;
const PILLAR_ANGLE = { M: -135, B: -45, C: 45, R: 135 };
const rad = (d) => (d * Math.PI) / 180;
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

class MindMap {
  constructor(host, opts) {
    this.host = host; this.o = opts; // {clinic, getMonthData(n) -> {tasks:[...], state}, onMonth(n), onTask(id), onTemplateItem(n, idx, kind)}
    this.expanded = opts.initialMonth || null;
    this.groups = new Set(['novo']);
    this.view = { x: 0, y: 0, k: 1 };
    this.query = ''; this.focusPillar = null;
    this.build();
    this.render();
    requestAnimationFrame(() => (this.expanded ? this.fitBounds(this.bounds(this.nodes), false) : this.fit(false)));
  }

  build() {
    this.host.innerHTML = `
      <div class="mm" tabindex="0" aria-label="Mapa mental MBCR. Use as setas para mover, + e − para zoom, 0 para centralizar.">
        <svg class="mm-svg" role="application" aria-roledescription="mapa mental">
          <defs>
            <marker id="mm-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--line-strong)"/></marker>
          </defs>
          <g class="mm-world"></g>
        </svg>
        <div class="mm-tools">
          <div class="mm-search"><input type="search" placeholder="Buscar no mapa…" aria-label="Buscar no mapa"></div>
          <div class="mm-btns">
            <button data-mm="in" title="Aproximar" aria-label="Aproximar">+</button>
            <button data-mm="out" title="Afastar" aria-label="Afastar">−</button>
            <button data-mm="fit" title="Centralizar" aria-label="Centralizar">⌖</button>
            <button data-mm="collapse" title="Recolher tudo" aria-label="Recolher tudo">⤡</button>
          </div>
        </div>
        <div class="mm-legend" aria-label="Legenda">
          ${Object.values(PILLARS).map((p) => `<button class="lg" data-pillar="${p.key}"><i style="background:${p.color}"></i>${p.name}</button>`).join('')}
          <span class="lg-sep"></span>
          <span class="lg st"><b class="st-dot concluido"></b>Concluído</span>
          <span class="lg st"><b class="st-dot andamento"></b>Em andamento</span>
          <span class="lg st"><b class="st-dot atrasado"></b>Atrasado</span>
          <span class="lg st"><b class="st-dot bloqueado"></b>Bloqueado</span>
        </div>
        <svg class="mm-mini" aria-hidden="true"><g class="mini-world"></g><rect class="mini-view"/></svg>
      </div>`;
    this.root = this.host.querySelector('.mm');
    this.svg = this.host.querySelector('.mm-svg');
    this.world = this.host.querySelector('.mm-world');
    this.mini = this.host.querySelector('.mm-mini');
    this.bindEvents();
  }

  // ---------------- layout ----------------
  layout() {
    const nodes = [], edges = [];
    const isClinic = !!this.o.clinic;
    nodes.push({ id: 'center', type: 'center', x: 0, y: 0 });
    for (const p of Object.values(PILLARS)) {
      const a = rad(PILLAR_ANGLE[p.key]);
      nodes.push({ id: 'p-' + p.key, type: 'pillar', pillar: p.key, x: Math.cos(a) * R_PILLAR, y: Math.sin(a) * R_PILLAR, label: p.name });
      edges.push({ type: 'trunk', from: [0, 0], to: [Math.cos(a) * R_PILLAR, Math.sin(a) * R_PILLAR], pillar: p.key });
    }
    for (let n = 1; n <= 12; n++) {
      const md = this.o.getMonthData(n);
      const a = rad(-90 + (n - 1) * 30);
      const x = Math.cos(a) * R_MONTH, y = Math.sin(a) * R_MONTH;
      nodes.push({ id: 'm-' + n, type: 'month', n, x, y, md, angle: a });
      for (const pk of md.pillars) {
        const pa = rad(PILLAR_ANGLE[pk]);
        const px = Math.cos(pa) * R_PILLAR, py = Math.sin(pa) * R_PILLAR;
        edges.push({ type: 'cross', pillar: pk, month: n, from: [px, py], to: [x, y], c1: [px * 1.55, py * 1.55], c2: [x * 0.72, y * 0.72] });
      }
      if (n === this.expanded) this.layoutBranch(n, md, a, nodes, edges, isClinic);
    }
    return { nodes, edges };
  }

  layoutBranch(n, md, a, nodes, edges, isClinic) {
    const rows = [];
    const add = (kind, label, list) => {
      const open = this.groups.has(kind);
      rows.push({ type: 'group', kind, label, list, open });
      if (open) list.forEach((it, i) => rows.push({ type: 'leaf', kind, it, i }));
    };
    add('novo', 'Nova implantação do mês', md.novo);
    add('rotina', 'Rotinas contínuas', md.rotina);
    add('saida', 'Saídas verificáveis', md.outputs.map((t) => ({ title: t, output: true })));
    const H = rows.length * ROW;
    const cos = Math.cos(a), sin = Math.sin(a);
    const Rb = R_MONTH + 230 + Math.abs(sin) * (H / 2) + (Math.abs(cos) > 0.3 ? 0 : 20);
    const ax = cos * Rb, ay = sin * Rb;
    const side = cos > 0.3 ? 'r' : cos < -0.3 ? 'l' : 'c';
    const mx = Math.cos(a) * R_MONTH, my = Math.sin(a) * R_MONTH;
    let y = ay - H / 2 + ROW / 2;
    let lastGroup = null;
    for (const r of rows) {
      const indent = r.type === 'leaf' ? 34 : 0;
      const w = r.type === 'leaf' ? LW : 250;
      let x; // centro do nó
      if (side === 'r') x = ax + indent + w / 2;
      else if (side === 'l') x = ax - indent - w / 2;
      else x = ax + indent + w / 2 - 140;
      const node = { id: `b-${r.kind}-${r.type}-${r.i ?? ''}`, type: r.type, kind: r.kind, x, y, w, n, row: r };
      nodes.push(node);
      if (r.type === 'group') {
        lastGroup = node;
        const gx = side === 'l' ? x + w / 2 : side === 'r' ? x - w / 2 : x;
        const startY = side === 'c' ? my + (sin < 0 ? -MH / 2 : MH / 2) : my;
        const startX = side === 'c' ? mx : mx + (side === 'r' ? MW / 2 : -MW / 2);
        const gyy = side === 'c' ? y + (sin < 0 ? GH / 2 : -GH / 2) : y;
        const gxx = side === 'c' ? x - w / 2 + 20 : gx;
        edges.push({ type: 'branch', month: n, from: [startX, startY], to: [gxx, gyy], c1: side === 'c' ? [startX, (startY + gyy) / 2] : [(startX + gxx) / 2, startY], c2: side === 'c' ? [gxx, (startY + gyy) / 2] : [(startX + gxx) / 2, gyy] });
      } else {
        const g = lastGroup;
        const fx = side === 'l' ? g.x + g.w / 2 - 16 : g.x - g.w / 2 + 16;
        const fy = g.y + GH / 2;
        const tx = side === 'l' ? x + w / 2 : x - w / 2;
        edges.push({ type: 'leaf', month: n, pillar: r.it.pillar, from: [fx, fy], to: [tx, y], c1: [fx, y], c2: [fx, y] });
      }
      y += ROW;
    }
  }

  // ---------------- render ----------------
  render() {
    const { nodes, edges } = this.layout();
    this.nodes = nodes;
    const q = this.query.trim().toLowerCase();
    const match = (s) => q && s && s.toLowerCase().includes(q);
    const fp = this.focusPillar;
    let out = '';
    // trilha temporal (anel conectando os meses em ordem)
    out += `<circle class="mm-ring" cx="0" cy="0" r="${R_MONTH}"/>`;
    for (let n = 1; n <= 12; n++) {
      const a = rad(-90 + (n - 1) * 30 + 15);
      const x = Math.cos(a) * R_MONTH, y = Math.sin(a) * R_MONTH;
      const deg = -90 + (n - 1) * 30 + 15 + 90;
      if (n < 12) out += `<path class="mm-ring-arrow" d="M-5,-5 L5,0 L-5,5" transform="translate(${x},${y}) rotate(${deg - 90})"/>`;
    }
    for (const e of edges) {
      const c1 = e.c1 || [(e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2];
      const c2 = e.c2 || c1;
      const d = `M${e.from[0]},${e.from[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${e.to[0]},${e.to[1]}`;
      const col = e.pillar ? PILLARS[e.pillar].color : 'var(--line-strong)';
      const dim = fp && e.pillar && e.pillar !== fp ? ' dim' : '';
      const hl = fp && e.pillar === fp ? ' hl' : '';
      out += `<path class="mm-edge ${e.type}${dim}${hl}" data-month="${e.month || ''}" d="${d}" style="stroke:${col}"/>`;
    }
    for (const nd of nodes) out += this.nodeSVG(nd, match, fp, q);
    this.world.innerHTML = out;
    this.renderMini();
    this.applyView();
  }

  nodeSVG(nd, match, fp, q) {
    const tr = `transform="translate(${nd.x},${nd.y})"`;
    if (nd.type === 'center') {
      const name = this.o.clinic ? trunc(this.o.clinic.name, 22) : 'Método Roity';
      const sub = this.o.clinic ? `${Math.round(this.o.overall.p * 100)}% concluído` : 'Modelo de 12 meses';
      return `<g class="mm-node center" data-node="center" tabindex="0" role="button" aria-label="Centro: MBCR ${esc(name)}" ${tr}>
        <circle r="92" class="c-bg"/><circle r="92" class="c-ring" style="stroke-dasharray:${(this.o.overall ? this.o.overall.p : 0) * 578} 578"/>
        <text class="c-t1" y="-14">MBCR</text><text class="c-t2" y="12">${esc(name)}</text><text class="c-t3" y="34">${esc(sub)}</text></g>`;
    }
    if (nd.type === 'pillar') {
      const p = PILLARS[nd.pillar];
      const dim = fp && fp !== nd.pillar ? ' dim' : '';
      return `<g class="mm-node pillar${dim}${fp === nd.pillar ? ' on' : ''}" data-node="pillar" data-pillar="${nd.pillar}" tabindex="0" role="button" aria-label="Pilar ${p.name}" ${tr}>
        <rect x="-78" y="-24" width="156" height="48" rx="24" style="fill:${p.color}"/>
        <text class="p-t" y="6">${p.name}</text></g>`;
    }
    if (nd.type === 'month') {
      const md = nd.md; const st = md.state;
      const p0 = PILLARS[md.pillars[0]].color;
      const hit = match(md.title) || md.novo.concat(md.rotina).some((t) => match(t.title));
      const dim = (fp && !md.pillars.includes(fp)) || (q && !hit) ? ' dim' : '';
      const on = this.expanded === nd.n ? ' on' : '';
      const now = md.isCurrent ? `<g transform="translate(${MW / 2 - 44},${-MH / 2 - 10})"><rect width="50" height="20" rx="10" class="now-bg"/><text x="25" y="14" class="now-t">AGORA</text></g>` : '';
      const stateTxt = st ? `${st.l} · ${Math.round(st.p * 100)}%` : `${md.novo.length} novidades · ${md.rotina.length} rotinas`;
      const dots = md.pillars.map((k, i) => `<circle cx="${MW / 2 - 16 - i * 13}" cy="${-MH / 2 + 16}" r="5" style="fill:${PILLARS[k].color}"/>`).join('');
      return `<g class="mm-node month${dim}${on}${hit && q ? ' hit' : ''} st-${st ? st.k : 'tpl'}" data-node="month" data-n="${nd.n}" tabindex="0" role="button"
          aria-label="Mês ${nd.n}: ${esc(md.title)}. ${esc(stateTxt)}" aria-expanded="${this.expanded === nd.n}" ${tr}>
        <rect class="m-bg" x="${-MW / 2}" y="${-MH / 2}" width="${MW}" height="${MH}" rx="16" style="stroke:${p0}"/>
        <text class="m-n" x="${-MW / 2 + 14}" y="${-MH / 2 + 21}">MÊS ${nd.n}</text>${dots}
        <text class="m-t" x="${-MW / 2 + 14}" y="${-MH / 2 + 43}">${esc(trunc(md.short || md.title, 24))}</text>
        <rect class="m-bar" x="${-MW / 2 + 14}" y="${MH / 2 - 22}" width="${MW - 28}" height="5" rx="2.5"/>
        <rect class="m-fill" x="${-MW / 2 + 14}" y="${MH / 2 - 22}" width="${(MW - 28) * (st ? st.p : 0)}" height="5" rx="2.5" style="fill:${p0}"/>
        <text class="m-s" x="${-MW / 2 + 14}" y="${MH / 2 - 6}">${esc(stateTxt)}</text>${now}</g>`;
    }
    if (nd.type === 'group') {
      const r = nd.row; const w = nd.w;
      const list = r.list;
      const done = list.filter((t) => t.status === 'concluido').length;
      const cnt = r.kind === 'saida' ? `${list.length}` : this.o.clinic ? `${done}/${list.length}` : `${list.length}`;
      return `<g class="mm-node group g-${r.kind}" data-node="group" data-kind="${r.kind}" tabindex="0" role="button" aria-expanded="${r.open}"
          aria-label="${esc(r.label)}, ${cnt}" transform="translate(${nd.x - w / 2},${nd.y - GH / 2})">
        <rect class="g-bg" width="${w}" height="${GH}" rx="12"/>
        <text class="g-ic" x="16" y="25">${r.open ? '▾' : '▸'}</text>
        <text class="g-t" x="34" y="25">${esc(r.label)}</text>
        <text class="g-c" x="${w - 14}" y="25">${cnt}</text></g>`;
    }
    if (nd.type === 'leaf') {
      const it = nd.row.it; const w = nd.w;
      const hit = match(it.title);
      const col = it.pillar ? PILLARS[it.pillar].color : 'var(--muted)';
      let sub = '', stk = 'tpl';
      if (it.output) sub = 'Entrega verificável';
      else if (this.o.clinic) { const s = taskStatusLabel(it); stk = s.k; sub = `${it.owner} · ${fmtShort(it.due)} · ${s.l}`; if (it.checklist && it.checklist.length) sub += ` · ☑ ${it.checklist.filter((c) => c.done).length}/${it.checklist.length}`; }
      else sub = `${it.owner || ''} · dia ${it.d || ''} · ${PILLARS[it.pillar]?.name || ''}`;
      const mark = { concluido: '✓', atrasado: '!', bloqueado: '■', andamento: '◐', a_fazer: '○', tpl: '•' }[stk] || '•';
      return `<g class="mm-node leaf st-${stk}${hit ? ' hit' : ''}${this.query && !hit ? ' dim' : ''}" data-node="leaf" data-kind="${nd.row.kind}" data-i="${nd.row.i}" ${it.id ? `data-task="${it.id}"` : ''}
          tabindex="0" role="button" aria-label="${esc(it.title)}. ${esc(sub)}" transform="translate(${nd.x - w / 2},${nd.y - LH / 2})">
        <rect class="l-bg" width="${w}" height="${LH}" rx="10"/>
        <rect width="4" height="${LH - 16}" x="8" y="8" rx="2" style="fill:${col}"/>
        <circle class="l-st" cx="26" cy="${LH / 2}" r="9"/><text class="l-mk" x="26" y="${LH / 2 + 4}">${mark}</text>
        <text class="l-t" x="42" y="19">${esc(trunc(it.title, 44))}</text>
        <text class="l-s" x="42" y="36">${esc(trunc(sub, 52))}</text></g>`;
    }
    return '';
  }

  // ---------------- minimapa ----------------
  bounds(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of list) {
      const w = n.type === 'month' ? MW : n.type === 'leaf' || n.type === 'group' ? n.w : n.type === 'center' ? 190 : 160;
      const h = n.type === 'month' ? MH : n.type === 'center' ? 190 : 50;
      x0 = Math.min(x0, n.x - w / 2); x1 = Math.max(x1, n.x + w / 2); y0 = Math.min(y0, n.y - h / 2); y1 = Math.max(y1, n.y + h / 2);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  renderMini() {
    const b = this.bounds(this.nodes); const pad = 60;
    this.mb = { x0: b.x0 - pad, y0: b.y0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    this.mini.setAttribute('viewBox', `${this.mb.x0} ${this.mb.y0} ${this.mb.w} ${this.mb.h}`);
    let s = `<circle r="${R_MONTH}" class="mini-ring"/>`;
    for (const n of this.nodes) {
      if (n.type === 'month') s += `<rect x="${n.x - MW / 2}" y="${n.y - MH / 2}" width="${MW}" height="${MH}" rx="14" style="fill:${PILLARS[n.md.pillars[0]].color}"/>`;
      else if (n.type === 'pillar') s += `<circle cx="${n.x}" cy="${n.y}" r="30" style="fill:${PILLARS[n.pillar].color}"/>`;
      else if (n.type === 'center') s += `<circle r="90" class="mini-c"/>`;
      else s += `<rect x="${n.x - n.w / 2}" y="${n.y - 18}" width="${n.w}" height="36" rx="8" class="mini-l"/>`;
    }
    this.mini.querySelector('.mini-world').innerHTML = s;
  }

  // ---------------- vista ----------------
  size() { const r = this.svg.getBoundingClientRect(); return { W: r.width || 800, H: r.height || 600 }; }
  applyView() {
    const v = this.view;
    this.world.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`);
    const { W, H } = this.size();
    const r = this.mini.querySelector('.mini-view');
    r.setAttribute('x', (-v.x) / v.k); r.setAttribute('y', (-v.y) / v.k);
    r.setAttribute('width', W / v.k); r.setAttribute('height', H / v.k);
  }
  animateTo(target, animate = true) {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.view = target; this.applyView(); return; }
    const from = { ...this.view }; const t0 = performance.now(); const D = 320;
    cancelAnimationFrame(this.raf);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / D); const e = 1 - Math.pow(1 - p, 3);
      this.view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      this.applyView(); if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  fitBounds(b, animate = true, maxK = 1.2) {
    const { H } = this.size(); const W = this.size().W - (this.o.insetRight ? this.o.insetRight() : 0); const pad = 40;
    const k = Math.max(0.15, Math.min(maxK, (W - pad * 2) / b.w, (H - pad * 2) / b.h));
    this.animateTo({ k, x: W / 2 - (b.x0 + b.w / 2) * k, y: H / 2 - (b.y0 + b.h / 2) * k }, animate);
  }
  fit(animate = true) { this.fitBounds(this.bounds(this.nodes.filter((n) => ['center', 'pillar', 'month'].includes(n.type))), animate); }
  focusBranch(animate = true) {
    const list = this.nodes.filter((n) => (n.type === 'month' && n.n === this.expanded) || n.type === 'group' || n.type === 'leaf');
    if (list.length) this.fitBounds(this.bounds(list), animate, 1.1);
  }
  zoomAt(f, cx, cy) {
    const v = this.view; const k = Math.max(0.15, Math.min(2.5, v.k * f));
    const r = k / v.k; this.view = { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; this.applyView();
  }

  // ---------------- ações ----------------
  toggleMonth(n) {
    if (this.expanded === n) { this.expanded = null; this.render(); this.fit(); }
    else { this.expanded = n; this.groups = new Set(['novo']); this.render(); this.focusBranch(); }
  }
  activate(g) {
    const t = g.dataset.node;
    if (t === 'center') { this.expanded = null; this.focusPillar = null; this.render(); this.fit(); }
    else if (t === 'pillar') { this.focusPillar = this.focusPillar === g.dataset.pillar ? null : g.dataset.pillar; this.render(); }
    else if (t === 'month') { const n = +g.dataset.n; const opening = this.expanded !== n; if (opening) this.o.onMonth(n); this.toggleMonth(n); }
    else if (t === 'group') { const k = g.dataset.kind; this.groups.has(k) ? this.groups.delete(k) : this.groups.add(k); this.render(); this.focusBranch(); }
    else if (t === 'leaf') {
      if (g.dataset.task) this.o.onTask(g.dataset.task);
      else if (g.dataset.kind !== 'saida') this.o.onTemplateItem && this.o.onTemplateItem(this.expanded, +g.dataset.i, g.dataset.kind);
    }
  }
  refresh() { this.render(); }

  bindEvents() {
    const ptrs = new Map(); let moved = 0, last = null, pinch = null;
    this.svg.addEventListener('pointerdown', (e) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; last = { x: e.clientX, y: e.clientY };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
      this.root.classList.add('grabbing');
    });
    window.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = this.svg.getBoundingClientRect();
        this.zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.d = d; moved += 10; return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) { this.view.x += dx; this.view.y += dy; this.applyView(); }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) this.root.classList.remove('grabbing'); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    this.svg.addEventListener('click', (e) => { if (moved > 6) return; const g = e.target.closest('[data-node]'); if (g) this.activate(g); });
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault(); const r = this.svg.getBoundingClientRect();
      if (e.ctrlKey) this.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); // pinça no trackpad
      else if (e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50)) this.zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.12), e.clientX - r.left, e.clientY - r.top); // roda do mouse
      else { this.view.x -= e.deltaX; this.view.y -= e.deltaY; this.applyView(); }
    }, { passive: false });
    this.root.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const g = e.target.closest && e.target.closest('[data-node]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.activate(g); return; }
      const { W, H } = this.size(); const st = 60;
      const map = { ArrowLeft: [st, 0], ArrowRight: [-st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
      if (map[e.key]) { e.preventDefault(); this.view.x += map[e.key][0]; this.view.y += map[e.key][1]; this.applyView(); }
      else if (e.key === '+' || e.key === '=') this.zoomAt(1.2, W / 2, H / 2);
      else if (e.key === '-') this.zoomAt(1 / 1.2, W / 2, H / 2);
      else if (e.key === '0') this.fit();
      else if (e.key === 'Escape' && this.expanded) this.toggleMonth(this.expanded);
    });
    this.host.querySelector('.mm-btns').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const { W, H } = this.size();
      ({ in: () => this.zoomAt(1.25, W / 2, H / 2), out: () => this.zoomAt(0.8, W / 2, H / 2), fit: () => (this.expanded ? this.focusBranch() : this.fit()),
        collapse: () => { this.expanded = null; this.focusPillar = null; this.render(); this.fit(); } })[b.dataset.mm]();
    });
    this.host.querySelector('.mm-legend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pillar]'); if (!b) return;
      this.focusPillar = this.focusPillar === b.dataset.pillar ? null : b.dataset.pillar; this.render();
    });
    const input = this.host.querySelector('.mm-search input');
    input.addEventListener('input', () => {
      this.query = input.value;
      const q = this.query.trim().toLowerCase();
      if (q.length >= 3) {
        for (let n = 1; n <= 12; n++) {
          const md = this.o.getMonthData(n);
          const inNovo = md.novo.some((t) => t.title.toLowerCase().includes(q));
          const inRot = md.rotina.some((t) => t.title.toLowerCase().includes(q));
          if (inNovo || inRot) {
            if (this.expanded !== n) { this.expanded = n; this.groups = new Set(); }
            if (inNovo) this.groups.add('novo'); if (inRot) this.groups.add('rotina');
            this.render(); this.focusBranch(); return;
          }
        }
      }
      this.render();
    });
    this.mini.addEventListener('click', (e) => {
      const r = this.mini.getBoundingClientRect(); const mb = this.mb;
      const s = Math.max(mb.w / r.width, mb.h / r.height);
      const ox = (r.width * s - mb.w) / 2, oy = (r.height * s - mb.h) / 2;
      const wx = mb.x0 - ox + (e.clientX - r.left) * s, wy = mb.y0 - oy + (e.clientY - r.top) * s;
      const { W, H } = this.size(); this.animateTo({ k: this.view.k, x: W / 2 - wx * this.view.k, y: H / 2 - wy * this.view.k });
    });
    this.ro = new ResizeObserver(() => this.applyView()); this.ro.observe(this.svg);
  }
  destroy() { this.ro && this.ro.disconnect(); }
}
