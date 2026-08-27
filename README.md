# Token Coin Toss

Claude Code / Codex가 태운 토큰을 코인으로 적립하고, 그 코인으로 홀짝을 굴리는 맥 메뉴바 앱.

**토큰 1,000개 = 1코인.** 다 잃으면 일하러 가야 한다.

## 개인정보

이 앱은 **로컬 로그 파일을 읽기만 한다.** 네트워크 코드가 없다.

- 읽는 것: `~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl` 의 토큰 사용량 필드
- 쓰는 것: `app.getPath('userData')` 안의 `state.json`, `scan-cache.json`
- 보내는 것: **없음.** 서버도, 텔레메트리도, 자동 업데이트도 없다.

대화 내용은 파싱하지 않는다. `usage` / `token_count` 숫자만 꺼내 쓴다.
직접 확인하려면 `src/main/scanner.js` 한 파일만 보면 된다 (200줄 남짓).

## 실행

```
npm install
npm start
```

맥에서는 **메뉴바 앱**으로 뜬다. 독 아이콘은 없고, 상단 바의 코인 아이콘을 누르면
340×500 팝오버가 아이콘 바로 아래 붙는다.

| 동작 | 방법 |
|---|---|
| 열기/닫기 | 메뉴바 아이콘 클릭 |
| 닫기 | 다른 곳 클릭, 또는 `Esc` |
| 새로고침 · 종료 | 아이콘 우클릭 |

독 아이콘을 숨겼기 때문에 **종료는 우클릭 메뉴로만** 된다. `Cmd+Q`는 팝오버에 포커스가
있을 때만 먹는다.

윈도우/리눅스는 트레이 없이 평범한 420×640 창으로 뜬다.

## 빌드

```
npm run build:mac    # dmg + zip
npm run build:win    # nsis + portable
```

맥에서 윈도우 인스톨러(NSIS)를 빌드하려면 wine이 필요하다 (`brew install --cask wine-stable`).
없으면 윈도우 실기기나 CI에서 `npm run build:win`을 돌리는 쪽이 낫다.

## 코인은 어떻게 계산되나

읽는 곳:

| 소스 | 경로 |
|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex | `~/.codex/sessions/**/*.jsonl` |

집계할 때 주의한 것들:

- **서브에이전트 포함** — Claude는 `projects/<프로젝트>/<세션>/subagents/*.jsonl`에도 기록을 남긴다.
  한 단계만 훑으면 이걸 통째로 놓친다.
- **전역 중복 제거** — 세션을 resume/fork하면 이전 대화가 새 파일로 복사된다.
  재시도·사이드체인까지 겹치므로 `(message.id, requestId)` 기준으로 파일을 가로질러 dedup 해야 한다.
  파일 단위로만 하면 실제보다 부풀려진다.
- **Codex 누적값 함정** — `total_token_usage`는 세션 누적이라 합치면 배로 뻥튀기된다.
  턴 증분인 `last_token_usage`만 더한다.
- **증분 스캔** — JSONL은 append-only다. 파일별 바이트 오프셋을 저장해두고 새로 늘어난 구간만 읽는다.
  (첫 스캔 ~1.2초 / 이후 재스캔 ~3ms)

가중치는 `src/main/scanner.js`의 `WEIGHTS`에서 조정한다. 기본값은 전부 1이다.
참고로 실사용 토큰의 약 98%가 `cacheRead`인데, 이건 세션이 길어지면 자동으로 쌓이는 값이다.
"긴 세션 켜두기"보다 "실제 작업"을 반영하고 싶으면 `cacheRead`를 0.1 정도로 낮추면 된다.

## 조작 방지

로컬 앱이라 완전한 방어는 불가능하다. 캐주얼한 조작을 막는 수준이다.

- **초기화 버튼 없음** — 잃은 뒤 기록을 지워 손실을 되돌리는 경로를 아예 없앴다.
- **state.json HMAC 서명** — 값을 손으로 고치면 서명이 깨져 도박 손익이 0으로 돌아간다.
  키는 hostname + username에 묶여 있어 남의 state.json을 가져다 붙여도 무효다.
- **asar 패키징** — 소스가 평문 파일로 노출되지 않는다.

