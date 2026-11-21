// Sincronização entre aparelhos via repositório PRIVADO no GitHub (arquivo dados.json).
// O token fica só neste aparelho (localStorage separado) e nunca vai para o arquivo de dados nem para o backup.
'use strict';

const SYNC_TOKEN_KEY = 'roity-sync-token';
const SYNC_META_KEY = 'roity-sync-meta';
const SYNC_DEFAULT = { repo: '24aga/roity-mbcr-dados', path: 'dados.json' };

const Sync = {
  state: 'off', // off | ok | syncing | offline | error | conflict
  msg: '',
  timer: null,
  busy: false,
  meta() { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY)) || {}; } catch (e) { return {}; } },
  setMeta(m) { try { localStorage.setItem(SYNC_META_KEY, JSON.stringify({ ...this.meta(), ...m })); } catch (e) {} },
  token() { try { return localStorage.getItem(SYNC_TOKEN_KEY) || ''; } catch (e) { return ''; } },
  cfg() { const m = this.meta(); return { repo: m.repo || SYNC_DEFAULT.repo, path: m.path || SYNC_DEFAULT.path }; },
  enabled() { return !!this.token(); },
  url() { const c = this.cfg(); return `https://api.github.com/repos/${c.repo}/contents/${encodeURIComponent(c.path)}`; },
  headers(raw) {
    return { Authorization: `Bearer ${this.token()}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  },
  set(state, msg = '') { this.state = state; this.msg = msg; renderSyncBadge(); },

  async fetchRemote() {
    const r = await fetch(this.url() + '?t=' + Date.now(), { headers: this.headers(false), cache: 'no-store' });
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403) throw new Error('Token sem permissão. Confira o acesso ao repositório.');
    if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
    const j = await r.json();
    let text;
    if (j.content && j.encoding === 'base64') text = b64decode(j.content);
    else { const r2 = await fetch(this.url() + '?t=' + Date.now(), { headers: this.headers(true), cache: 'no-store' }); text = await r2.text(); }
    return { sha: j.sha, data: JSON.parse(text) };
  },

  async push() {
    if (!this.enabled() || this.busy) return;
    if (!navigator.onLine) { this.set('offline', 'Sem internet — as mudanças sobem quando voltar.'); return; }
    this.busy = true; this.set('syncing');
    try {
      const m = this.meta();
      const body = { message: `Atualização (${S.me}) ${new Date().toISOString()}`, content: b64encode(JSON.stringify(S)) };
      if (m.sha) body.sha = m.sha;
      const r = await fetch(this.url(), { method: 'PUT', headers: { ...this.headers(false), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 409 || r.status === 422) { this.busy = false; await this.pull(true); return; }
      if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
      const j = await r.json();
      this.setMeta({ sha: j.content.sha, syncedAt: S.updatedAt, dirty: false });
      this.set('ok');
    } catch (e) { this.set(navigator.onLine ? 'error' : 'offline', e.message); }
    this.busy = false;
  },

  // traz a versão da nuvem; se este aparelho também mudou, pergunta qual manter
  async pull(fromConflict) {
    if (!this.enabled() || this.busy) return;
    if (!navigator.onLine) { this.set('offline', 'Sem internet.'); return; }
    this.busy = true; this.set('syncing');
    try {
      const remote = await this.fetchRemote();
      const m = this.meta();
      if (!remote) { this.busy = false; this.setMeta({ sha: null }); await this.push(); return; }
      const rU = remote.data.updatedAt || '';
      const remoteChanged = remote.sha !== m.sha;
      if (!remoteChanged) { this.busy = false; if (m.dirty) await this.push(); else this.set('ok'); return; }
      if (m.dirty) { this.busy = false; return this.resolveConflict(remote); }
      applyRemote(remote.data);
      this.setMeta({ sha: remote.sha, syncedAt: rU, dirty: false });
      this.set('ok');
    } catch (e) { this.set(navigator.onLine ? 'error' : 'offline', e.message); }
    this.busy = false;
  },

  resolveConflict(remote) {
    this.set('conflict');
    const when = remote.data.updatedAt ? new Date(remote.data.updatedAt).toLocaleString('pt-BR', { timeZone: TZ }) : '—';
    const keepRemote = confirm(`Os dados mudaram em outro aparelho (última mudança na nuvem: ${when}) e também neste aparelho.\n\nOK = usar os dados da NUVEM (descarta as mudanças deste aparelho)\nCancelar = manter os dados DESTE aparelho e enviar para a nuvem`);
    if (keepRemote) { applyRemote(remote.data); this.setMeta({ sha: remote.sha, syncedAt: remote.data.updatedAt, dirty: false }); this.set('ok'); }
    else { this.setMeta({ sha: remote.sha, dirty: true }); this.push(); }
  },

  changed() { // chamado a cada alteração local
    if (!this.enabled()) return;
    this.setMeta({ dirty: true });
    clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 1500);
    if (this.state === 'ok') this.set('syncing');
  },

  async connect(token, repo) {
    localStorage.setItem(SYNC_TOKEN_KEY, token.trim());
    this.setMeta({ repo: repo || SYNC_DEFAULT.repo, path: SYNC_DEFAULT.path, sha: null, syncedAt: null, dirty: false });
    this.set('syncing');
    try {
      const remote = await this.fetchRemote();
      if (remote) {
        const n = (remote.data.clinics || []).length;
        if (confirm(`Encontrei dados na nuvem com ${n} clínica(s).\n\nOK = usar os dados da nuvem neste aparelho\nCancelar = enviar os dados DESTE aparelho para a nuvem (substitui os de lá)`)) {
          applyRemote(remote.data); this.setMeta({ sha: remote.sha, syncedAt: remote.data.updatedAt, dirty: false }); this.set('ok');
        } else { this.setMeta({ sha: remote.sha, dirty: true }); await this.push(); }
      } else { this.setMeta({ dirty: true }); await this.push(); }
      return this.state === 'ok';
    } catch (e) { this.set('error', e.message); return false; }
  },
  disconnect() { localStorage.removeItem(SYNC_TOKEN_KEY); this.setMeta({ sha: null, syncedAt: null, dirty: false }); this.set('off'); },

  start() {
    if (!this.enabled()) { this.set('off'); return; }
    this.pull();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pull(); });
    addEventListener('online', () => this.pull());
    setInterval(() => { if (document.visibilityState === 'visible' && !this.meta().dirty) this.pull(); }, 30000);
  },
};

function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64.replace(/\s/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
