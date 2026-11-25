// 모의 모드: mock/*.json을 읽고, 요청은 메모리에만 두고 약 1초 뒤 가짜 서버가 답한다.
// 서버처럼 요청을 DONE으로 적은 뒤 조금 늦게 화면 요약(view)을 새로 쓴다.
// 가짜 서버는 app_requests.handle과 subscription 전이표의 결과 모양만 흉내 낸다(실제 규칙은 서버에만 있다).
import { toSettings } from './model.js';

const MOVES = {
  pause: { ACTIVE: 'PAUSED' },
  resume: { PAUSED: 'ACTIVE' },
  stop: { ACTIVE: 'STOPPED', PAUSED: 'STOPPED', NEEDS_APPROVAL: 'STOPPED' },
};
const STEP_DAYS = { biweekly: 14, weekly: 7 };
const NAMES = {
  SPY: { name: 'State Street SPDR S&P 500 ETF Trust', class: '주식 ETF' },
  IEF: { name: 'iShares 7-10 Year Treasury Bond ETF', class: '채권' },
  VTI: { name: 'Vanguard Total Stock Market ETF', class: '주식 ETF' },
  VXUS: { name: 'Vanguard Total International Stock ETF', class: '주식 ETF' },
  BND: { name: 'Vanguard Total Bond Market ETF', class: '채권' },
  GLD: { name: 'SPDR Gold Shares', class: '금·귀금속' },
  AAPL: { name: 'Apple Inc. Common Stock', class: '개별 주식' },
  MSFT: { name: 'Microsoft Corporation Common Stock', class: '개별 주식' },
};

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

function checkGoal(g) {
  if (g.type !== 'steady' && g.type !== 'target') refuse('goal.type: steady(꾸준히 하기) 또는 target(목표 금액)');
  const out = { type: g.type, name: String(g.name ?? '').trim().slice(0, 40) || (g.type === 'steady' ? '꾸준히 하기' : '내 목표') };
  if (g.type === 'target') {
    if (!Number.isInteger(g.target_cents) || g.target_cents <= 0) refuse('goal.target_cents: 목표 금액(센트, 양의 정수)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.target_date ?? '')) refuse('goal.target_date: YYYY-MM-DD');
    Object.assign(out, { target_cents: g.target_cents, target_date: g.target_date });
  }
  return out;
}

export function createMock(name) {
  const key = name.replace(/[^a-z_]/g, '');
  const file = name === '1' ? 'state' : `state.${key}`;
  let db = null;
  const json = (p) => fetch(p, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
  const ready = (async () => {
    const [state, own, shared] = await Promise.all([json(`mock/${file}.json`), json(`mock/records.${key}.json`), json('mock/records.json')]);
    db = { state, view: structuredClone(state), records: own ?? shared, requests: [] };
  })();
  const now = () => new Date().toISOString();

  async function handle(kind, payload) {
    const s = db.state;
    if (kind === 'start' && !s.subscription) {
      s.subscription = { state: 'NEEDS_APPROVAL', settings_hash: null, approved_at: null, anchor: null, events: [] };
    }
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
      if (s.pending && payload.settings_hash === s.pending.settings_hash) {
        s.settings = s.pending.settings;
        s.settings_hash = s.pending.settings_hash;
      } else if (payload.settings_hash !== s.settings_hash) {
        refuse('화면에 보인 설정과 제안된 설정이 다름(해시 불일치)');
      }
      move('approve', 'ACTIVE');
      Object.assign(sub, { settings_hash: s.settings_hash, approved_at: now() });
      const syms = Object.keys(s.settings.targets ?? { ...s.settings.core, ...s.settings.satellite });
      s.symbols = Object.fromEntries(syms.map((t) => [t, NAMES[t] ?? { name: t, class: '개별 주식' }]));
      s.values = Object.fromEntries(syms.map((t) => [t, s.values?.[t] ?? 0]));
      if (!sub.anchor) s.next_cycle = '다음 거래일(첫 매수)';
      s.pending = null;
      s.preview = null;
      return { state: 'ACTIVE', settings_hash: s.settings_hash };
    }
    if (kind === 'goal') {
      const g = checkGoal(payload);
      s.goal = { ...g, set_at: now() };
      return g;
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
      return structuredClone({ state: db.view, records: db.records, requests: db.requests.slice().reverse() });
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
        setTimeout(() => { db.view = structuredClone(db.state); }, 1500);
      }, 1000);
      return structuredClone(row);
    },
  };
}
