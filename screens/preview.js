import { cents, day, html, pct, usd } from '../format.js';
import { asBasket } from '../model.js';

export const title = '다음 매수 미리보기';

export function render(root, ctx) {
  const s = ctx.data.state ?? {};
  const p = s.preview;
  const b = asBasket(s.settings);
  const state = s.subscription?.state;
  const toggle = state === 'PAUSED' ? ['resume', '재개'] : ['pause', '일시정지'];
  const syms = p ? [...new Set([...Object.keys(b ? { ...b.core, ...b.satellite } : {}), ...Object.keys(p.buys), ...Object.keys(p.skipped)])] : [];

  const row = (sym) => {
    const buy = p.buys[sym];
    const why = p.skipped[sym];
    const before = p.weights_before?.[sym];
    const after = p.weights_after?.[sym];
    const move = before == null ? '' : `지금 ${pct(before, 1)} → 산 뒤 ${pct(after ?? before, 1)}`;
    return html`<div class="line ${buy ? '' : 'dim'}">
      <span class="stack"><span class="sym">${sym}</span>
        <span class="${why ? 'warn-text' : 'muted'} small">${why ?? `소수점 시장가 · ${move}`}</span>
        ${why && move ? html`<span class="muted small">${move}</span>` : ''}</span>
      <strong>${cents(buy ?? 0)}</strong></div>`;
  };

  root.innerHTML = html`<main class="screen">
    <header class="head">
      <a class="back" href="#/basket">← 내 바구니</a>
      ${p ? html`<h1 class="title">${day(s.next_cycle)}<br>${cents(p.amount_cents)}로 이렇게 살 예정이에요</h1>`
          : html`<h1 class="title">다음 매수 미리보기</h1>`}
      <p class="muted small">자동 매수 · 부족한 쪽부터 · 달러 · 서버가 미리 계산한 값</p>
    </header>
    ${state === 'PAUSED' ? html`<p class="banner">일시정지 중이라 재개하기 전까지 이대로 사지 않아요</p>` : ''}
    ${p ? html`<section class="card list">${syms.map(row)}</section>
      <section class="sums">
        <div><span class="muted">예상 수수료</span><span>${usd(p.est_fee)}</span></div>
        <div><span class="muted">예상 체결 차이(슬리피지)</span><span>${usd(p.est_slippage)}</span></div>
        <div><span class="muted">남는 돈 · 다음 회차로</span><span>${cents(p.cash_left_cents)}</span></div>
      </section>
      <p class="note">비용 여유를 빼고 ${cents(p.budget_cents)} 안에서 사요. $1 미만은 사지 않고 넘겨요. 파는 주문은 없어요.
        실제 체결가는 주문 때 정해져요.</p>`
      : html`<section class="card"><p class="muted">아직 계산된 계획이 없어요. 서버가 다음 실행 때 계산해요.</p></section>`}
    <footer class="foot two">
      <button type="button" class="btn soft" id="skip">이번 회차 건너뛰기</button>
      <button type="button" class="btn soft" id="toggle">${toggle[1]}</button>
    </footer>
  </main>`.toString();

  root.querySelector('#skip').onclick = () => ctx.send('skip', {});
  root.querySelector('#toggle').onclick = () => ctx.send(toggle[0], {});
}
