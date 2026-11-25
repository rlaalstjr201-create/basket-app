import { signOut } from '../auth.js';
import { cents, day, html, pct, signedPct, usd, when } from '../format.js';
import { asBasket, basketRows, CYCLES, lastEvent, simpleGain, STATES } from '../model.js';

export const title = '내 바구니';

function statusCard(s) {
  const sub = s.subscription;
  const b = asBasket(s.settings);
  const plan = b ? `${CYCLES[b.cycle] ?? b.cycle} ${cents(b.amount_cents)}` : '';
  if (!sub) {
    return html`<a class="card status" href="#/setup">
      <span class="tag"><span class="dot off"></span>아직 자동 매수 전이에요</span>
      <span class="lead">바구니를 만들고 시작을 눌러 주세요</span>
      <span class="btn">바구니 만들기</span></a>`;
  }
  const ev = lastEvent(sub);
  const lines = {
    ACTIVE: [html`${day(s.next_cycle)}에<br>부족한 쪽부터 살 예정이에요`, '따로 누를 필요 없어요'],
    PAUSED: ['일시정지 중이에요', '재개하기 전까지 사지 않아요'],
    NEEDS_APPROVAL: ['멈추고 확인을 기다려요', `이유 · ${ev?.reason ?? '기록 없음'}${ev ? ` (${when(ev.at)})` : ''}`],
    STOPPED: ['자동 매수를 멈췄어요', '다시 하려면 설정을 확인하고 시작해 주세요'],
  }[sub.state] ?? [sub.state, ''];
  const tone = sub.state === 'ACTIVE' ? 'on' : sub.state === 'NEEDS_APPROVAL' ? 'warn' : 'off';
  const target = sub.state === 'ACTIVE' || sub.state === 'PAUSED' ? '#/preview' : '#/setup';
  const button = target === '#/preview' ? '다음 매수 미리보기' : '설정 확인하러 가기';
  return html`<a class="card status" href="${target}">
    <span class="tag"><span class="dot ${tone}"></span>${STATES[sub.state] ?? sub.state}${plan ? ` · ${plan}` : ''}</span>
    <span class="lead">${lines[0]}</span>
    <span class="muted">${lines[1]}</span>
    <span class="btn">${button}</span></a>`;
}

export function render(root, ctx) {
  const { state: s, records } = ctx.data;
  if (!s) {
    root.innerHTML = html`<main class="screen"><h1 class="title">내 바구니</h1>
      <p class="muted">서버가 아직 화면용 요약을 만들지 않았어요.</p></main>`.toString();
    return;
  }
  const b = asBasket(s.settings);
  const value = Object.values(s.values ?? {}).reduce((a, v) => a + v, 0);
  const g = simpleGain(s, records);
  const held = s.positions ?? {};
  const outside = g && Object.keys(held).some((k) => Math.abs((held[k] ?? 0) - (g.shares[k] ?? 0)) > 1e-9);
  const rows = basketRows(s);
  const core = b ? Object.values(b.core).reduce((a, w) => a + w, 0) : 0;
  const state = s.subscription?.state;
  const toggle = state === 'ACTIVE' ? ['pause', '일시정지'] : state === 'PAUSED' ? ['resume', '재개'] : null;
  const canRestart = (state === 'NEEDS_APPROVAL' || state === 'STOPPED') && s.settings_hash;

  root.innerHTML = html`<main class="screen">
    <header class="head">
      <p class="muted small">${b?.name ?? '내 바구니'} · ${when(s.updated_at)} 기준 · 모의계좌</p>
      <h1 class="title huge">${usd(value)}</h1>
      ${g ? html`<p class="muted">넣은 돈 ${usd(g.cost)} · 지금 ${g.now == null ? '가격 없음' : usd(g.now)}
          ${g.pct == null ? '' : html` · <strong class="ink">${signedPct(g.pct)}</strong>`}</p>
        <p class="note">단순 수익률, 기준가는 다음 단계${outside ? ' · 기록 전에 갖고 있던 주식은 뺐어요' : ''}</p>`
        : html`<p class="muted">아직 체결된 매수 기록이 없어요</p>`}
    </header>
    ${statusCard(s)}
    ${canRestart ? html`<button type="button" class="btn" id="restart">지금 설정 그대로 다시 시작</button>
      <p class="note">멈춘 이유를 해결했다면 눌러 주세요. 설정은 바뀌지 않고, 다음 회차부터 다시 사요.</p>` : ''}
    ${rows.length ? html`<details class="card fold">
      <summary>바구니 안 보기</summary>
      <div class="rows">
        <p class="note">코어 ${pct(core)} · 위성 ${pct(1 - core)} (위성 상한 ${pct(b.satellite_cap)})</p>
        ${rows.map((r) => html`<div class="row"><span><span class="chip">${r.part}</span> ${r.sym}</span>
          <span class="muted">목표 ${pct(r.target)} · 지금 ${r.now == null ? '—' : pct(r.now)}</span></div>`)}
      </div></details>` : ''}
    <footer class="foot links">
      ${toggle ? html`<button type="button" class="link" id="toggle" data-kind="${toggle[0]}">${toggle[1]}</button>` : ''}
      <a class="link" href="#/history">월별 내역</a>
      <a class="link" href="#/setup">바구니 바꾸기</a>
      <button type="button" class="link" id="out">나가기</button>
    </footer>
  </main>`.toString();

  const rs = root.querySelector('#restart');
  if (rs) rs.onclick = () => ctx.send('start', { settings_hash: s.settings_hash });
  const t = root.querySelector('#toggle');
  if (t) t.onclick = () => ctx.send(t.dataset.kind, {});
  root.querySelector('#out').onclick = () => { signOut(); ctx.go('login'); };
}
