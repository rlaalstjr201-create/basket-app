import { cents, day, html, month, shares, symbol, usd, when } from '../format.js';
import { byMonth, orderLines } from '../model.js';

export const title = '내역';

const FILL = { filled: '체결', partially_filled: '일부 체결', new: '대기', accepted: '대기', pending_new: '대기',
               canceled: '취소', rejected: '거절', expired: '만료' };
const KIND = { SKIPPED: '건너뜀', MISSED: '놓침', NO_ORDERS: '안 삼', HALTED: '멈춤' };

function ordered(r, symbols) {
  const lines = orderLines(r);
  const spent = lines.reduce((a, l) => a + l.spent, 0);
  return html`<div class="entry">
    <div class="entry-head"><strong>${day(r.cycle_id)} 매수</strong><span>${usd(spent)}</span></div>
    ${lines.map((l) => html`<div class="sub-line">
      <span class="stack">${symbol(l.symbol, symbols)}<span>${l.notional_cents != null ? cents(l.notional_cents) : shares(l.qty)}</span></span>
      <span class="muted">${FILL[l.status] ?? l.status ?? '확인 전'}${l.filledQty ? ` ${shares(l.filledQty)}` : ''}${l.price ? ` @ ${usd(l.price)}` : ''}</span>
    </div>`)}
    ${r.est_cost_usd ? html`<p class="note">예상 비용 ${usd((r.est_cost_usd.fee ?? 0) + (r.est_cost_usd.slippage ?? 0))}</p>` : ''}
    ${r.error ? html`<p class="warn-text small">오류 · ${r.error}</p>` : ''}
  </div>`;
}

function other(r) {
  const skipped = Object.entries(r.skipped ?? {}).map(([k, v]) => `${k} ${v}`).join(', ');
  const detail = r.reason ?? (r.kind === 'SKIPPED' ? '화면에서 건너뛰기' : r.kind === 'MISSED' ? '실행이 늦어 넘어감' : '');
  return html`<div class="entry">
    <div class="entry-head"><strong>${day(r.cycle_id) || when(r.at)} ${KIND[r.kind] ?? r.kind}</strong>
      <span class="muted small">${when(r.at)}</span></div>
    ${detail ? html`<p class="muted small">${detail}</p>` : ''}
    ${skipped ? html`<p class="muted small">${skipped}</p>` : ''}
  </div>`;
}

export function render(root, ctx) {
  const { state, records } = ctx.data;
  const groups = byMonth(records);
  root.innerHTML = html`<main class="screen">
    <header class="head">
      <h1 class="title">내역</h1>
      <p class="muted small">산 것 · 건너뛴 것 · 멈춘 이유 · 최근 것부터</p>
    </header>
    ${groups.length ? groups.map((g) => html`<section class="card month">
      <h2 class="h2">${month(g.month)}</h2>
      ${g.items.map((r) => (r.kind === 'ORDERED' ? ordered(r, state?.symbols) : other(r)))}
    </section>`) : html`<section class="card"><p class="muted">아직 기록이 없어요</p></section>`}
    <footer class="foot"><p class="muted center">다음 매수는 ${day(state?.next_cycle) || '미정'}이에요</p></footer>
  </main>`.toString();
}
