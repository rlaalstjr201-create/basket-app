import { html } from '../format.js';
import { blankForm, formFromBasket } from '../model.js';
import { usePrefill } from './setup.js';

export const title = '시작 비율 고르기';

const PRESETS = [
  { id: 'base', name: '기본 · 60 / 40', tag: '기본', desc: 'SPY 60 · IEF 40 (미국 주식 60 · 중기 국채 40)',
    form: () => formFromBasket({ name: '기본 60/40', core: { SPY: 0.6, IEF: 0.4 }, satellite: {}, satellite_cap: 0.2,
                                 per_symbol_cap: 0.1, amount_cents: 100000, cycle: 'monthly', side: 'buy' }) },
  { id: 'blank', name: '처음부터 직접 정하기', form: blankForm },
];

let chosen = 'base';

export function render(root, ctx) {
  root.innerHTML = html`<main class="screen">
    <header class="head">
      <a class="back" href="#/setup">← 바구니 만들기</a>
      <h1 class="title">어떤 비율로 시작할까요?</h1>
      <p class="muted small">예시이며 투자 권유가 아닙니다. 고른 뒤 마음대로 고칠 수 있어요.</p>
    </header>
    ${PRESETS.map((p) => (p.desc ? html`<button type="button" class="pick" aria-pressed="${chosen === p.id}" data-id="${p.id}">
        <span class="row"><strong>${p.name}</strong><span class="muted small">${p.tag}</span></span>
        <span class="bar"><span style="width:60%"></span><span style="width:40%"></span></span>
        <span class="muted small">${p.desc}</span></button>`
      : html`<button type="button" class="pick dashed" aria-pressed="${chosen === p.id}" data-id="${p.id}"><strong>${p.name}</strong></button>`))}
    <footer class="foot">
      <p class="note center">지금은 확인된 기본 비율과 직접 정하기만 열어 두었어요</p>
      <button type="button" class="btn" id="use">이걸로 시작하고 비율 고치기</button>
    </footer>
  </main>`.toString();

  root.querySelectorAll('.pick').forEach((el) => {
    el.onclick = () => { chosen = el.dataset.id; render(root, ctx); };
  });
  root.querySelector('#use').onclick = () => {
    usePrefill(PRESETS.find((p) => p.id === chosen).form());
    ctx.go('setup');
  };
}
