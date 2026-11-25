// 데이터 통로. ?mock=<이름>이면 mock/ 폴더의 가짜 데이터와 메모리 속 가짜 서버를 쓴다(실제 요청 없음).
import { getSession } from './auth.js';
import { SUPABASE_KEY, SUPABASE_REST } from './config.js';
import { createMock } from './mock.js';

const REQUEST_COLS = 'id,kind,status,result,created_at';

function live() {
  const headers = () => {
    const h = { apikey: SUPABASE_KEY };
    const token = getSession()?.accessToken;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };
  const get = async (path) => {
    const res = await fetch(`${SUPABASE_REST}/${path}`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) throw new Error(`읽기 실패 (${res.status})`);
    return res.json();
  };
  return {
    mock: false,
    async load() {
      const [state, records, requests] = await Promise.all([
        get('wa_app_state?select=body,updated_at'),
        get('wa_cycle_records?select=body,created_at&order=id.asc'),
        get(`wa_requests?select=${REQUEST_COLS}&order=id.desc&limit=20`),
      ]);
      return { state: state[0]?.body ?? null, records: records.map((r) => r.body), requests };
    },
    async getRequest(id) {
      const rows = await get(`wa_requests?select=${REQUEST_COLS}&id=eq.${Number(id)}`);
      return rows[0] ?? null;
    },
    async send(kind, payload) {
      const res = await fetch(`${SUPABASE_REST}/wa_requests`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ kind, payload }),
      });
      if (!res.ok) throw new Error(`요청을 보내지 못했어요 (${res.status})`);
      return (await res.json())[0];
    },
  };
}

const mockName = new URLSearchParams(location.search).get('mock');
export const api = mockName ? createMock(mockName) : live();
