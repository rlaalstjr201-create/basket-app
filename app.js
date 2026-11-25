// 해시 라우터 + 로그인 가드 + 데이터 한 벌(state, records, requests).
import { api } from './api.js';
import { getSession } from './auth.js';
import { html } from './format.js';
import { mountRequestArea, send } from './requests.js';
import * as basket from './screens/basket.js';
import * as history from './screens/history.js';
import * as login from './screens/login.js';
import * as presets from './screens/presets.js';
import * as preview from './screens/preview.js';
import * as settings from './screens/settings.js';
import * as setup from './screens/setup.js';
import * as start from './screens/start.js';

const ROUTES = { login, basket, setup, preview, history, presets, start, settings };
const TABS = [['basket', '홈'], ['preview', '다음 매수'], ['history', '내역'], ['settings', '내 설정']];
const OPEN = new Set(['login']);
const NO_DATA = new Set(['login', 'presets']);

const root = document.getElementById('app');
const tabs = document.getElementById('tabs');
let data = null;

const routeName = () => location.hash.replace(/^#\/?/, '') || 'basket';

async function refresh() {
  data = await api.load();
  await render();
}

const ctx = {
  go: (name) => { location.hash = `#/${name}`; },
  rerender: () => render(),
  refresh,
  send: (kind, payload) => send(kind, payload, refresh),
  get data() { return data; },
  mock: api.mock,
};

async function render() {
  const name = routeName();
  const screen = ROUTES[name];
  if (!screen) return ctx.go('basket');
  if (!OPEN.has(name) && !getSession()) return location.replace('#/login');
  if (!NO_DATA.has(name) && !data) {
    try {
      data = await api.load();
    } catch (e) {
      root.innerHTML = html`<main class="screen"><h1 class="title">불러오지 못했어요</h1>
        <p class="muted">${e.message}</p><button type="button" class="btn" id="retry">다시 불러오기</button></main>`.toString();
      root.querySelector('#retry').onclick = () => refresh().catch(() => {});
      return;
    }
  }
  if (routeName() !== name) return;
  const tabbed = TABS.some(([t]) => t === name);
  document.body.classList.toggle('has-tabs', tabbed);
  tabs.hidden = !tabbed;
  tabs.innerHTML = html`${TABS.map(([t, label]) => html`<a href="#/${t}"${t === name ? html` aria-current="page"` : ''}>${label}</a>`)}`.toString();
  screen.render(root, ctx);
  document.title = `${screen.title} · 꾸준투자`;
}

if (api.mock) document.getElementById('mock-flag').hidden = false;
mountRequestArea(document.getElementById('req'));
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
