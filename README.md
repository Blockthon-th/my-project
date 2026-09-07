# Memory Market

**전문가 에이전트의 살아 있는 기억을 필요한 기간만 구독하는 시장.**
Sui · Walrus · Seal · MemWal 위에 얹는 앱 층 프로젝트 (프로토콜 수정 없음).

Blockthon 2026 출품작. 기획은 [PLANNING.md](PLANNING.md).

## 지금까지 동작 확인된 것 (testnet, 2026-09-07 실측)

텍스트 기억 팩(`scripts/e2e.ts`)과 디자인 과정 팩(`scripts/e2e-design.ts` + 실제 세션) 둘 다 전 과정을 통과한다.

1. 판매자가 **기억 팩** 생성 (가격·구독 기간·출처 이력이 담긴 Sui 공유 객체)
2. 기억을 **Seal 로 암호화 → Walrus 업로드 → 팩에 등록** (디자인 팩은 publish×5 + 미리보기×3 을 트랜잭션 1건으로)
3. 구독자가 **SUI 결제 → 구독권 발급** (수수료는 판매자에게 즉시 전송)
4. 구독 유효 → **배치 fetchKeys 1회로 전 단계 복호화**, record_hash 를 공개 manifest 와 대조
5. 만료 후 → **새 클라이언트는 키를 받지 못함** (`seal_approve aborted: subscription expired`, Seal 키 서버 거부 실측)
6. 구독자만 남길 수 있는 **해결 영수증** (`leave_receipt`, 구독당 1회 — 두 번째는 abort code 5)
7. 판매자의 **단계 폐기** (`retract`) → 다음 recall 에서 제외
8. **실제 Claude Code 세션**에서 훅이 판매자의 5턴을 자동 기록했고(전부 targeted, step-note 5/5), 구매자 에이전트가 `/improve` 한 번으로 팩을 찾아 사고(0.05 SUI) 교훈 5개를 적용해 검사 5/5 를 첫 시도에 통과한 뒤 영수증을 남겼다 (15턴 125초)

배포된 패키지: `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196` (testnet)
디자인 팩: `0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d` · Sui 기억 팩(30건): `0xaa3b7edcbc7281896372c43a3ca8eae75f3b20accba985af9f4622bc36b52a40`

## 구조

```
contracts/memory_market/   Move 패키지 — MemoryPack, PackCap, Subscription, seal_approve
scripts/
  config.ts                네트워크·키 서버·Walrus 엔드포인트, 시계 오차 측정
  session.ts               서버 시각에 정렬된 Seal 세션 키 생성 (아래 "함정" 참고)
  tx.ts                    트랜잭션 실행 + 생성 객체 조회
  market.ts                팩 생성/등록/구독/조회/복호화 (sync 와 MCP 가 공유)
  memories.ts              기억 수집 (MemWal 또는 docs/dev-memories.md)
  filter.ts                개인정보 필터 (제외 / 가림)
  sync.ts                  판매자: 수집 → 필터 → 암호화 → 업로드 → 등록
  e2e.ts                   전 과정 검증
  mcp/server.ts            구독자 에이전트용 MCP 서버
  *.ps1                    설치·배포·지갑 준비 (Windows)
docs/dev-memories.md       개발하며 쌓인 기억 — 데모에서 판매할 팩의 원천
  hooks/on_user_prompt.mjs  매 질문마다 시장을 상기시키는 훅
plugin/                    Claude Code 플러그인 (MCP + 훅을 한 번에 설치)
.claude-plugin/            플러그인 마켓플레이스 정의
docs/DEMO.md               3분 데모 시나리오 + 예상 질문
```

## 플러그인

MCP 도구는 에이전트가 "지금 쓸 상황"이라고 판단해야만 호출된다. 코딩 에이전트는 오류를 보면
먼저 로컬 코드를 뒤지므로 도구 설명만으로는 잘 불리지 않는다. 그래서 **MCP + 훅**을 플러그인 하나로 묶었다.
(MemWal 공식 플러그인도 같은 이유로 같은 구조를 쓴다.)

```powershell
cd scripts; npm run build:plugin    # 서버를 plugin/server/index.mjs 로 번들
```

Claude Code 에서:

```
/plugin marketplace add C:\Users\pc\source\my-project
/plugin install memory-market
```

설치하면 프로젝트마다 설정할 필요 없이 도구 넷과 상기 훅이 함께 붙는다.

## 사용

```powershell
cd scripts
npm run sync -- --dry   # 무엇이 팔리고 무엇이 걸러지는지 확인
npm run sync            # 팩 생성(최초) + 새 기억 업로드 + 미리보기 등록
npm run e2e             # 전 과정 검증
npm run typecheck
```

### 구독자 쪽 (Claude Code)

프로젝트 루트에 `.mcp.json` 을 만든다:

```json
{
  "mcpServers": {
    "memory-market": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp/server.ts"]
    },
    "memwal": {
      "command": "npx",
      "args": ["-y", "@mysten-incubation/memwal-mcp", "--staging", "--namespace", "sui-dev"]
    }
  }
}
```

붙으면 도구 네 개를 쓸 수 있다:
`market_list` → `market_preview` → `market_subscribe` → `market_recall`.

`memwal` 서버는 판매자 쪽 기억 자동 수집용이다. 처음 한 번
`npx -y @mysten-incubation/memwal-mcp login` 으로 지갑을 연결한다.

## 디자인 과정 팩 데모