적립 코인은 저장하지 않고 로그에서 매번 다시 계산하므로, state.json을 지우거나
망가뜨려도 얻을 게 없다. 잃는 건 도박 손익뿐이다.

앱 바이너리를 뜯으면 서명 키는 꺼낼 수 있다. 더 올리려면 Electron Fuses
(`onlyLoadAppFromAsar`, `enableEmbeddedAsarIntegrityValidation`, `runAsNode: false`)를
켜야 하는데, `electronFuses` 빌드 옵션은 **electron-builder 26+** 에서만 지원한다.
현재 25.1.8이라 빠져 있다. 올리려면:

```
npm i -D electron-builder@^26
```

## 홀짝

- 판정은 **메인 프로세스**에서만 한다. 렌더러는 결과를 받기만 한다.
- 난수는 `crypto.randomInt(1, 101)`. 1~100 균등이라 홀:짝이 정확히 50:50이다.
- 2배 배당 · 하우스 엣지 없음 → 기댓값 0.
- 잔고를 넘는 베팅은 거부되므로 잔고는 절대 음수가 되지 않는다.

## 저장되는 것

`app.getPath('userData')`에:

- `state.json` — 도박 증감분(`gambleDelta`), 전적, 최근 100판
- `scan-cache.json` — 파일별 스캔 오프셋과 dedup 키 (~0.4MB)

**적립 코인은 저장하지 않는다.** 로그 파일이 유일한 진실이고 매번 다시 계산한다.

```
잔고 = 적립(로그에서 계산) + gambleDelta(저장됨)
```

그래서 `state.json`이 날아가도 적립분은 그대로 복구되고,
코인을 늘리려면 실제로 토큰을 쓰는 수밖에 없다.

## 조작

| 키 | 동작 |
|---|---|
| Enter (금액 입력 중) | 홀 |
| Space | 짝 |
| Esc | 팝오버 닫기 (맥) |

## 설치 파일이 서명되지 않은 문제

코드서명 인증서가 없어 ad-hoc 서명만 들어간다.

- **맥**: 처음 실행할 때 우클릭 → 열기. 또는
  `xattr -dr com.apple.quarantine "/Applications/Token Coin Toss.app"`
- **윈도우**: SmartScreen 경고에서 "추가 정보" → "실행"

배포용으로 제대로 하려면 Apple Developer ID(연 $99)와 윈도우 코드서명 인증서가 필요하다.

## 트레이 아이콘

`src/assets/trayTemplate.png`(16px)와 `@2x`(32px)는 `scripts/make-icons.js`가 생성한다.
외부 이미지 파일을 저장소에 두지 않으려고 PNG를 코드에서 직접 인코딩했다.
맥 템플릿 이미지라 알파 채널만 쓰이고, 라이트/다크 색은 OS가 알아서 칠한다.

모양을 바꾸려면 스크립트의 `outer`/`inner` 반지름을 고치고 다시 돌리면 된다.

```
node scripts/make-icons.js
```

## Electron 바이너리 설치가 실패할 때

`npm install`의 electron postinstall은 GitHub 릴리스에서 ~95MB를 받는다.
네트워크가 느리면 `RequestError: read ETIMEDOUT`으로 죽고, 이때 npm이 패키지 디렉터리를
정리해버려서 `node_modules/electron`이 비는 경우가 있다.

수동 복구:

```
curl -L -o /tmp/electron.zip \
  "https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-darwin-arm64.zip"

ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install

mkdir -p node_modules/electron/dist
ditto -x -k /tmp/electron.zip node_modules/electron/dist
printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
```

주의할 점 둘:

- `.app` 번들은 프레임워크 심볼릭 링크가 있어서 `unzip` 대신 **`ditto`**를 써야 한다.
- `path.txt`는 **개행 없이** 써야 한다. `echo`를 쓰면 끝에 `\n`이 붙어
  `spawn .../Electron\n ENOENT`로 실패한다. 반드시 `printf`.

윈도우/리눅스는 아키텍처에 맞춰 zip 파일명과 `path.txt` 내용만 바꾸면 된다
(윈도우: `electron-v33.4.11-win32-x64.zip`, `path.txt`는 `electron.exe`).
