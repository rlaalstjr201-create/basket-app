import { html } from '../format.js';
import { blankForm, formFromBasket } from '../model.js';
import { usePrefill } from './setup.js';

export const title = '시작 비율 고르기';

const basket = (name, core) => formFromBasket({ name, core, satellite: {}, satellite_cap: 0.2, per_symbol_cap: 0.1,
                                                 amount_cents: 100000, cycle: 'monthly', side: 'buy' });

let age = 35;
const ageBonds = () => Math.min(Math.max(Math.round(age), 10), 90) / 100;

const PRESETS = [
  { id: 'base', name: '기본 · 60 / 40', tag: '기본', checked: true,
    parts: () => [['SPY', 0.6, '미국 주식'], ['IEF', 0.4, '중기 국채']],
    form: () => basket('기본 60/40', { SPY: 0.6, IEF: 0.4 }) },
  { id: 'buffett', name: '버핏식 · 90 / 10', tag: '2013 주주서한',
    parts: () => [['VOO', 0.9, 'S&P 500 지수'], ['VGSH', 0.1, '단기 국채']],
    form: () => basket('버핏식 90/10', { VOO: 0.9, VGSH: 0.1 }) },
  { id: 'allweather', name: '올웨더식', tag: '레이 달리오 · 토니 로빈스 소개 버전',
    parts: () => [['VOO', 0.3, '주식'], ['TLT', 0.4, '장기 국채'], ['IEF', 0.15, '중기 국채'], ['GLD', 0.075, '금'],
                  ['DBC', 0.075, '원자재']],
    form: () => basket('올웨더식', { VOO: 0.3, TLT: 0.4, IEF: 0.15, GLD: 0.075, DBC: 0.075 }) },
  { id: 'age', name: '나이 기준', tag: '존 보글',
    parts: () => [['VTI', 1 - ageBonds(), '미국 주식'], ['BND', ageBonds(), '채권']],
    form: () => basket(`나이 기준 (${Math.round(ageBonds() * 100)}세)`,
                       { VTI: Math.round((1 - ageBonds()) * 100) / 100, BND: ageBonds() }) },
  { id: 'blank', name: '처음부터 직접 정하기', form: blankForm },
];

const SHADES = ['#4A4945', '#8A877F', '#B9B5AC', '#C2571A', '#E2C9A6'];
const pctLabel = (w) => `${Math.round(w * 1000) / 10}`;

let chosen = 'base';

function card(p) {
  const parts = p.parts();
  return html`<button type="button" class="pick" aria-pressed="${chosen === p.id}" data-id="${p.id}">
    <span class="row"><strong>${p.name}</strong><span class="muted small">${p.tag}</span></span>
    <span class="bar multi" aria-hidden="true">${parts.map(([, w], i) => html`<span style="width:${(w * 100).toFixed(1)}%;background:${SHADES[i]}"></span>`)}</span>
    <span class="muted small">${parts.map(([sym, w, what]) => `${what} ${pctLabel(w)} (${sym})`).join(' · ')}</span>
    ${p.id === 'age' ? html`<span class="muted small">채권 = 내 나이 %. 해마다 저절로 바뀌지 않아요, 1년에 한 번 직접 고쳐 주세요</span>` : ''}
    ${p.checked ? '' : html`<span class="note">검증 밖 · 개인 선택 영역</span>`}
  </button>
  ${p.id === 'age' && chosen === 'age' ? html`<label class="kv age">내 나이 <input id="age" type="number" inputmode="numeric" min="10" max="90" value="${age}"></label>` : ''}`;
}

export function render(root, ctx) {
  root.innerHTML = html`<main class="screen">
    <header class="head">
      <a class="back" href="#/setup">← 고급 설정</a>
      <h1 class="title">어떤 비율로 시작할까요?</h1>
      <p class="muted small">예시이며 투자 권유가 아닙니다. 고른 뒤 마음대로 고칠 수 있어요.</p>
    </header>
    ${PRESETS.map((p) => (p.parts ? card(p)
      : html`<button type="button" class="pick dashed" aria-pressed="${chosen === p.id}" data-id="${p.id}"><strong>${p.name}</strong></button>`))}
    <footer class="foot">
      <p class="note center">검증한 비율은 기본 60/40뿐이에요 · 나머지는 알려진 예시를 그대로 옮긴 것이에요</p>
      <button type="button" class="btn" id="use">이걸로 시작하고 비율 고치기</button>
    </footer>
  </main>`.toString();

  root.querySelectorAll('.pick').forEach((el) => {
    el.onclick = () => { chosen = el.dataset.id; render(root, ctx); };
  });
  const a = root.querySelector('#age');
  if (a) a.onchange = () => { age = Number(a.value) || 35; render(root, ctx); };
  root.querySelector('#use').onclick = () => {
    usePrefill(PRESETS.find((p) => p.id === chosen).form());
    ctx.go('setup');
  };
}
