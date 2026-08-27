'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// 토큰 1,000개 = 1코인. 종류별 가중치는 여기서 조정한다.
// 참고: 실제 사용량의 ~98%가 cacheRead다. 0.1 같은 값을 주면
// "긴 세션 켜두기"보다 "실제 작업"이 코인에 반영된다.
const WEIGHTS = { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 };
const TOKENS_PER_COIN = 1000;

const EMPTY = () => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0, events: 0 });

function addInto(dst, src) {
  dst.input += src.input; dst.output += src.output;
  dst.cacheWrite += src.cacheWrite; dst.cacheRead += src.cacheRead;
  dst.events += src.events;
  return dst;
}

function coinsOf(t) {
  const weighted = t.input * WEIGHTS.input + t.output * WEIGHTS.output +
                   t.cacheWrite * WEIGHTS.cacheWrite + t.cacheRead * WEIGHTS.cacheRead;
  return Math.floor(weighted / TOKENS_PER_COIN);
}

function homeDir() {
  return process.env.TCT_HOME || os.homedir();
}

function claudeRoot() { return path.join(homeDir(), '.claude', 'projects'); }
function codexRoot() { return path.join(homeDir(), '.codex', 'sessions'); }

/** 디렉터리를 재귀적으로 훑어 .jsonl 파일 경로를 모은다. */
function walkJsonl(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJsonl(full, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

/**
 * 파일의 offset 이후 구간만 읽어 완전한 줄만 돌려준다.
 * JSONL은 append-only라 이미 읽은 앞부분을 다시 읽을 필요가 없다.
 * 마지막 개행 이후의 조각은 아직 기록 중일 수 있으므로 버리고,
 * 다음 스캔에서 다시 읽도록 nextOffset을 개행 위치에 맞춘다.
 */
function readNewLines(file, offset, size) {
  if (size <= offset) return { lines: [], nextOffset: offset };
  const len = size - offset;
  const buf = Buffer.allocUnsafe(len);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, len, offset); }
  finally { fs.closeSync(fd); }

  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) return { lines: [], nextOffset: offset };

  const text = buf.subarray(0, lastNl).toString('utf8');
  const lines = text.length ? text.split('\n') : [];
  return { lines, nextOffset: offset + lastNl + 1 };
}

/** Claude Code 트랜스크립트 한 파일에서 늘어난 만큼만 집계한다. */
function scanClaudeFile(file, prev, seen) {
  const st = fs.statSync(file);
  const state = prev || { offset: 0, totals: EMPTY() };
  if (st.size < state.offset) {          // 파일이 잘렸거나 교체됨 → 처음부터
    state.offset = 0; state.totals = EMPTY();
  }
  const { lines, nextOffset } = readNewLines(file, state.offset, st.size);
  if (!lines.length) { state.offset = nextOffset; return state; }

  for (const line of lines) {
    if (!line || line.indexOf('"usage"') === -1) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.type !== 'assistant') continue;
    const m = d.message; if (!m) continue;
    const u = m.usage; if (!u) continue;

    // 세션을 resume/fork하면 이전 대화가 새 파일로 통째로 복사된다.
    // 재시도·사이드체인까지 겹치므로 dedup은 반드시 파일 전역이어야 한다.
    // (파일 단위로만 하면 실제보다 ~25% 부풀려짐)
    const key = `${m.id || ''}|${d.requestId || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    state.totals.input += u.input_tokens || 0;
    state.totals.output += u.output_tokens || 0;
    state.totals.cacheWrite += u.cache_creation_input_tokens || 0;
    state.totals.cacheRead += u.cache_read_input_tokens || 0;
    state.totals.events += 1;
  }
  state.offset = nextOffset;
  return state;
}

/** Codex 롤아웃 한 파일에서 늘어난 만큼만 집계한다. */
function scanCodexFile(file, prev) {
  const st = fs.statSync(file);
  const state = prev || { offset: 0, totals: EMPTY() };
  if (st.size < state.offset) { state.offset = 0; state.totals = EMPTY(); }
  const { lines, nextOffset } = readNewLines(file, state.offset, st.size);
  if (!lines.length) { state.offset = nextOffset; return state; }

  for (const line of lines) {
    if (!line || line.indexOf('"token_count"') === -1) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const info = d.payload && d.payload.info;
    // total_token_usage는 세션 누적값이라 합치면 뻥튀기된다.
    // 턴 단위 증분인 last_token_usage만 더한다.
    const l = info && info.last_token_usage;
    if (!l) continue;

    const cached = l.cached_input_tokens || 0;
    state.totals.input += Math.max(0, (l.input_tokens || 0) - cached);
    state.totals.cacheRead += cached;
    state.totals.cacheWrite += l.cache_write_input_tokens || 0;
    state.totals.output += l.output_tokens || 0;
    state.totals.events += 1;
  }
  state.offset = nextOffset;
  return state;
}

/**
 * 두 소스를 증분 스캔한다. cache는 { [파일경로]: state } 형태로
 * 호출자가 보관하며, 다음 호출에 그대로 넘기면 새로 늘어난 부분만 읽는다.
 */
function scan(cache) {
  const prevFiles = (cache && cache.files) || {};
  // 전역 dedup 집합. 각 줄은 평생 한 번만 처리되므로 증분 스캔과도 안전하게 맞물린다.
  const seen = new Set((cache && cache.seenKeys) || []);

  const sources = [
    { name: 'claude', files: walkJsonl(claudeRoot()), fn: scanClaudeFile },
    { name: 'codex', files: walkJsonl(codexRoot()), fn: scanCodexFile },
  ];

  const result = { claude: EMPTY(), codex: EMPTY(), files: 0, scannedAt: Date.now() };
  const nextFiles = {};

  for (const src of sources) {
    for (const file of src.files) {
      let state;
      try { state = src.fn(file, prevFiles[file], seen); }
      catch { continue; }                  // 읽는 도중 지워진 파일 등은 조용히 건너뛴다
      nextFiles[file] = state;
      addInto(result[src.name], state.totals);
      result.files += 1;
    }
  }

  result.claudeCoins = coinsOf(result.claude);
  result.codexCoins = coinsOf(result.codex);
  result.earnedCoins = result.claudeCoins + result.codexCoins;
  return { result, cache: { files: nextFiles, seenKeys: Array.from(seen) } };
}

module.exports = { scan, coinsOf, WEIGHTS, TOKENS_PER_COIN, claudeRoot, codexRoot };
