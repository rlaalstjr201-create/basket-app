// 요청 보내기 + 처리될 때까지 지켜보기. 화면은 요청만 넣고, 반영은 서버 처리기가 한다.
import { api } from './api.js';
import { html } from './format.js';

const LABELS = { propose: '설정 확인', start: '자동 매수 시작', pause: '일시정지', resume: '재개', stop: '중지', skip: '이번 회차 건너뛰기', goal: '목표 저장' };
const WAITING = '서버에 요청했어요 · 반영까지 보통 1분, 늦으면 다음 예약 실행 때';

let inFlight = null;
let box = null;
let hideTimer = null;

// 알림 높이만큼 화면 아래 여백을 늘려, 알림이 마지막 내용을 가리지 않게 한다.
function setShown(on) {
  box.hidden = !on;
  document.body.style.setProperty('--req-h', on ? `${box.offsetHeight + 12}px` : '0px');
}

function show(kind, tone, text) {
  clearTimeout(hideTimer);
  if (tone === 'done') hideTimer = setTimeout(() => setShown(false), 5000);
  box.className = `req req-${tone}`;
  box.innerHTML = html`<strong>${LABELS[kind] ?? kind}</strong><span>${text}</span>`.toString();
  setShown(true);
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
    // 서버는 요청을 DONE으로 적은 뒤 화면 요약을 조금 늦게 쓴다. 한 번 더 읽되, 입력 중이면 건드리지 않는다.
    setTimeout(() => { if (!document.activeElement?.matches('input')) onSettled?.(); }, api.mock ? 2500 : 10000);
    return row;
  } catch (e) {
    inFlight = null;
    show(kind, 'bad', e.message);
    return null;
  }
}
