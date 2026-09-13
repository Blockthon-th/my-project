# Memory Market (Blockthon 2026)

작업 과정을 기간제 접근권으로 다른 사람의 에이전트에게 파는 시장. Sui · Walrus · Seal 위의 앱 층.
소개는 `README.md`, 기획은 `PLANNING.md`.

## 구조
- `contracts/memory_market/` — Move 패키지 (MemoryPack · PackCap · Subscription · seal_approve · leave_receipt · retract)
- `scripts/` — 공용 층(config·session·tx·market·records·evidence), `mm.ts` CLI, `sync.ts`, `e2e*.ts`, `*.ps1`
- `scripts/mcp/server.ts` — 구매자 에이전트용 MCP 서버, 도구 7개
  (`market_find`·`market_acquire`·`market_receipt` + `market_list`·`market_preview`·`market_subscribe`·`market_recall`)
- `tools/` — 포집 훅 `capture.mjs`, 검사 `check.mjs`(5항목), `shot.mjs`, 공용 `lib.mjs`, `selftest.mjs`
- `plugin/` — Claude Code 플러그인 (MCP 번들 + 훅), `.claude-plugin/marketplace.json` 과 짝
- `demo/` — 판매자·구매자·기준선 템플릿, `compare.html` · `site/` — 랜딩 페이지

## 메모리 저장 규칙 (중요)
이 프로젝트를 개발하며 겪는 Sui / Move / Walrus / Seal 경험은 **반드시 `docs/dev-memories.md` 에 기록한다.**
이 기록이 판매하는 팩의 원천이다. 형식 `- [YYYY-MM-DD] 증상 → 원인 → 해결`, 한 줄에 맥락이 다 들어가게.
저장 대상: 실패한 접근과 그 원인 · 문서에 없거나 문서와 다른 동작 · 해결책과 근거(명령어, 인자 순서, 버전) · 시간을 많이 쓴 지점.
(MemWal 을 붙이면 `memwal_remember_bulk` 로 `sui-dev` 네임스페이스에 이관 — 로드맵.)

## 환경·규칙
- Sui testnet, Seal 키 서버 testnet, Walrus 공개 엔드포인트.
- 비밀키·계정 ID 는 `.env`(개발) 또는 `~/.memory-market/config.json`(플러그인 사용자)에만. 커밋 금지.
- 훅·설정 파일 경로에는 한글 없는 ASCII 정션 `C:\mm` 을 쓴다.
- 수치는 실측만. 과장된 비교("구독 전 2/5" 류) 금지 — README "실측" 절의 해석을 따른다.
