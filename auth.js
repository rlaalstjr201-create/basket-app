// 로그인 자리. 지금은 손님으로 들어간다(app/SPEC.md 결정 2). 실주문 단계 전에 Supabase Auth로 바꾼다:
// signIn이 토큰을 받아 session.accessToken에 넣으면 api.js가 Authorization 헤더로 보낸다.
const KEY = 'wa_session';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function signIn() {
  const session = { user: 'guest', accessToken: null, at: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(KEY);
}
