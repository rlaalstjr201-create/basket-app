import { cents, fullDay, html, pct, symbol } from '../format.js';
import { DEFAULT_BASKET, formFromBasket } from '../model.js';
import { usePrefill } from './setup.js';

export const title = '시작하기';

// 흐름마다 거치는 단계와, 마지막에 서버로 보내는 요청 순서.
// settled: 서버가 요청을 반영한 뒤 화면 요약까지 새로 썼는지(요약은 요청 처리보다 조금 늦게 바뀐다).
const FLOWS = {
  full: { steps: ['notice', 'goal', 'amount', 'risk', 'confirm'], jobs: ['goal', 'propose', 'start'],
          settled: (s, d) => s?.subscription?.state === 'ACTIVE'
            && s.subscription.settings_hash === d.jobs.find((j) => j.kind === 'start').result.settings_hash },
  goal: { steps: ['goal', 'confirm'], jobs: ['goal'],
          settled: (s, d) => ['type', 'name', 'target_cents', 'target_date']
            .every((k) => (s?.goal?.[k] ?? null) === (d.jobs[0].result[k] ?? null)) },
  notice: { steps: ['notice'], jobs: [] },
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const JOB_LABELS = { goal: '목표 저장', propose: '설정 확인(종목이 있는지 증권사에 조회)', start: '자동 매수 시작' };
const QUICK = [100, 300, 500];

let draft = null;
let risk; // undefined: 아직 안 읽음, null: 읽기 실패
let riskAsked = false;

export function begin(flow, state) {
  const g = state?.goal;
  const amount = state?.settings?.amount_cents;
  draft = {
    flow, at: 0, error: '', running: false,
    goalType: g?.type ?? 'steady', goalName: g?.name && g.name !== '꾸준히 하기' && g.name !== '내 목표' ? g.name : '',
    target: g?.target_cents ? String(g.target_cents / 100) : '', by: g?.target_date ?? '',
    amount: amount ? String(amount / 100) : '',
    jobs: FLOWS[flow].jobs.map((kind) => ({ kind, status: 'wait', result: null })),
  };
}

function loadRisk(ctx) {
  if (riskAsked) return;
  riskAsked = true;
  fetch('risk.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    .then((r) => { risk = r; ctx.rerender(); });
}

function dollarsToCents(text) {
  const t = String(text ?? '').replace(/[,\s$]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function goalErrors(d) {
  if (d.goalType !== 'target') return [];
  const errors = [];
  if (!(dollarsToCents(d.target) >= 100)) errors.push('목표 금액을 $1 이상으로 적어 주세요');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.by) || d.by <= todayIso()) errors.push('기한은 오늘 뒤 날짜로 골라 주세요');
  return errors;
}

const amountErrors = (d) => (dollarsToCents(d.amount) >= 100 ? [] : ['매달 넣을 돈을 $1 이상으로 적어 주세요']);

function goalPayload(d) {
  const name = d.goalName.trim();
  if (d.goalType === 'steady') return { type: 'steady', ...(name && { name }) };
  return { type: 'target', ...(name && { name }), target_cents: dollarsToCents(d.target), target_date: d.by };
}

const settingsOf = (d) => ({ ...DEFAULT_BASKET, amount_cents: dollarsToCents(d.amount) });

function goalText(d) {
  const name = d.goalName.trim();
  if (d.goalType === 'steady') return name ? `꾸준히 하기 · ${name}` : '꾸준히 하기';
  return `${name || '내 목표'} · ${fullDay(d.by)}까지 ${cents(dollarsToCents(d.target))}`;
}

const pick = (on, value, head, sub) => html`<button type="button" class="pick" role="radio" aria-checked="${on}" data-goal="${value}" aria-label="${head}. ${sub}">
  <strong>${head}</strong><span class="muted small">${sub}</span></button>`;

const errorList = (errors) => (errors.length ? html`<ul class="errors">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : '');

const VIEWS = {
  notice: (d) => html`<h1 class="title">시작하기 전에 꼭 알아 두세요</h1>
    <section class="card notice">
      <p><strong>원금 손실이 날 수 있어요.</strong> 주식·채권 값은 내려가기도 해요.</p>
      <p><strong>지금은 모의계좌예요.</strong> 진짜 돈은 나가지 않고, 달러로 연습해요.</p>
      <p><strong>앱은 사기만 해요.</strong> 정해진 날 정해진 돈만큼 사고, 팔지 않아요.</p>
      <p><strong>직접 사고팔기는 증권사 앱에서</strong> 하세요. 이 앱엔 주문 화면이 없어요.</p>
      <p><strong>투자 권유가 아니에요.</strong> 무엇을 살지는 내가 정해요.</p>
    </section>
    <div class="spacer"></div>
    <button type="button" class="btn" data-next>${d.flow === 'notice' ? '확인했어요' : '확인했어요, 다음'}</button>`,

  goal: (d) => html`<h1 class="title">어떤 목표로 모을까요?</h1>
    <div role="radiogroup" aria-label="목표 종류" class="picks">
      ${pick(d.goalType === 'steady', 'steady', '꾸준히 하기 (기본)', '목표 금액 없이 매달 같은 돈을 넣어요')}
      ${pick(d.goalType === 'target', 'target', '목표 금액·기한 정하기', '언제까지 얼마를 모을지 정하고, 어디쯤 왔는지 봐요')}
    </div>
    <section class="card form">
      ${d.goalType === 'target' ? html`
        <label class="field"><span>목표 금액</span><span class="pct-input">$<input type="text" inputmode="decimal" class="wide"
          value="${d.target}" data-key="target" placeholder="30000" aria-label="목표 금액(달러)"></span></label>
        <label class="field"><span>기한</span><input type="date" value="${d.by}" data-key="by" min="${todayIso()}" aria-label="기한"></label>` : ''}
      <label class="field"><span>이름 <span class="muted small">(선택)</span></span>
        <input type="text" class="name" value="${d.goalName}" data-key="goalName" maxlength="40" aria-label="목표 이름(선택)"
          placeholder="${d.goalType === 'steady' ? '꾸준히 하기' : '내 목표'}"></label>
    </section>
    <div id="errors">${errorList(goalErrors(d))}</div>
    <div class="spacer"></div>
    <button type="button" class="btn" data-next ${goalErrors(d).length ? 'disabled' : ''}>다음</button>`,

  amount: (d) => html`<h1 class="title">매달 얼마씩 넣을까요?</h1>
    <p class="muted">모의계좌라 달러로 연습해요. 매달 한 번, 이 돈만큼 사요.</p>
    <section class="card form">
      <label class="field"><span>매달 넣을 돈</span><span class="pct-input">$<input type="text" inputmode="decimal" class="wide"
        value="${d.amount}" data-key="amount" placeholder="300" aria-label="매달 넣을 돈(달러)"></span></label>
      <div class="seg">${QUICK.map((q) => html`<button type="button" data-quick="${q}" aria-pressed="${d.amount === String(q)}">$${q}</button>`)}</div>
    </section>
    <div id="errors">${d.amount ? errorList(amountErrors(d)) : ''}</div>
    <div class="spacer"></div>
    <button type="button" class="btn" data-next ${amountErrors(d).length ? 'disabled' : ''}>다음</button>`,

  risk: (d, r) => {
    const base = r?.portfolios?.['60/40'];
    const stocks = r?.portfolios?.['100/0'];
    const example = base ? Math.round(10000 * (1 + base.max_drawdown)) : null;
    const trough = base ? base.max_drawdown_trough.replace(/^(\d{4})-0?(\d+)$/, '$1년 $2') : '';
    return html`<h1 class="title">얼마나 흔들려도 괜찮을까요?</h1>
    <p class="muted">과거에 가장 나빴던 때를 보여 드려요. 이만큼 내려가도 계속 넣을 수 있는지 생각해 보세요.</p>
    ${r === undefined ? html`<p class="muted">과거 숫자를 불러오는 중…</p>`
      : !base ? html`<p class="banner">과거 숫자를 불러오지 못했어요. 그래도 원금 손실이 날 수 있어요.</p>`
      : html`<section class="card">
        <span class="tag">${base.label}</span>
        <span class="bar" aria-hidden="true"><span style="width:60%"></span><span style="width:40%"></span></span>
        <div class="rows">${Object.entries(DEFAULT_BASKET.core).map(([s, w]) => html`<div class="row">${symbol(s)}<span class="muted">${pct(w)}</span></div>`)}</div>
        <div class="kv"><span class="muted">가장 나빴던 해</span><strong>${base.worst_year}년 ${pct(base.worst_year_return, 1)}</strong></div>
        <div class="kv"><span class="muted">가장 크게 떨어진 폭</span><strong>${pct(base.max_drawdown, 1)}</strong></div>
        <p class="note">예: $10,000이었다면 가장 나쁠 때 약 $${example.toLocaleString('en-US')}까지 내려갔어요 (${trough}월 바닥).</p>
      </section>
      ${stocks ? html`<p class="muted small">${stocks.label}: 가장 나빴던 해 ${stocks.worst_year}년 ${pct(stocks.worst_year_return, 1)},
        가장 크게 떨어진 폭 ${pct(stocks.max_drawdown, 1)}</p>` : ''}
      <p class="note"><strong>과거 기록, 미래 보장 아님, 세금·수수료 미반영.</strong> 기간 <span class="nowrap">${r.period}</span> · 출처 ${r.source}</p>`}
    <div class="spacer"></div>
    <button type="button" class="btn" data-next>기본 60/40로 시작</button>
    <button type="button" class="btn soft" id="advanced">직접 정하기(고급)</button>`;
  },

  confirm: (d) => {
    const full = d.flow === 'full';
    return html`<h1 class="title">${full ? '이대로 시작할까요?' : '목표를 이렇게 바꿀까요?'}</h1>
    <section class="card confirm">
      <div class="kv"><span class="muted">목표</span><span>${goalText(d)}</span></div>
      ${full ? html`<div class="kv"><span class="muted">매달</span><span>${cents(dollarsToCents(d.amount))} · 월 1회</span></div>
        <div class="kv"><span class="muted">바구니</span><span>${DEFAULT_BASKET.name}</span></div>
        <div class="rows">${Object.entries(DEFAULT_BASKET.core).map(([s, w]) => html`<div class="row">${symbol(s)}<span class="muted">${pct(w)}</span></div>`)}</div>` : ''}
    </section>
    ${full ? html`<p class="note">시작하면 다음 거래일에 첫 매수를 하고, 그 뒤 매달 같은 날 사요. 비율이 어긋나면 모자란 쪽을 더 사서 맞춰요.
      팔지 않아요. 언제든 내 설정에서 일시정지·중지할 수 있어요.</p>` : html`<p class="note">목표는 화면 표시에만 써요. 사는 방식은 바뀌지 않아요.</p>`}
    ${d.running || d.jobs.some((j) => j.status !== 'wait') ? html`<ol class="jobs" aria-live="polite">${d.jobs.map((j) => html`<li class="job-${j.status}">
      <span>${JOB_LABELS[j.kind]}</span><span class="muted small">${{ wait: '대기', run: '서버가 처리하는 중…', done: '완료', bad: '실패' }[j.status]}</span></li>`)}</ol>` : ''}
    ${d.error ? html`<p class="banner">${d.error}</p>` : ''}
    <div class="spacer"></div>
    <p class="note center">요청마다 서버 반영에 보통 40초쯤 걸려요.</p>
    <button type="button" class="btn" id="go" ${d.running ? 'disabled' : ''}>${d.syncing ? '반영됐어요 · 화면 정보를 받는 중…' : d.running ? '보내는 중…' : d.error ? '다시 시도' : full ? '시작' : '목표 저장'}</button>`;
  },
};

async function run(ctx) {
  const d = draft;
  d.running = true;
  d.error = '';
  const payload = {
    goal: () => goalPayload(d),
    propose: () => ({ settings: settingsOf(d) }),
    start: () => ({ settings_hash: d.jobs.find((j) => j.kind === 'propose').result.settings_hash }),
  };
  for (const job of d.jobs) {
    if (job.status === 'done') continue;
    job.status = 'run';
    ctx.rerender();
    const row = await ctx.send(job.kind, payload[job.kind]());
    if (row?.status !== 'DONE') {
      job.status = 'bad';
      d.error = `${JOB_LABELS[job.kind]}에 실패했어요 · ${row?.result?.reason ?? '앞 요청이 끝난 뒤 다시 눌러 주세요'}`;
      d.running = false;
      ctx.rerender();
      return;
    }
    job.status = 'done';
    job.result = row.result;
  }
  d.syncing = true;
  ctx.rerender();
  for (let i = 0; i < 40 && !FLOWS[d.flow].settled(ctx.data.state, d); i += 1) {
    await pause(ctx.mock ? 300 : 3000);
    await ctx.refresh().catch(() => {});
  }
  draft = null;
  ctx.go(d.flow === 'goal' ? 'settings' : 'basket');
}

export function render(root, ctx) {
  const s = ctx.data.state;
  if (!draft) begin('full', s);
  const d = draft;
  const steps = FLOWS[d.flow].steps;
  const step = steps[d.at];
  if (step === 'risk') loadRisk(ctx);
  const exit = s?.subscription ? html`<a class="back" href="#/settings" id="exit">← 내 설정으로</a>` : '';
  root.innerHTML = html`<main class="screen onboarding">
    <header class="head">
      ${d.at > 0 && !d.running ? html`<button type="button" class="back" id="prev">← 이전</button>` : exit}
      ${steps.length > 1 ? html`<p class="muted small">${d.at + 1} / ${steps.length}</p>` : ''}
    </header>
    ${VIEWS[step](d, risk)}
  </main>`.toString();

  const rerenderErrors = () => {
    const box = root.querySelector('#errors');
    const next = root.querySelector('[data-next]');
    const errors = step === 'goal' ? goalErrors(d) : amountErrors(d);
    if (box && (step === 'goal' || d.amount)) box.innerHTML = errorList(errors).toString();
    if (next) next.disabled = errors.length > 0;
  };
  root.querySelectorAll('input[data-key]').forEach((el) => {
    el.oninput = () => { d[el.dataset.key] = el.value; rerenderErrors(); };
  });
  root.querySelectorAll('[data-goal]').forEach((el) => {
    el.onclick = () => { d.goalType = el.dataset.goal; render(root, ctx); };
  });
  root.querySelectorAll('[data-quick]').forEach((el) => {
    el.onclick = () => { d.amount = el.dataset.quick; render(root, ctx); };
  });
  const prev = root.querySelector('#prev');
  if (prev) prev.onclick = () => { d.at -= 1; render(root, ctx); };
  const exitLink = root.querySelector('#exit');
  if (exitLink) exitLink.onclick = () => { draft = null; };
  const next = root.querySelector('[data-next]');
  if (next) {
    next.onclick = () => {
      if (d.at + 1 < steps.length) {
        d.at += 1;
        window.scrollTo(0, 0);
        render(root, ctx);
      } else {
        draft = null;
        ctx.go(s?.subscription ? 'settings' : 'basket');
      }
    };
  }
  const advanced = root.querySelector('#advanced');
  if (advanced) {
    advanced.onclick = () => {
      const goal = goalPayload(d);
      usePrefill(formFromBasket(settingsOf(d)), () => ctx.send('goal', goal));
      draft = null;
      ctx.go('setup');
    };
  }
  const go = root.querySelector('#go');
  if (go) go.onclick = () => run(ctx);
}
