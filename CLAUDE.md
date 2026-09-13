# Memory Market (Blockthon 2026)

작업 과정을 기간제 접근권으로 다른 사람의 에이전트에게 파는 시장. Sui · Walrus · Seal 위의 앱 층.
소개는 `README.md`, 기획은 `PLANNING.md`, 데모 대본은 `docs/DEMO.md`.

## 문서를 건드리기 전에 반드시 따르는 것 (제일 중요)

제출물은 **깃 저장소와 랜딩 페이지 둘뿐**이다. **랜딩 · 깃 · 실제로 체인에 올라간 것, 이 셋이 일치해야 한다. 불일치는 실패다.**

- **`docs/ground-truth.md`, 수치와 사실의 유일한 기준.** 지금 팔리는 기록이 무엇인지, 개수·값·기간·산 사람이 얼마인지,
  실측 표가 어떤 값인지 전부 여기 있다. `README.md` · `PLANNING.md` · `docs/DEMO.md` · `site/` 어디든 이 파일과 어긋나는 문장은 잘못이다.
  체인 상태가 바뀌면 **ground-truth 를 먼저 고치고** 나머지를 거기에 맞춘다. 반대 방향은 없다.
- **`docs/glossary.md`, 어휘 규칙.** 랜딩(`site/`)에 적용된다. 새 명사를 만들지 않는다,
  파는 물건은 "기록", 개수는 "다섯 번 고친" 식 횟수로 센다. 저장소 문서(README 개발자 절 · PLANNING · DEMO)는 개발자가 읽으니
  기술 용어를 써도 되지만 **수치와 사실은 랜딩과 똑같아야 한다.**
- 수치는 실측만. 과장된 비교("구독 전 2/5" 류) 금지, `README.md` 의 "실측, 직접 재본 결과" 절 해석을 따른다.
  특히 **검사 도구만 쥐여주면 기록 없이도 세 번 다 결국 다 잡는다(176 / 201 / 226초)** 는 사실을 어느 문서에서도 빼지 않는다.
- 없는 것을 있는 척하지 않는다. 실측 실험은 Paylane 기록(`0x75b2…`) 하나에만 있다.

## 구조
- `contracts/memory_market/`, Move 패키지 (MemoryPack · PackCap · Subscription · seal_approve · leave_receipt · retract),
  `sources/market.move` · `tests/market_tests.move`(테스트 19개)
- `scripts/`, 공용 층(`config` · `session` · `tx` · `market` · `records` · `evidence` · `memories` · `filter` · `txlog` · `demo-state`),
  `mm.ts` CLI, `sync.ts`, `e2e.ts` · `e2e-design.ts`, `check.ts`, `setup-sui.ps1` · `deploy.ps1` · `setup-wallets.ps1`
- `scripts/mcp/server.ts`, 구매자 에이전트용 MCP 서버, 도구 7개
  (`market_find`·`market_acquire`·`market_receipt` + `market_list`·`market_preview`·`market_subscribe`·`market_recall`)
- `tools/`, 포집 훅 `capture.mjs`, 검사 `check.mjs`(디자인 5항목) · `check-copy.mjs`(한국어 카피 6항목), `shot.mjs`,
  기준선 훅 `first-edit.mjs`, 공용 `lib.mjs`, `selftest.mjs`
- `skills/landing-copy-ko/`, 한국어 랜딩 카피 스킬 (`SKILL.md` + `check-copy.mjs` 사본, 두 벌을 같이 고친다)
- `plugin/`, Claude Code 플러그인 (`server/index.mjs` MCP 번들 + `hooks/`), `.claude-plugin/marketplace.json` 과 짝
- `demo/`, `seller` · `buyer` · `baseline` 템플릿, `setup.ps1`. 발표용 비교 화면(compare.html)은 뺐다. 발표 때는 공개 랜딩을 그대로 띄운다.
- `site/`, 랜딩 페이지 `index.html` 단일 파일 (+ `img/`, `serve.mjs`, `README.md`)
- `docs/`, `ground-truth.md`(기준값) · `glossary.md`(어휘) · `DEMO.md`(3분 대본) · `dev-memories.md`

## 명령어 (전부 `scripts/` 안에서. 루트에는 package.json 이 없다)
`npm run typecheck` · `npm run check`(`-- --sub`) · `npm run e2e` · `npm run e2e:design` · `npm run mm -- <명령>` ·
`npm run sync` · `npm run mcp` · `npm run build:plugin`.
`tools/` 는 `npm run selftest` · `node check.mjs <html>` · `node check-copy.mjs <html>`.

## 메모리 저장 규칙 (중요)
이 프로젝트를 개발하며 겪는 Sui / Move / Walrus / Seal 경험은 **반드시 `docs/dev-memories.md` 에 기록한다.**
이 기록이 판매하는 팩의 원천이다. 형식 `- [YYYY-MM-DD] 증상 → 원인 → 해결`, 한 줄에 맥락이 다 들어가게.
저장 대상: 실패한 접근과 그 원인 · 문서에 없거나 문서와 다른 동작 · 해결책과 근거(명령어, 인자 순서, 버전) · 시간을 많이 쓴 지점.
(MemWal 을 붙이면 `memwal_remember_bulk` 로 `sui-dev` 네임스페이스에 이관, 로드맵.)

## 환경·규칙
- Sui testnet, Seal 키 서버 testnet, Walrus 공개 엔드포인트.
- 비밀키·계정 ID 는 `.env`(개발) 또는 `~/.memory-market/config.json`(플러그인 사용자)에만. 커밋 금지.
- 훅·설정 파일 경로에는 한글 없는 ASCII 정션 `C:\mm` 을 쓴다.
