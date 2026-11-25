// 요청 보내기 + 처리될 때까지 지켜보기. 화면은 요청만 넣고, 반영은 서버 처리기가 한다.
import { api } from './api.js';
import { html } from './format.js';

const LABELS = { propose: '설정 확인', start: '자동 매수 시작', pause: '일시정지', resume: '재개', stop: '중지', skip: '이번 회차 건너뛰기' };
const WAITING = '서버에 요청했어요 · 반영까지 보통 1분, 늦으면 다음 예약 실행 때';

let inFlight = null;
let box = null;
let hideTimer = null;

function show(kind, tone, text) {
  clearTimeout(hideTimer);
  if (tone === 'done') hideTimer = setTimeout(() => { box.hidden = true; }, 5000);
  box.className = `req req-${tone}`;
  box.hidden = false;
  box.innerHTML = html`<strong>${LABELS[kind] ?? kind}</strong><span>${text}</span>`.toString();
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const interval = (elapsed) => (api.mock ? 400 : elapsed < 180000 ? 4000 : 20000);

export function mountRequestArea(el) {
  box = el;
}

export function busy() {
  return inFlight !== null;
}

// 끝난 요청 행을 돌려준다(DONE 또는 REJECTED). onSettled는 데이터 새로고침.
export async function send(kind, payload, onSettled) {
  if (inFlight) {
    show(inFlight, 'wait', '앞 요청을 처리하는 중이에요. 끝나면 다시 눌러 주세요');
    return null;
  }
  inFlight = kind;
  try {
    let row = await api.send(kind, payload ?? {});
    show(kind, 'wait', WAITING);
    const started = Date.now();
    while (row && row.status === 'NEW') {
      await pause(interval(Date.now() - started));
      row = (await api.getRequest(row.id)) ?? row;
    }
    if (row.status === 'DONE') show(kind, 'done', '반영됐어요');
    else show(kind, 'bad', `거절됐어요 · ${row.result?.reason ?? '이유 없음'}`);
    inFlight = null;
    await onSettled?.();
    return row;
  } catch (e) {
    inFlight = null;
    show(kind, 'bad', e.message);
    return null;
  }
}
