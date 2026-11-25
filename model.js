// 화면 데이터 계산. 순수 함수만. 설정 검증은 portfolio/basket.py 규칙을 그대로 따른다.
export const TICKER = /^[A-Z][A-Z.]{0,9}$/;
export const CYCLES = { monthly: '월 1회', biweekly: '2주마다', weekly: '매주' };
export const STATES = {
  ACTIVE: '자동 매수 켜짐',
  PAUSED: '일시정지됨',
  NEEDS_APPROVAL: '확인이 필요해요',
  STOPPED: '멈춤',
};

// 처음 시작의 기본 바구니. 금액만 사용자가 정한다.
export const DEFAULT_BASKET = { name: '기본 60/40', core: { SPY: 0.6, IEF: 0.4 }, satellite: {}, satellite_cap: 0,
                                per_symbol_cap: 0, cycle: 'monthly', side: 'buy' };
// 서버 요약(state.symbols)이 아직 없을 때 기본 바구니 종목에만 쓰는 이름표.
const KNOWN = { SPY: { name: 'SPDR S&P 500 ETF Trust', class: '주식 ETF' },
                IEF: { name: 'iShares 7-10 Year Treasury Bond ETF', class: '채권' } };
export const symbolInfo = (sym, symbols) => symbols?.[sym] ?? KNOWN[sym] ?? null;

export function asBasket(s) {
  if (!s) return null;
  if (!('targets' in s)) return s;
  return { name: '기본', core: { ...s.targets }, satellite: {}, satellite_cap: 0, per_symbol_cap: 0,
           amount_cents: s.amount_cents, cycle: s.cycle, side: 'buy' };
}

const pctText = (w) => String(Math.round(w * 10000) / 100);
const rows = (m) => Object.entries(m).map(([sym, w]) => ({ sym, pct: pctText(w) }));

export function formFromBasket(b) {
  const sat = Object.keys(b.satellite).length > 0;
  return {
    name: b.name,
    core: rows(b.core),
    satellite: rows(b.satellite),
    satCap: sat || b.satellite_cap ? pctText(b.satellite_cap) : '20',
    perCap: sat || b.per_symbol_cap ? pctText(b.per_symbol_cap) : '10',
    amount: (b.amount_cents / 100).toFixed(2),
    cycle: b.cycle,
  };
}

export function blankForm() {
  return { name: '내 바구니', core: [{ sym: '', pct: '' }], satellite: [], satCap: '20', perCap: '10',
           amount: '', cycle: 'monthly' };
}

function hundredths(text) {
  const t = String(text ?? '').replace(/[,\s$%]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t) * 100);
}

const pctOf = (h) => `${h / 100}%`;

// form → { settings, errors, summary }. settings는 오류가 없을 때만.
export function toSettings(form) {
  const errors = [];
  const name = form.name.trim();
  if (!name) errors.push('바구니 이름을 적어 주세요');
  const parse = (list) => list
    .filter((r) => r.sym.trim() || String(r.pct).trim())
    .map((r) => ({ sym: r.sym.trim().toUpperCase(), h: hundredths(r.pct) }));
  const core = parse(form.core);
  const sat = parse(form.satellite);
  if (!core.length) errors.push('코어 종목을 하나 이상 넣어 주세요');
  const seen = new Map();
  for (const [part, list] of [['core', core], ['satellite', sat]]) {
    for (const { sym, h } of list) {
      const label = sym || '(빈칸)';
      if (!TICKER.test(sym)) errors.push(`${label}: 미국 종목 기호만 (예: VTI, BRK.B)`);
      if (seen.get(sym) === part) errors.push(`${label}: 두 번 들어 있어요`);
      else if (seen.has(sym)) errors.push(`${label}: 코어와 위성에 동시에 있어요`);
      seen.set(sym, part);
      if (!(h > 0 && h <= 10000)) errors.push(`${label}: 비중은 0 초과 100% 이하 (소수 둘째 자리까지)`);
    }
  }
  const sum = [...core, ...sat].reduce((a, r) => a + (r.h || 0), 0);
  const satSum = sat.reduce((a, r) => a + (r.h || 0), 0);
  if (sum !== 10000) errors.push(`코어 + 위성 합계가 ${pctOf(sum)}예요. 100%가 되어야 해요`);
  const satCap = hundredths(form.satCap);
  const perCap = hundredths(form.perCap);
  if (!(satCap >= 0 && satCap <= 10000)) errors.push('위성 합계 상한은 0~100%');
  if (!(perCap >= 0 && perCap <= 10000)) errors.push('위성 종목당 상한은 0~100%');
  if (satSum > satCap) errors.push(`위성 합계 ${pctOf(satSum)}가 위성 상한 ${pctOf(satCap)}를 넘어요`);
  for (const { sym, h } of sat) if (h > perCap) errors.push(`${sym}: ${pctOf(h)}가 종목당 상한 ${pctOf(perCap)}를 넘어요`);
  const cents = hundredths(form.amount);
  if (!(cents >= 100)) errors.push('한 번에 넣을 돈은 $1.00 이상 (센트까지)');
  if (!(form.cycle in CYCLES)) errors.push('매수 주기를 골라 주세요');

  const summary = `합계 ${pctOf(sum)} · 위성 ${pctOf(satSum)} (상한 ${Number.isNaN(satCap) ? '?' : pctOf(satCap)})`;
  if (errors.length) return { errors, summary, settings: null };
  const w = (list) => Object.fromEntries(list.map((r) => [r.sym, r.h / 10000]));
  return {
    errors, summary,
    settings: { name, core: w(core), satellite: w(sat), satellite_cap: satCap / 10000,
                per_symbol_cap: perCap / 10000, amount_cents: cents, cycle: form.cycle, side: 'buy' },
  };
}

