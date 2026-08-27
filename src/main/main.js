'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const crypto = require('crypto');
const scanner = require('./scanner');
const { Store } = require('./store');

const IS_MAC = process.platform === 'darwin';
// 맥에서는 메뉴바 팝오버로 띄운다. 그 외 플랫폼은 평범한 창을 쓴다.
const POPOVER = IS_MAC;
const PANEL = { width: 340, height: 660 };

let win = null;
let tray = null;
let store = null;
let latest = null;          // 마지막 스캔 결과
let scanning = false;

function createWindow() {
  const base = {
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  win = new BrowserWindow(POPOVER ? {
    ...base,
    width: PANEL.width, height: PANEL.height,
    show: false, frame: false, resizable: false, movable: false,
    fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true, transparent: true, hasShadow: true,
    vibrancy: 'under-window', visualEffectState: 'active',
  } : {
    ...base,
    width: 420, height: 640, minWidth: 360, minHeight: 560,
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (POPOVER) {
    // 팝오버는 다른 곳을 클릭하면 닫힌다.
    win.on('blur', () => { if (!win.webContents.isDevToolsOpened()) win.hide(); });
    // 전체화면 앱 위에도 떠야 하므로 일반 창보다 높은 레벨로 올린다.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
}

/** 트레이 아이콘 바로 아래 가운데 정렬로 팝오버를 붙인다. */
function positionPanel() {
  if (!tray) return;
  const t = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: t.x, y: t.y });
  const area = display.workArea;

  let x = Math.round(t.x + t.width / 2 - PANEL.width / 2);
  // 화면 가장자리에서 잘리지 않게 가둔다.
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - PANEL.width - 8));
  const y = Math.round(t.y + t.height + 4);

  win.setBounds({ x, y, width: PANEL.width, height: PANEL.height });
}

function togglePanel() {
  if (!win) return;
  if (win.isVisible()) { win.hide(); return; }
  positionPanel();
  win.show();
  win.focus();
  runScan();
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '..', 'assets', 'trayTemplate.png')
  );
  icon.setTemplateImage(true);          // 맥이 라이트/다크에 맞춰 알아서 칠한다
  tray = new Tray(icon);
  tray.setToolTip('Token Coin Toss');
  tray.on('click', togglePanel);
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: '새로고침', click: () => runScan() },
      { type: 'separator' },
      { label: '종료', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
  });
}

function snapshot() {
  const earned = latest ? latest.earnedCoins : 0;
  return {
    earned,
    claudeCoins: latest ? latest.claudeCoins : 0,
    codexCoins: latest ? latest.codexCoins : 0,
    claude: latest ? latest.claude : null,
    codex: latest ? latest.codex : null,
    files: latest ? latest.files : 0,
    scannedAt: latest ? latest.scannedAt : 0,
    gambleDelta: store.state.gambleDelta,
    balance: earned + store.state.gambleDelta,
    stats: store.state.stats,
    history: store.state.history.slice(0, 30),
    scanning,
  };
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', snapshot());
}

async function runScan() {
  if (scanning) return;
  scanning = true; push();
  try {
    // 첫 스캔은 1초 남짓 걸린다. setImmediate로 넘겨 창이 먼저 뜨게 한다.
    await new Promise((r) => setImmediate(r));
    const { result, cache } = scanner.scan(store.cache);
    latest = result;
    store.saveCache(cache);
  } catch (e) {
    console.error('scan failed:', e);
  } finally {
    scanning = false; push();
  }
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  // 메뉴바 전용 앱이므로 독 아이콘은 띄우지 않는다.
  if (POPOVER && app.dock) app.dock.hide();

  createWindow();
  if (POPOVER) createTray();
  win.webContents.once('did-finish-load', () => { push(); runScan(); });
  // 새로 늘어난 로그만 읽으므로 주기 스캔이 저렴하다 (수 ms).
  setInterval(runScan, 20000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 팝오버는 숨겨질 뿐 닫히지 않는다. 종료는 트레이 메뉴로만.
  if (!POPOVER) app.quit();
});

ipcMain.handle('get-state', () => snapshot());
ipcMain.handle('rescan', async () => { await runScan(); return snapshot(); });

ipcMain.handle('bet', (_e, payload) => {
  const choice = payload && payload.choice;
  if (choice !== 'odd' && choice !== 'even') {
    return { error: '홀 또는 짝을 골라야 합니다.' };
  }
  const amount = Math.floor(Number(payload.amount));
  if (!Number.isFinite(amount) || amount < 1) {
    return { error: '1코인 이상 걸어야 합니다.' };
  }
  const balance = (latest ? latest.earnedCoins : 0) + store.state.gambleDelta;
  if (amount > balance) {
    return { error: `잔고가 부족합니다. (보유 ${balance.toLocaleString()})` };
  }

  // 1~100 균등 추출 → 홀/짝이 정확히 50:50.
  // Math.random 대신 CSPRNG를 쓰고, 판정은 렌더러가 아니라 메인에서 한다.
  const roll = crypto.randomInt(1, 101);
  const parity = roll % 2 === 1 ? 'odd' : 'even';
  const won = parity === choice;

  const round = {
    at: Date.now(), choice, roll, parity, won, amount,
    delta: won ? amount : -amount,
  };
  store.recordRound(round);
  return { round, state: snapshot() };
});

ipcMain.handle('hide-panel', () => { if (POPOVER && win) win.hide(); });

