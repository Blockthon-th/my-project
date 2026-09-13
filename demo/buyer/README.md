# 구매자 데모 폴더 (템플릿)

이 폴더를 **저장소 밖**으로 복사해서 쓴다 (`demo/setup.ps1` 이 `C:\demo\buyer` 로 복사한다).
저장소 안에서 열면 상위의 `CLAUDE.md`·`.mcp.json`(memwal 서버 포함)이 함께 읽혀 데모가 지저분해진다.

| 파일 | 역할 |
|---|---|
| `index.html` | 헬스케어 예약 앱 "케어핏" 랜딩 v1. 판매자 팩과 **같은 5가지 결함 유형**(저대비 CTA · 3줄 이상 h1 · 375px 가로 넘침 · 높이 제각각 가격 카드 · 고정 nav 겹침)을 다른 브랜드색·섹션 구성으로 갖고 있다 |
| `CLAUDE.md` | 디자인 요청이면 `market_find → market_acquire → 교훈 선적용 → 적용표 → check.mjs → market_receipt` 순서로 진행하라는 규칙. 예산 0.5 SUI |
| `.mcp.json` | Memory Market MCP 서버 (`C:\mm\scripts\mcp\server.ts` 를 tsx 로 직접 실행, npm 을 거치면 stdout 배너 때문에 서버가 failed 로 뜬다) |
| `.claude/settings.json` | `mcp__memory-market__*`, Edit, Write, `Bash(node *check.mjs*)` 자동 허용, 데모 중 승인 창이 뜨지 않게 |
| `.claude/commands/improve.md` | `/improve` 한 번으로 전 과정이 돌아가는 프롬프트 |

## 실행

```
cd C:\demo\buyer
claude
> /improve
```

기대 로그: `market_find` → 팩 1개 관련도 상위 → `market_acquire` (subscribe tx digest + "단계 5개 복호화, record_hash 5/5 일치") →
Edit 4~6회 → "적용한 교훈" 표 → `check.mjs` `passed 5 / failed 0` → `market_receipt` digest.

## 선택: 편집마다 검사 자동 실행

`.claude/settings.json` 에 아래 훅을 넣으면 Edit/Write 직후마다 `check.mjs` 가 돌아 결과가 트랜스크립트에 남는다.
편집당 3~5초가 더 걸리므로 리허설에서만 켜고 본 데모에서는 뺀다.

```json
"hooks": {
  "PostToolUse": [
    { "matcher": "Edit|Write|MultiEdit",
      "hooks": [ { "type": "command", "command": "node C:/mm/tools/check.mjs index.html", "timeout": 30 } ] }
  ]
}
```

## 초기화 (리허설 뒤)

`demo/setup.ps1` 을 다시 돌리면 `index.html` 이 v1 로 돌아가고 `.mm-cache/`, `check-result.json` 이 지워진다.
구독은 온체인에 남아 있으므로 새 구독 트랜잭션을 보여주려면 팩 ttl 이 지나 있거나 구매자 지갑을 바꿔야 한다.