// 회차 기록: ORDERED는 같은 cycle_id의 마지막(후속 확인) 것만 남긴다.
export function latestRecords(records) {
  const out = [];
  const at = new Map();
  for (const r of records) {
    if (r.kind === 'ORDERED' && at.has(r.cycle_id)) out[at.get(r.cycle_id)] = r;
    else {
      if (r.kind === 'ORDERED') at.set(r.cycle_id, out.length);
      out.push(r);
    }
  }
  return out;
}

export function orderLines(rec) {
  return (rec.batch?.orders ?? []).map((o) => {
    const b = rec.broker_status?.[o.client_order_id] ?? {};
    const filledQty = Number(b.filled_qty ?? 0);
    const price = b.filled_avg_price == null ? null : Number(b.filled_avg_price);
    return { symbol: o.symbol, qty: o.qty ?? null, notional_cents: o.notional_cents ?? null,
             status: b.status ?? null, filledQty, price, spent: price ? filledQty * price : 0 };
  });
}

// 단순 수익률: 기록된 매수 체결분만. 넣은 돈 = 체결 수량 × 체결가, 지금 = 같은 수량 × 지금 가격.
export function simpleGain(state, records) {
  const shares = {};
  let cost = 0;
  for (const r of latestRecords(records)) {
    if (r.kind !== 'ORDERED') continue;
    for (const l of orderLines(r)) {
      cost += l.spent;
      shares[l.symbol] = (shares[l.symbol] ?? 0) + l.filledQty;
    }
  }
  if (cost <= 0) return null;
  const prices = state.prices ?? {};
  if (Object.keys(shares).some((s) => !(prices[s] > 0))) return { cost, now: null, gain: null, pct: null, shares };
  const now = Object.entries(shares).reduce((a, [s, q]) => a + q * prices[s], 0);
  return { cost, now, gain: now - cost, pct: (now - cost) / cost, shares };
}

export function basketRows(state) {
  const b = asBasket(state.settings);
  if (!b) return [];
  const syms = [...Object.keys(b.core), ...Object.keys(b.satellite)];
  const values = state.values ?? {};
  const total = syms.reduce((a, s) => a + (values[s] ?? 0), 0);
  return syms.map((s) => ({
    sym: s, part: s in b.core ? '코어' : '위성', target: b.core[s] ?? b.satellite[s],
    now: total > 0 ? (values[s] ?? 0) / total : null,
  }));
}

export function lastEvent(sub) {
  const ev = sub?.events ?? [];
  return ev.length ? { at: ev[ev.length - 1][0], state: ev[ev.length - 1][1], reason: ev[ev.length - 1][2] } : null;
}

export function byMonth(records) {
  const groups = new Map();
  const list = latestRecords(records).slice().sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  for (const r of list) {
    const key = String(r.cycle_id || r.at || '').slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, items]) => ({ month, items }));
}

// 목표 비율에서 2%p 넘게 어긋났으면, 다음 매수에서 가장 많이 사는 종목을 돌려준다.
export function rebalanceHint(state) {
  const off = basketRows(state).some((r) => r.now != null && Math.abs(r.now - r.target) > 0.02);
  const top = Object.entries(state.preview?.buys ?? {}).sort((a, b) => b[1] - a[1])[0];
  return off && top ? { sym: top[0], date: state.next_cycle } : null;
}