상품을 "AI 디자인 반복 과정 팩" 으로 넓힌 데모. 판매자가 Claude Code 로 랜딩 `index.html` 을 5턴 고치면 훅이 턴마다
(프롬프트 · diff · 스크린샷 · 왜 · 교훈)을 한 단계(`mm.step/1`)로 기록하고, 단계들을 Seal 로 잠가 Walrus 에 올려 팩에 등록한다.
구매자 에이전트는 `/improve` 한 번으로 `market_find → market_acquire → 교훈 선적용 → 검사 → market_receipt` 를 끝낸다.

```
demo/seller/     판매자 템플릿 — Paylane(핀테크 송금) 랜딩 v1 + 결함 5개, step-note 규칙, capture 훅, 5턴 대본
demo/buyer/      구매자 템플릿 — 케어핏(헬스케어 예약) 랜딩 v1 + 같은 결함 유형 5개, MCP 설정, /improve
demo/baseline/   팩 없이 돌릴 때의 규칙 (비교용 사전 실행 3회)
demo/compare.html  발표 화면 — 소개 / 판매자 필름스트립 / 구독 전·후 (키 1·2·3, R = 사전 실행 전환)
demo/state/      mm CLI 가 쓰는 compare-state.json + 스크린샷 (샘플: compare-state.sample.json)
```

```powershell
powershell -ExecutionPolicy Bypass -File demo\setup.ps1   # 템플릿을 C:\demo\ 로 복사 (저장소 밖에서 실행해야 상위 CLAUDE.md 가 안 섞인다)
node demo\serve.mjs                                        # http://localhost:8787/compare.html
node tools\check.mjs demo\buyer\index.html                 # 검사 5항목 (v1 은 5개 전부 fail 이 정상)
```

3분 타임라인·준비 체크리스트·실패 시 대체 절차는 [docs/DEMO.md](docs/DEMO.md).

## 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1      # CLI + 지갑
# 출력된 faucet 링크에서 테스트넷 SUI 수령
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1         # 배포 → .env
powershell -ExecutionPolicy Bypass -File scripts\setup-wallets.ps1  # 두 지갑 키
cd scripts; npm install; npm run e2e
```

`.env` 는 `.env.example` 참고. 커밋 금지.

## 이 프로젝트에서 걸린 함정들

`docs/dev-memories.md` 에 전부 기록되어 있고, 이 기록 자체가 데모에서 판매하는 상품이다.
가장 값비쌌던 것 세 가지:

- **공개 풀노드가 JSON-RPC 를 중단했다.** `SuiClient` 대신 `SuiGrpcClient`, SDK 는 `@mysten/sui` **2.x 이상**이어야 한다. 1.x 의 gRPC 클라이언트는 현재 노드와 아예 통신이 안 된다.
- **`ExpiredSessionKeyError: Session key has expired` 는 만료가 아니다.** 키 서버는 인증서 생성 시각이 자기 시계보다 **1ms 라도 미래이면 거부**한다(허용 오차 0). PC 시계가 2~3초 빠른 것만으로 재현된다. TTL 을 낮추거나 키 서버를 바꿔도 소용없다 → `session.ts` 가 생성 시각을 서버 기준으로 되돌린다.
- **SealClient 는 받아온 키를 캐시한다.** 구독이 만료돼도 같은 클라이언트로는 계속 읽힌다. 만료 검증·시연은 새 클라이언트로 해야 한다.

## 돌아왔을 때 먼저 할 것

1. **git 잠금 정리** — 원격 도구에 파일 삭제 권한이 없어 `.git/*.lock` 이 남는다. 관리자 아닌 PowerShell 에서:
   ```powershell
   cd C:\Users\pc\source\my-project
   del .git\*.lock
   rmdir /s /q _to_delete
   git rm -r --cached _to_delete 2>$null; git add -A; git commit -m "chore: cleanup"
   git push -u origin main
   ```
2. **`.mcp.json` 생성** — 아래 "구독자 쪽" 참고 (원격에서는 이 파일을 쓸 수 없다).
3. **`npm run sync -- --dry`** 로 무엇이 팔리고 무엇이 걸러지는지 확인 → 문제없으면 `npm run sync`.

## 다음

- [x] `npm run sync` 실측 — Sui 기억 팩 30건 업로드 (새 패키지)
- [x] MCP 서버를 구독자 Claude Code 에 붙여 리허설 — 헤드리스 구매자 세션 통과 (신뢰 대화상자 수락이 선행 조건, docs/DEMO.md)
- [x] 만료 후 캐시 문제 — `mm recall --fresh` 와 market_acquire 는 호출마다 새 SealClient/SessionKey
- [ ] **MemWal 플러그인 연결** — 개발 기억을 `sui-dev` 네임스페이스에 자동 수집
      (`npx -y @mysten-incubation/memwal-mcp login` 후 `.env` 에 키 기록 → `MEMORY_SOURCE=memwal`)
- [ ] 기준선 설계 — 검사 도구를 쥐여준 기준선은 5/5 를 맞추므로(실측 3/3) 비교는 첫 수정 점수·턴 수·소요로. 결함 유형을 모델이 기본으로 못 맞히는 쪽으로 조정
- [ ] 스폰서 결제 (재단이 예치 → 신규 개발자 구독 무료) — 발표에서는 로드맵으로
- [ ] supersede(정정), 수수료 싱크(자기 구독 영수증 비용화), Quilt 로 단계 묶음 저장, Walrus Sites 카탈로그 (선택)
