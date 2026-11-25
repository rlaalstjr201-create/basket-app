import { cents, html, pct } from '../format.js';
import { asBasket, blankForm, CYCLES, formFromBasket, toSettings } from '../model.js';

export const title = '바구니 만들기';

let form = null;
let proposal = null;
let waiting = false;

export function usePrefill(f) {
  form = f;
  proposal = null;
}

const rowView = (part, r, i) => html`<div class="edit-row">
  <input type="text" class="sym-input" value="${r.sym}" data-part="${part}" data-i="${i}" data-f="sym" placeholder="VTI"
    aria-label="${part === 'core' ? '코어' : '위성'} 종목 ${i + 1} 기호" autocapitalize="characters" autocomplete="off" spellcheck="false">
  <span class="pct-input"><input type="text" inputmode="decimal" value="${r.pct}" data-part="${part}" data-i="${i}" data-f="pct"
    aria-label="${part === 'core' ? '코어' : '위성'} 종목 ${i + 1} 목표 비중(%)">%</span>
  <button type="button" class="x" data-del="${part}" data-i="${i}" aria-label="${part === 'core' ? '코어' : '위성'} 종목 ${i + 1} 빼기">빼기</button>
</div>`;

const field = (label, key, value, unit, wide) => html`<label class="field"><span>${label}</span>
  <span class="pct-input">${unit === '$' ? '$' : ''}<input type="text" inputmode="decimal" class="${wide ? 'wide' : ''}"
    value="${value}" data-key="${key}" aria-label="${label}${unit === '%' ? '(%)' : '(달러)'}">${unit === '%' ? '%' : ''}</span></label>`;

function summaryView(s, hash) {
  const lines = (m) => Object.entries(m).map(([k, w]) => `${k} ${pct(w, w * 100 % 1 ? 2 : 0)}`).join(' · ') || '없음';
  return html`<section class="card confirm" aria-live="polite">
    <h2 class="h2">서버가 확인했어요</h2>
    <div class="kv"><span class="muted">이름</span><span>${s.name}</span></div>
    <div class="kv"><span class="muted">코어</span><span>${lines(s.core)}</span></div>
    <div class="kv"><span class="muted">위성</span><span>${lines(s.satellite)}</span></div>
    <div class="kv"><span class="muted">위성 상한</span><span>합계 ${pct(s.satellite_cap)} · 종목당 ${pct(s.per_symbol_cap)}</span></div>
    <div class="kv"><span class="muted">사는 방식</span><span>${CYCLES[s.cycle]} ${cents(s.amount_cents)}</span></div>
    <p class="note">설정 번호 ${hash.slice(0, 8)}</p>
  </section>`;
}

export function render(root, ctx) {
  if (!form) {
    const b = asBasket(ctx.data.state?.settings);
    form = b ? formFromBasket(b) : blankForm();
  }
  root.innerHTML = html`<main class="screen">
    <header class="head">
      <a class="back" href="#/basket">← 내 바구니</a>
      <h1 class="title">바구니 만들기</h1>
      <p class="muted small">종목과 비율은 직접 정해요. <a href="#/presets">예시에서 시작</a>할 수도 있어요. 미국 종목만, 달러로 사요.</p>
    </header>
    <section class="card form">
      <label class="field"><span>바구니 이름</span><input type="text" class="name" value="${form.name}" data-key="name" aria-label="바구니 이름"></label>
    </section>
    <section class="card form">
      <h2 class="h2">코어 · 넓게 담는 쪽</h2>
      ${form.core.map((r, i) => rowView('core', r, i))}
      <button type="button" class="add" data-add="core">+ 코어 종목 추가</button>
    </section>
    <section class="card form">
      <h2 class="h2">위성 · 내가 고른 종목</h2>
      ${form.satellite.map((r, i) => rowView('satellite', r, i))}
      <button type="button" class="add" data-add="satellite">+ 위성 종목 추가</button>
    </section>
    <section class="card form">
      <h2 class="h2">안전장치</h2>
      ${field('위성 합계 상한', 'satCap', form.satCap, '%')}
      ${field('위성 종목당 상한', 'perCap', form.perCap, '%')}
      <p class="note">상한을 넘은 종목엔 돈을 넣지 않아요. 팔지는 않아요.</p>
    </section>
    <section class="card form">
      <h2 class="h2">사는 방식</h2>
      ${field('한 번에 넣을 돈', 'amount', form.amount, '$', true)}
      <div role="radiogroup" aria-label="매수 주기" class="seg">
        ${Object.entries(CYCLES).map(([k, label]) => html`<button type="button" role="radio" aria-checked="${form.cycle === k}" data-cycle="${k}">${label}</button>`)}
      </div>
      <p class="note">일시정지하기 전까지 이 설정대로 사요. 설정 밖 상황(현금 부족, 오류)이면 멈추고 물어봐요.</p>
    </section>
    <footer class="foot">
      <div id="check"></div>
      <p class="note center">저장해도 지금 사고팔지 않아요. 다음 회차부터 반영돼요.</p>
      ${proposal ? html`${summaryView(proposal.settings, proposal.hash)}
          <button type="button" class="btn" id="start">이 설정으로 자동 매수 시작</button>`
        : html`<button type="button" class="btn" id="propose">${waiting ? '서버가 확인하는 중…' : '설정 확인'}</button>`}
    </footer>
  </main>`.toString();

  const checkBox = root.querySelector('#check');
  const proposeBtn = root.querySelector('#propose');
  const showCheck = () => {
    const c = toSettings(form);
    checkBox.innerHTML = html`<p class="muted center">${c.summary}</p>
      ${c.errors.length ? html`<ul class="errors">${c.errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}`.toString();
    if (proposeBtn) proposeBtn.disabled = waiting || c.errors.length > 0;
    return c;
  };
  showCheck();

  const edited = () => {
    if (proposal) {
      proposal = null;
      render(root, ctx);
    } else showCheck();
  };
  root.querySelectorAll('input[data-part]').forEach((el) => {
    el.oninput = () => { form[el.dataset.part][el.dataset.i][el.dataset.f] = el.value; edited(); };
  });
  root.querySelectorAll('input[data-key]').forEach((el) => {
    el.oninput = () => { form[el.dataset.key] = el.value; edited(); };
  });
  root.querySelectorAll('[data-add]').forEach((el) => {
    el.onclick = () => { form[el.dataset.add].push({ sym: '', pct: '' }); proposal = null; render(root, ctx); };
  });
  root.querySelectorAll('[data-del]').forEach((el) => {
    el.onclick = () => { form[el.dataset.del].splice(Number(el.dataset.i), 1); proposal = null; render(root, ctx); };
  });
  root.querySelectorAll('[data-cycle]').forEach((el) => {
    el.onclick = () => { form.cycle = el.dataset.cycle; proposal = null; render(root, ctx); };
  });

  if (proposeBtn) {
    proposeBtn.onclick = async () => {
      const { settings } = toSettings(form);
      if (!settings) return;
      waiting = true;
      render(root, ctx);
      const row = await ctx.send('propose', { settings });
      waiting = false;
      if (row?.status === 'DONE' && row.result?.settings_hash) proposal = { settings, hash: row.result.settings_hash };
      ctx.rerender();
    };
  }
  const startBtn = root.querySelector('#start');
  if (startBtn) {
    startBtn.onclick = async () => {
      startBtn.disabled = true;
      const row = await ctx.send('start', { settings_hash: proposal.hash });
      if (row?.status === 'DONE') {
        form = null;
        proposal = null;
        ctx.go('basket');
      } else startBtn.disabled = false;
    };
  }
}
