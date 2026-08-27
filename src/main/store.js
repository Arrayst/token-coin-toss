'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// state.json을 손으로 고쳐 코인을 불리는 걸 막기 위한 서명 키.
// 기기 정보에 묶어두면 남의 state.json을 가져다 붙이는 것도 막힌다.
// (앱 바이너리를 뜯으면 위조 자체는 가능하다 — 캐주얼한 조작을 막는 수준이다.)
const SECRET = 'token-coin-toss/v1';
function signingKey() {
  return crypto.createHash('sha256')
    .update(SECRET).update(os.hostname()).update(os.userInfo().username)
    .digest();
}
function sign(payload) {
  return crypto.createHmac('sha256', signingKey())
    .update(JSON.stringify(payload)).digest('hex');
}

const DEFAULT_STATE = () => ({
  version: 1,
  // 적립 코인은 로그 파일에서 매번 다시 계산되는 값이라 저장하지 않는다.
  // 저장해야 하는 건 도박으로 생긴 증감분뿐이다. (잔고 = 적립 + gambleDelta)
  gambleDelta: 0,
  stats: {
    plays: 0, wins: 0, losses: 0,
    wagered: 0, biggestWin: 0, biggestLoss: 0,
    streak: 0, bestStreak: 0, worstStreak: 0,
  },
  history: [],
});

const MAX_HISTORY = 100;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.stateFile = path.join(dir, 'state.json');
    this.cacheFile = path.join(dir, 'scan-cache.json');
    this.state = this._readState();
    this.cache = this._read(this.cacheFile, null);
  }

  _read(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return fallback; }
  }

  /**
   * 서명이 맞지 않으면 초기 상태로 되돌린다.
   * 손실을 지우려고 파일을 지우거나 고쳐도 이득이 없게 만드는 게 목적이다.
   * (적립 코인은 어차피 로그에서 다시 계산되므로 여기서 잃을 건 도박 손익뿐이다.)
   */
  _readState() {
    const raw = this._read(this.stateFile, null);
    if (!raw) return DEFAULT_STATE();
    const { sig, ...payload } = raw;
    if (typeof sig !== 'string') return DEFAULT_STATE();
    const expected = sign(payload);
    // 타이밍 공격 방지용 상수시간 비교
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn('state.json 서명 불일치 — 초기화합니다.');
      return DEFAULT_STATE();
    }
    return payload;
  }

  // 쓰다가 죽으면 파일이 깨진다. 임시 파일에 쓰고 rename으로 원자적 교체.
  _write(file, data) {
    const tmp = `${file}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
  }

  saveState() { this._write(this.stateFile, { ...this.state, sig: sign(this.state) }); }
  saveCache(cache) { this.cache = cache; this._write(this.cacheFile, cache); }

  reset() { this.state = DEFAULT_STATE(); this.saveState(); }

  recordRound(round) {
    const s = this.state.stats;
    const won = round.won;
    this.state.gambleDelta += won ? round.amount : -round.amount;

    s.plays += 1;
    s.wagered += round.amount;
    if (won) {
      s.wins += 1;
      s.streak = s.streak > 0 ? s.streak + 1 : 1;
      if (round.amount > s.biggestWin) s.biggestWin = round.amount;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    } else {
      s.losses += 1;
      s.streak = s.streak < 0 ? s.streak - 1 : -1;
      if (round.amount > s.biggestLoss) s.biggestLoss = round.amount;
      if (s.streak < s.worstStreak) s.worstStreak = s.streak;
    }

    this.state.history.unshift(round);
    if (this.state.history.length > MAX_HISTORY) {
      this.state.history.length = MAX_HISTORY;
    }
    this.saveState();
  }
}

module.exports = { Store, DEFAULT_STATE };
