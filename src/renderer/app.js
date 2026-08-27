'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const KO = { odd: '홀', even: '짝' };

let state = null;
let rolling = false;

function renderTok(t) {
  if (!t) return '–';
  const total = t.input + t.output + t.cacheWrite + t.cacheRead;
  return `${fmt(total)} 토큰`;
}

function render(s) {
  state = s;
  $('balance').textContent = fmt(s.balance);
  $('claudeCoins').textContent = fmt(s.claudeCoins);
  $('codexCoins').textContent = fmt(s.codexCoins);
  $('claudeTok').textContent = renderTok(s.claude);
  $('codexTok').textContent = renderTok(s.codex);

  const g = s.gambleDelta;
  $('gambleDelta').textContent = (g > 0 ? '+' : '') + fmt(g);
  $('gambleDelta').style.color = g > 0 ? 'var(--win)' : g < 0 ? 'var(--lose)' : 'var(--text)';
  $('record').textContent = `${s.stats.wins}승 ${s.stats.losses}패`;
  $('record2').textContent = `${s.stats.plays}판`;

  $('scanline').textContent = s.scanning
    ? '로그 스캔 중…'
    : `${s.files}개 파일 · 1,000토큰 = 1코인 · ${s.scannedAt ? new Date(s.scannedAt).toLocaleTimeString('ko-KR') : '–'} 기준`;

  renderHistory(s.history);
  $('amount').max = s.balance;
}

function renderHistory(h) {
  const ul = $('history');
  ul.innerHTML = '';
  if (!h || !h.length) {
    ul.innerHTML = '<li class="empty" style="display:block">아직 아무것도 안 굴렸습니다.</li>';
    return;
  }
  for (const r of h) {
    const li = document.createElement('li');
    li.className = r.won ? 'win' : 'lose';
    const time = new Date(r.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    li.innerHTML =
      `<span class="t">${time}</span>` +
      `<span class="r">${r.roll}</span>` +
      `<span>${KO[r.choice]} 걸고 ${KO[r.parity]} · ${fmt(r.amount)}</span>` +
      `<span class="d">${r.delta > 0 ? '+' : ''}${fmt(r.delta)}</span>`;
    ul.appendChild(li);
  }
}

function flash(el, cls, ms) {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function setErr(msg) {
  $('err').textContent = msg || '';
}

async function play(choice) {
  if (rolling) return;
  const amount = parseInt($('amount').value, 10);
  if (!amount || amount < 1) { setErr('걸 코인을 입력하세요.'); return; }
  setErr('');

  rolling = true;
  $('odd').disabled = $('even').disabled = true;

  const coin = $('coin');
  coin.classList.remove('win', 'lose');
  coin.classList.add('spin');
  $('coinFace').textContent = '?';
  $('verdict').className = 'verdict';
  $('verdict').textContent = '…';

  const res = await window.tct.bet(choice, amount);

  // 동전이 다 돌 때까지 결과를 숨긴다.
  await new Promise((r) => setTimeout(r, 720));
  coin.classList.remove('spin');

  if (res.error) {
    setErr(res.error);
    $('coinFace').textContent = '?';
    $('verdict').textContent = '얼마 걸래';
    rolling = false;
    $('odd').disabled = $('even').disabled = false;
    return;
  }

  const { round } = res;
  $('coinFace').textContent = round.roll;
  coin.classList.add(round.won ? 'win' : 'lose');

  const v = $('verdict');
  v.className = 'verdict ' + (round.won ? 'win' : 'lose');
  v.textContent = round.won
    ? `${KO[round.parity]}! +${fmt(round.amount)} 먹었습니다`
    : `${KO[round.parity]}… -${fmt(round.amount)} 날아갔습니다`;

  const d = $('delta');
  d.className = 'delta ' + (round.won ? 'win' : 'lose');
  d.textContent = (round.delta > 0 ? '+' : '') + fmt(round.delta);
  flash(d, 'show', 900);
  flash($('balance'), 'bump', 450);

  render(res.state);
  rolling = false;
  $('odd').disabled = $('even').disabled = false;
}

$('odd').onclick = () => play('odd');
$('even').onclick = () => play('even');

document.querySelectorAll('.chips button').forEach((b) => {
  b.onclick = () => {
    if (!state) return;
    const v = Math.floor(state.balance * parseFloat(b.dataset.pct));
    $('amount').value = Math.max(1, v);
    setErr('');
  };
});

$('rescan').onclick = async () => render(await window.tct.rescan());

// 엔터는 홀, 스페이스는 짝
document.addEventListener('keydown', (e) => {
  if (e.target === $('amount') && e.key === 'Enter') { play('odd'); return; }
  if (e.key === ' ' && e.target !== $('amount')) { e.preventDefault(); play('even'); }
});

// 맥은 메뉴바 팝오버, 나머지는 일반 창.
const isPop = window.tct.platform === 'darwin';
document.body.classList.add(isPop ? 'pop' : 'pc');

// 팝오버는 Esc로 닫는다.
if (isPop) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.tct.hidePanel();
  });
}

window.tct.onState(render);
window.tct.getState().then(render);
