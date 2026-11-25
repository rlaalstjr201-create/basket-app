import { cents, day, fullDay, html, pct, signedPct, symbol, usd, when } from '../format.js';
import { asBasket, basketRows, CYCLES, lastEvent, rebalanceHint, simpleGain, STATES } from '../model.js';

export const title = '홈';

const monthsBetween = (fromIso, toIso) => {
  const [a, b] = [fromIso, toIso].map((x) => x.split('-').map(Number));
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
};

// 목표 종류마다 크게 보여 줄 한 가지.
function hero(s, g, value) {
  const goal = s.goal;
  const money = html`<div class="kv"><span class="muted">넣은 돈</span><strong>${g ? usd(g.cost) : '$0.00'}</strong></div>
    <div class="kv"><span class="muted">지금 가치</span><strong>${usd(value)}${g?.pct == null ? '' : html` <span class="muted small">(${signedPct(g.pct)})</span>`}</strong></div>
    ${s.performance ? html`<div class="kv"><span class="muted">기준가 (시작 1,000)</span><strong>${s.performance.nav.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong></div>
      ${s.performance.benchmark ? html`<p class="note">같은 날 같은 돈을 S&amp;P 500(SPY)에 넣었다면 ${usd(s.performance.benchmark.value)} (${signedPct(s.performance.benchmark.simple_return)}) · 배당 미포함</p>` : ''}` : ''}`;
  if (goal?.type === 'target') {
    const target = goal.target_cents / 100;
    const done = Math.min(value / target, 1);
    const left = monthsBetween(new Date().toISOString().slice(0, 7) + '-01', goal.target_date);
    return html`<p class="muted small">${goal.name}</p>
      <h1 class="title huge">목표의 ${pct(done)}</h1>
      <div class="progress" role="progressbar" aria-label="목표까지 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(done * 100)}">
        <span style="width:${(done * 100).toFixed(1)}%"></span></div>
      <p class="muted">${usd(value)} / ${usd(target)} · ${fullDay(goal.target_date)}까지${left > 0 ? ` (${left}개월 남음)` : ''}</p>
      ${money}`;
  }
  const n = (s.bought_months ?? []).length;
  return html`<p class="muted small">${goal?.name ?? '꾸준히 하기'}</p>
    <h1 class="title huge">${n > 0 ? `${n}개월째 꾸준히` : '이제 막 시작했어요'}</h1>
    ${n > 0 ? '' : html`<p class="muted">첫 매수가 끝나면 개월 수를 세요</p>`}
    ${money}`;
}

function statusCard(s) {
  const sub = s.subscription;
  const b = asBasket(s.settings);
  const plan = b ? `${CYCLES[b.cycle] ?? b.cycle} ${cents(b.amount_cents)}` : '';
  const ev = lastEvent(sub);
  const lines = {
    ACTIVE: [html`${day(s.next_cycle)}에<br>부족한 쪽부터 살 예정이에요`, '따로 누를 필요 없어요'],
    PAUSED: ['일시정지 중이에요', '재개하기 전까지 사지 않아요'],
    NEEDS_APPROVAL: ['멈추고 확인을 기다려요', `이유 · ${ev?.reason ?? '기록 없음'}${ev ? ` (${when(ev.at)})` : ''}`],
    STOPPED: ['자동 매수를 멈췄어요', '다시 하려면 설정을 확인하고 시작해 주세요'],
  }[sub.state] ?? [sub.state, ''];
  const tone = sub.state === 'ACTIVE' ? 'on' : sub.state === 'NEEDS_APPROVAL' ? 'warn' : 'off';
  const target = sub.state === 'ACTIVE' || sub.state === 'PAUSED' ? '#/preview' : '#/settings';
  const button = target === '#/preview' ? '다음 매수 미리보기' : '내 설정 보기';
  return html`<a class="card status" href="${target}">
    <span class="tag"><span class="dot ${tone}"></span>${STATES[sub.state] ?? sub.state}${plan ? ` · ${plan}` : ''}</span>
    <span class="lead">${lines[0]}</span>
    <span class="muted">${lines[1]}</span>
    <span class="btn">${button}</span></a>`;
}

export function render(root, ctx) {
  const { state: s, records } = ctx.data;
  if (!s?.subscription) {
    if (!(ctx.data.requests ?? []).some((r) => r.kind === 'start' && r.status === 'DONE')) {
      location.replace('#/start');
      return;
    }
    root.innerHTML = html`<main class="screen"><h1 class="title">시작했어요</h1>
      <p class="muted">서버가 화면 정보를 새로 만드는 중이에요. 잠시 뒤 저절로 바뀌어요.</p></main>`.toString();
    setTimeout(() => ctx.refresh().catch(() => {}), ctx.mock ? 500 : 5000);
    return;
  }
  const b = asBasket(s.settings);
  const value = Object.values(s.values ?? {}).reduce((a, v) => a + v, 0);
  const outsideValue = Object.values(s.outside_values ?? {}).reduce((a, v) => a + v, 0);
  const g = simpleGain(s, records);
  const held = s.positions ?? {};
  const outside = g && Object.keys(held).some((k) => Math.abs((held[k] ?? 0) - (g.shares[k] ?? 0)) > 1e-9);
  const rows = basketRows(s);
  const hint = rebalanceHint(s);
  const state = s.subscription.state;
  const canRestart = (state === 'NEEDS_APPROVAL' || state === 'STOPPED') && s.settings_hash;

  root.innerHTML = html`<main class="screen">
    <header class="head">
      ${hero(s, g, value)}
      <p class="note">원금 손실이 날 수 있어요 · 모의계좌 · ${when(s.updated_at)} 기준${g ? ' · 단순 수익률' : ''}${outside ? ' · 기록 전에 갖고 있던 주식은 뺐어요' : ''}</p>
      ${outsideValue > 0 ? html`<p class="note">바구니 밖 보유 ${usd(outsideValue)}는 이 금액과 계산에서 뺐어요</p>` : ''}
      ${(s.corporate_actions ?? []).length ? html`<p class="note">기업 행사 반영 · ${s.corporate_actions.map((e) => e.text).join(' · ')}</p>` : ''}
      ${s.corporate_check_error ? html`<p class="note">기업 행사 확인 실패(이번 계산은 보정 없이)</p>` : ''}
    </header>
    ${statusCard(s)}
    ${canRestart ? html`<button type="button" class="btn" id="restart">지금 설정 그대로 다시 시작</button>
      <p class="note">멈춘 이유를 해결했다면 눌러 주세요. 설정은 바뀌지 않고, 다음 회차부터 다시 사요.</p>` : ''}
    ${hint ? html`<p class="banner">비율이 목표와 조금 달라요. ${day(hint.date)} 다음 매수 때 ${symbol(hint.sym, s.symbols)} 쪽을 더 사서 맞춰요.</p>` : ''}
    ${rows.length ? html`<section class="card track" aria-label="계획대로 가고 있나요">
      <h2 class="lead">계획대로 가고 있나요</h2>
      ${rows.map((r) => {
        const gap = r.now == null ? null : Math.round((r.now - r.target) * 100);
        return html`<div class="trow">
          <div class="row">${symbol(r.sym, s.symbols)}
            <span class="muted small nowrap">목표 ${pct(r.target)} · 지금 ${r.now == null ? '—' : pct(r.now)}${gap == null ? '' : html` <strong class="${Math.abs(gap) > 2 ? 'off' : ''}">${gap > 0 ? '+' : gap < 0 ? '−' : '±'}${Math.abs(gap)}%p</strong>`}</span></div>
          <div class="tbar" role="img" aria-label="목표 ${pct(r.target)}, 지금 ${r.now == null ? '없음' : pct(r.now)}">
            <span class="fill" style="width:${((r.now ?? 0) * 100).toFixed(1)}%"></span>
            <span class="mark" style="left:${(r.target * 100).toFixed(1)}%"></span></div></div>`;
      })}
      <p class="note">세로선이 목표예요. ±2%p를 넘으면 다음 매수 때 모자란 쪽을 더 사요 · ${b.name} · 팔지 않아요</p>
    </section>` : ''}
  </main>`.toString();

  const rs = root.querySelector('#restart');
  if (rs) rs.onclick = () => ctx.send('start', { settings_hash: s.settings_hash });
}
