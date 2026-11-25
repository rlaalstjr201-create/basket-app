// 모의 모드: mock/*.json을 읽고, 요청은 메모리에만 두고 약 1초 뒤 가짜 서버가 답한다.
// 가짜 서버는 app_requests.handle과 subscription 전이표의 결과 모양만 흉내 낸다(실제 규칙은 서버에만 있다).
import { toSettings } from './model.js';

const MOVES = {
  pause: { ACTIVE: 'PAUSED' },
  resume: { PAUSED: 'ACTIVE' },
  stop: { ACTIVE: 'STOPPED', PAUSED: 'STOPPED', NEEDS_APPROVAL: 'STOPPED' },
};
const STEP_DAYS = { biweekly: 14, weekly: 7 };

const sorted = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]))
  : v);

async function sha256(obj) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sorted(obj))));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nextAfter(iso, cycle) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = STEP_DAYS[cycle] ? new Date(y, m - 1, d + STEP_DAYS[cycle]) : new Date(y, m, Math.min(d, 28));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function refuse(reason) {
  const e = new Error(reason);
  e.refused = true;
  throw e;
}

export function createMock(name) {
  const file = name === '1' ? 'state' : `state.${name.replace(/[^a-z_]/g, '')}`;
  let db = null;
  const ready = (async () => {
    const [state, records] = await Promise.all(
      [`mock/${file}.json`, 'mock/records.json'].map((p) => fetch(p, { cache: 'no-store' }).then((r) => r.json())));
    db = { state, records, requests: [] };
  })();
  const now = () => new Date().toISOString();

  async function handle(kind, payload) {
    const s = db.state;
    const sub = s.subscription;
    const move = (event, to, reason = event) => {
      sub.state = to;
      sub.events.push([now(), to, reason]);
    };
    if (kind === 'propose') {
      const settings = payload.settings ?? {};
      const check = toSettings({
        name: settings.name ?? '',
        core: Object.entries(settings.core ?? {}).map(([sym, w]) => ({ sym, pct: String(Math.round(w * 10000) / 100) })),
        satellite: Object.entries(settings.satellite ?? {}).map(([sym, w]) => ({ sym, pct: String(Math.round(w * 10000) / 100) })),
        satCap: String(Math.round((settings.satellite_cap ?? -1) * 10000) / 100),
        perCap: String(Math.round((settings.per_symbol_cap ?? -1) * 10000) / 100),
        amount: String((settings.amount_cents ?? 0) / 100),
        cycle: settings.cycle,
      });
      if (check.errors.length) refuse(check.errors[0]);
      const h = await sha256(settings);
      s.pending = { settings, settings_hash: h, proposed_at: now() };
      return { settings_hash: h };
    }
    if (kind === 'start') {
      if (!s.pending || payload.settings_hash !== s.pending.settings_hash) refuse('화면에 보인 설정과 제안된 설정이 다름(해시 불일치)');
      s.settings = s.pending.settings;
      s.settings_hash = s.pending.settings_hash;
      move('approve', 'ACTIVE');
      Object.assign(sub, { settings_hash: s.settings_hash, approved_at: now() });
      s.pending = null;
      s.preview = null;
      return { state: 'ACTIVE', settings_hash: s.settings_hash };
    }
    if (kind === 'skip') {
      if (!sub.anchor) refuse('첫 매수 전에는 건너뛸 회차가 없음');
      const cycle = s.next_cycle;
      db.records.push({ cycle_id: cycle, kind: 'SKIPPED', at: now() });
      s.next_cycle = nextAfter(cycle, s.settings.cycle);
      return { skipped_cycle: cycle };
    }
    const to = MOVES[kind]?.[sub.state];
    if (!to) refuse(`${sub.state} 상태에서 ${kind} 불가`);
    move(kind, to);
    return { state: to };
  }

  return {
    mock: true,
    async load() {
      await ready;
      return structuredClone({ state: db.state, records: db.records, requests: db.requests.slice().reverse() });
    },
    async getRequest(id) {
      await ready;
      return structuredClone(db.requests.find((r) => r.id === id) ?? null);
    },
    async send(kind, payload) {
      await ready;
      const row = { id: db.requests.length + 1, kind, status: 'NEW', result: null, created_at: now() };
      db.requests.push(row);
      setTimeout(async () => {
        try {
          row.result = await handle(kind, payload);
          row.status = 'DONE';
        } catch (e) {
          row.result = { reason: e.refused ? e.message : String(e) };
          row.status = 'REJECTED';
        }
        db.state.updated_at = now();
      }, 1000);
      return structuredClone(row);
    },
  };
}
