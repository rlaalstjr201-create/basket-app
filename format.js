// 표시 형식과 안전한 HTML 조립.
import { symbolInfo } from './model.js';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const usd = (dollars) => USD.format(dollars);
export const cents = (c) => USD.format(c / 100);
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const signedPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
export const shares = (q) => `${Number(q).toLocaleString('en-US', { maximumFractionDigits: 6 })}주`;

export function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${DAYS[d.getDay()]})`;
}

export function fullDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : String(iso ?? '');
}

export function when(isoTime) {
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return String(isoTime ?? '');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function month(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? `${m[1]}년 ${Number(m[2])}월` : key || '날짜 없음';
}

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));

export function html(strings, ...values) {
  return new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
}

// 종목 한 개: 자산 종류 칩 + 기호 + 이름.
export function symbol(sym, symbols) {
  const info = symbolInfo(sym, symbols);
  return html`<span class="symv">${info?.class ? html`<span class="chip">${info.class}</span>` : ''}<span class="sym">${sym}</span>${info?.name && info.name !== sym ? html`<span class="sname">${info.name}</span>` : ''}</span>`;
}
