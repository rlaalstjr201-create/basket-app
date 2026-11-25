import { signOut } from '../auth.js';
import { cents, fullDay, html, pct, symbol } from '../format.js';
import { asBasket, CYCLES, STATES } from '../model.js';
import { begin } from './start.js';

export const title = '내 설정';

let askStop = false;

function goalText(g) {
  if (!g) return '꾸준히 하기 (따로 정하지 않음)';
  if (g.type === 'steady') return g.name === '꾸준히 하기' ? '꾸준히 하기' : `꾸준히 하기 · ${g.name}`;
  return `${g.name} · ${fullDay(g.target_date)}까지 ${cents(g.target_cents)}`;
}

export function render(root, ctx) {
  const s = ctx.data.state ?? {};
  const b = asBasket(s.settings);
  const state = s.subscription?.state;
  const toggle = state === 'ACTIVE' ? ['pause', '일시정지'] : state === 'PAUSED' ? ['resume', '재개'] : null;
  const canStop = state && state !== 'STOPPED';

  root.innerHTML = html`<main class="screen">
    <header class="head"><h1 class="title">내 설정</h1></header>
    <section class="card">
      <h2 class="h2">목표</h2>
      <p>${goalText(s.goal)}</p>
      <button type="button" class="btn soft" id="goal">목표 바꾸기</button>
    </section>
    <section class="card">
      <h2 class="h2">지금 바구니</h2>
      ${b ? html`<p class="muted small">${b.name} · ${CYCLES[b.cycle] ?? b.cycle} ${cents(b.amount_cents)} · 사기만 해요</p>
        <div class="rows">${Object.entries({ ...b.core, ...b.satellite }).map(([sym, w]) => html`<div class="row">${symbol(sym, s.symbols)}<span class="muted">${pct(w)}</span></div>`)}</div>`
        : html`<p class="muted">아직 바구니가 없어요</p>`}
    </section>
    <section class="card">
      <h2 class="h2">자동 매수</h2>
      <p class="muted">${STATES[state] ?? '아직 시작 전'}</p>
      ${toggle ? html`<button type="button" class="btn soft" id="toggle" data-kind="${toggle[0]}">${toggle[1]}</button>` : ''}
      ${canStop && !askStop ? html`<button type="button" class="btn soft" id="stop">중지</button>` : ''}
      ${canStop && askStop ? html`<p class="banner">중지하면 다시 시작하기 전까지 사지 않아요. 가진 주식은 그대로 있어요.</p>
        <div class="two"><button type="button" class="btn soft" id="stop-no">취소</button>
        <button type="button" class="btn" id="stop-yes">중지하기</button></div>` : ''}
    </section>
    <nav class="card menu" aria-label="설정 메뉴">
      <button type="button" class="menu-item" id="restart-flow">새로 시작 <span class="muted small">목표·금액·바구니 다시 정하기</span></button>
      <a class="menu-item" href="#/setup">고급 설정 <span class="muted small">종목·비율·주기 직접 정하기</span></a>
      <button type="button" class="menu-item" id="notice">위험 고지 다시 보기</button>
      <div class="menu-item static">로그인 <span class="muted small">지금은 손님으로 써요. 실제 돈 전에 본인 로그인을 붙여요</span></div>
      <button type="button" class="menu-item" id="out">나가기</button>
    </nav>
  </main>`.toString();

  const on = (id, fn) => { const el = root.querySelector(`#${id}`); if (el) el.onclick = fn; };
  on('goal', () => { begin('goal', s); ctx.go('start'); });
  on('restart-flow', () => { begin('full', s); ctx.go('start'); });
  on('notice', () => { begin('notice', s); ctx.go('start'); });
  on('toggle', (e) => ctx.send(e.currentTarget.dataset.kind, {}));
  on('stop', () => { askStop = true; render(root, ctx); });
  on('stop-no', () => { askStop = false; render(root, ctx); });
  on('stop-yes', () => { askStop = false; ctx.send('stop', {}); });
  on('out', () => { signOut(); ctx.go('login'); });
}
