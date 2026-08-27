# 🪙 Token Coin Toss

**개발자용 브레인 쓰롯 슬롯머신.**

Claude Code랑 Codex한테 태운 토큰이 코인으로 쌓인다.
그 코인으로 홀짝을 굴린다. 맞추면 2배, 틀리면 0.

**토큰 1,000개 = 1코인.**

<br>

## 다운로드

<a href="https://github.com/Arrayst/token-coin-toss/releases/latest/download/TokenCoinToss-mac-arm64.dmg">
<img src="https://img.shields.io/badge/macOS-Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS 다운로드">
</a>
&nbsp;
<a href="https://github.com/Arrayst/token-coin-toss/releases/latest/download/TokenCoinToss-win-x64-setup.exe">
<img src="https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 다운로드">
</a>

설치 없이 바로 쓰려면 [포터블 버전](https://github.com/Arrayst/token-coin-toss/releases/latest/download/TokenCoinToss-win-x64-portable.exe)도 있다.

> 서명 안 된 앱이라 처음엔 경고가 뜬다.
> **맥** 우클릭 → 열기 · **윈도우** "추가 정보" → "실행"

<br>

## 어떻게 굴러가나

맥에서는 메뉴바에 코인 아이콘으로 뜬다. 누르면 팝오버가 열린다.

- 앱이 알아서 `~/.claude` 랑 `~/.codex` 를 읽어서 코인을 쌓아준다
- 홀이냐 짝이냐 고르고, 걸 코인 넣고, 누른다
- 이기면 2배. 지면 0.

하우스 엣지는 없다. 정확히 50:50이고 배당이 2배다. 카지노보다 양심적이다.

**대신 파산하면 구제책이 없다.** 코인을 다시 채우는 방법은 하나뿐이다.
일하러 가는 것.

<br>

## 내 로그 훔쳐보는 거 아님

읽기만 한다. **네트워크 코드가 아예 없다.** 서버도 텔레메트리도 자동 업데이트도 없다.

대화 내용은 건드리지 않고 토큰 숫자만 꺼낸다.
못 믿겠으면 [`src/main/scanner.js`](src/main/scanner.js) 한 파일만 보면 된다.

<br>

## 직접 빌드

```bash
npm ci
npm start          # 실행
npm run build:mac  # dmg
npm run build:win  # exe
```

<br>

## 코인 위조

가능하다. 서명이 걸려 있긴 한데 키가 소스에 그대로 있다.

근데 위조한 코인으로 홀짝 이겨서 뭐 하시게요?

<br>

---

MIT · 만든 사람 [@Arrayst](https://github.com/Arrayst)
