import { signIn } from '../auth.js';
import { html } from '../format.js';

export const title = '들어가기';

export function render(root, ctx) {
  root.innerHTML = html`<main class="screen login">
    <header class="head">
      <h1 class="title big">내 바구니</h1>
      <p class="muted">자동 매수 상태를 보고, 시작·일시정지·건너뛰기를 눌러요. 지금은 모의계좌(달러)예요.</p>
    </header>
    <div class="spacer"></div>
    <footer class="foot">
      <button type="button" class="btn" id="enter">들어가기</button>
      <p class="note center">실제 돈으로 사기 전에 본인 로그인을 붙여요. 지금은 누르면 바로 들어가요.</p>
    </footer>
  </main>`.toString();
  root.querySelector('#enter').onclick = async () => {
    await signIn();
    ctx.go('basket');
  };
}
