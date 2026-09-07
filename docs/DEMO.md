# 데모 시나리오 (3분) — 디자인 과정 팩

> 핵심 한 장면: **구매자 창에서 `/improve` 한 번.** 에이전트가 시장에서 다른 디자이너의 "고친 과정 팩" 을 사서(온체인 결제 + Seal 복호화)
> 자기 랜딩에 적용하고, 검사 5/5 결과로 영수증을 체인에 남긴다. **같은 파일·같은 프롬프트를 팩 없이 돌린 3회는 2/5 · 3/5 · 2/5.**
> 만료된 구독은 Seal 이 열쇠를 거부하고, 낡은 단계는 판매자가 폐기하면 다음 recall 에서 빠진다.

폴더 지도는 [demo/README.md](../demo/README.md), 판매자 5턴 대본은 [demo/seller/SESSION-SCRIPT.md](../demo/seller/SESSION-SCRIPT.md).

## 화면 배치

| 창 | 내용 | 위치 |
|---|---|---|
| **A** 구매자 Claude Code | `C:\demo\buyer` 에서 `claude`. `/improve` 만 친다 | 왼쪽 큰 창 |
| **B** 판매자 폴더 | 탐색기로 `C:\demo\seller\.mm\steps\` (step-1..5.jpg 미리보기 창) — 사전 실행 결과 | 오른쪽 위, 50초에 닫음 |
| **C** 별도 터미널 | `C:\mm\scripts`. `mm recall --fresh`, `mm retract` 두 명령을 히스토리에 넣어 둠 | 오른쪽 아래 |
| **D** 브라우저 | 탭 1 `http://localhost:8787/compare.html` (F11 전체화면), 탭 2 Suiscan 팩 객체, 탭 3 Suiscan tx (비워둠) | 전환용 |

발표자 한 명이 A → D → B → A → C → D → A → C → D 순으로 오간다. 창 전환은 Alt+Tab 이 아니라 **작업표시줄 클릭** (녹화·프로젝터에서 덜 틀린다).

## 타임라인 (180초)

| 초 | 창 | 하는 것 | 말 (요지) | 실패 시 |
|---|---|---|---|---|
| **0–10** | A | `/improve` 엔터. 도구 호출이 시작되는 것만 보고 D 로 | "구매자는 이 한 줄만 칩니다. 에이전트가 일하는 동안 배경을 보죠." | 명령이 안 뜨면 `improve.md` 문장을 직접 붙여넣기 |
| **10–25** | D 탭1 (소개) | 슬라이드 1 → `→` 키로 2 | PromptBase 월 300만 달러 · 누적 50만 건 · 1000개 중 20개만 팔림. 세 불만: 재현 안 됨 / 이유가 없음 / 낡아도 팔림. "결과 스냅샷(v0·ChatGPT 공유)이 아니라 **고친 과정**을, 기간제로, 검증과 함께 팝니다." | — |
| **25–50** | D 탭2 → B → D 탭2(Suiscan) | `2` 키. 필름스트립 5장(결함→교정, "선택자만 수정" 배지, 시각) 가리키고, B 의 step-N.jpg 를 슥 넘기고, Suiscan 팩 객체(memory_count 5, preview = manifest) | "판매자는 어제 Claude Code 로 이 랜딩을 **5턴** 고쳤을 뿐입니다. 훅이 턴마다 프롬프트·diff·스크린샷·왜·교훈을 한 단계로 기록해 Seal 로 잠그고 Walrus 에 올렸고, 팩 객체에 등록됐습니다. 구매 전에는 단계 제목과 해시, 전·후 스크린샷만 공개됩니다." | B 가 없으면 탭2 만으로 |
| **50–75** | A | 로그를 위에서 아래로 읽어 준다: `market_find` (관련도 1위) → `market_acquire` (subscribe tx digest → "단계 5개 복호화, record_hash 5/5 manifest 일치") → Edit 들. **B 창을 닫는다.** | "결제는 판매자에게 즉시 갔고, 복호화 열쇠는 Seal 키 서버가 **온체인 구독권을 확인하고** 내줬습니다. 판매자 컴퓨터는 이제 꺼져도 됩니다." (B 를 닫으며) | 에이전트가 시장을 안 부르면 "먼저 market_find 로 관련 팩 찾아서 사" 한 줄 입력. 그래도 안 되면 C 에서 `npm run mm -- recall --pack <id>` 로 플레이북 출력 |
| **75–110** | C | `npm run mm -- recall --pack <만료 팩> --sub <만료 구독> --fresh` → `seal_approve aborted: subscription expired (expires_at_ms … < now)`. 탭3 의 LIVE 칸(스크린샷·5/5·적용표)은 구매자 창의 `market_receipt` 가 자동으로 채운다. 안 채워졌으면 `npm run mm -- --project C:\demo\seller state --live C:\demo\buyer --evidence C:\demo\buyer\evidence.json` (5초) | "이건 어제 산 구독인데 만료됐습니다. 새 클라이언트로 열쇠를 요청하면 — 우리 서버가 아니라 **Seal 키 서버가** `seal_approve` 를 시뮬레이션해서 거부합니다. 평문 사본이 넘어간 적이 없으니 회수할 것도 없습니다. 블록체인 없이는 못 만드는 장면입니다." | 거부가 아니라 성공/다른 에러면: 리허설 때 저장한 `type C:\demo\logs\expired.txt` |
| **110–135** | D 탭3 (비교) | `3` 키. 왼쪽 2/5·3/5·2/5 → 오른쪽 LIVE 5/5 → 적용표(step → 선택자) | "같은 파일, 같은 프롬프트, 팩만 없이 세 번: 2, 3, 2. 대비와 제목은 잡는데 375px 넘침·고정 메뉴 겹침·카드 높이는 화면을 안 보면 못 잡습니다. 팩을 산 뒤엔 5/5 — **어느 단계의 교훈이 이 파일의 어느 선택자로 갔는지** 표로 남습니다. 검사 5항목은 판매자가 manifest 에 선언한 보증입니다." | LIVE 가 아직 없거나 5/5 가 아니면 **`R` 키** → 오른쪽이 fallback(사전 실행)으로 바뀌고 "사전 실행" 라벨이 붙는다. 라벨을 가리지 말고 "리허설 기록입니다" 라고 말한다 |
| **135–150** | A → D 탭3 | A 의 마지막 줄 `market_receipt` → `leave_receipt` digest. D 탭3 하단 트랜잭션 목록의 "영수증 Suiscan ↗" 클릭 | "구매자 에이전트가 검사 결과를 Walrus 에 올리고 팩에 영수증을 남겼습니다. 다음 구매자는 '샀더니 됐다' 를 판매자 말이 아니라 체인에서 봅니다. 구독 하나에 영수증 하나, 만료 뒤에도 남길 수 있습니다." | tx 실패(가스·중복)면 D-1 에 기록한 리허설 영수증 digest 링크 |
| **150–168** | C | `npm run mm -- retract --pack <Sui 팩> --step <N> --reason sdk-changed` → 이어서 `npm run mm -- recall --pack <Sui 팩>` 에서 그 단계가 빠진 것 | "기억은 상합니다. 이 Sui 팩의 이 단계는 SDK 1.x 시절 얘기라 지금은 틀린 답입니다. 판매자가 폐기하면 구독자의 다음 recall 에서 즉시 빠지고, 폐기 이력은 팩에 남습니다." | `EAlreadyRetracted` 등이면 리허설 retract digest + "빠진 recall" 스크린샷 |
| **168–180** | D 탭1 슬라이드3 | `1` 키, `→` 두 번 | "결과가 아니라 과정을, 기간제로, 검증과 폐기까지. Sui 객체·Clock·Seal 정책·Walrus — 프로토콜 수정 없이 앱 층만으로." | — |

말은 120초 분량이다. 에이전트 로그가 늦으면 말을 늘리지 말고 **다음 장면으로 넘어갔다가 돌아온다** (50–75 와 135–150 은 순서를 바꿔도 된다).

## 사전 준비 체크리스트

### D-1 (전날)

- [ ] `powershell -ExecutionPolicy Bypass -File C:\mm\demo\setup.ps1` → `C:\demo\{seller,buyer,baseline-1..3}`
- [ ] **판매자 5턴**: `C:\demo\seller` 에서 `claude`, [SESSION-SCRIPT.md](../demo/seller/SESSION-SCRIPT.md) 의 프롬프트 순서대로. 턴마다 ```step-note``` 블록 확인
- [ ] (아래 `mm` 명령은 전부 `cd C:\mm\scripts` 에서, `--project C:\demo\seller` 를 붙여 실행)
- [ ] `npm run mm -- --project C:\demo\seller review` → 단계 5개, 스크린샷 5쌍, record_hash 체인 OK. lesson 이 빈 단계는 `--step N --lesson ".."` 로 보충
- [ ] **publish 하기 전에** 만료 시연용 사본을 떠 둔다: `robocopy C:\demo\seller C:\demo\seller-expiry /E` (publish 는 `state.json` 에 발행 기록을 남겨 같은 폴더에서 두 번째 팩을 만들 수 없다)
- [ ] `npm run mm -- --project C:\demo\seller publish --new --fee 0.05 --ttl 7d --label claude-code` → **pack id 를 여기 적는다**: `0x________` (팩 이름은 `.mm/config.json` 의 `name`)
- [ ] `npm run mm -- --project C:\demo\seller state` → compare.html 탭2 에 5장 뜨는지
- [ ] **기준선 3회**: `C:\demo\baseline-1..3` 각각 `claude` → `/improve` → `npm run mm -- --project C:\demo\seller baseline --dir C:\demo\baseline-N --label run-N` → 탭3 왼쪽에 3장
- [ ] **리허설 1회 끝나면** `node C:\mm\demo\freeze-live.mjs` → live 를 fallback 으로 얼려 둔다 (본 데모에서 `R` 키가 보여줄 화면)
- [ ] **만료 구독 준비** (사본 폴더에서, 6분 ttl — 5분 미만 팩은 목록에서 자동으로 숨겨져 구독 스크립트가 못 찾는다):
  1. `npm run mm -- --project C:\demo\seller-expiry publish --new --fee 0.01 --ttl 6m --name expiry-demo --label claude-code` → pack id `0x________`
  2. 구매자 지갑으로 구독: `$env:MARKET_PACK_ID='<그 id>'; npm run check -- --sub` → 출력의 구독권 id `0x________`
  3. **`.env` 의 `MARKET_HIDDEN_PACKS` 에 그 pack id 추가** — 안 그러면 데모 중 `market_find` 가 같은 manifest 의 이 팩을 후보로 띄운다 (`recall --pack` 은 영향 없음)
  4. 6분 뒤 `npm run mm -- recall --pack <id> --sub <sub id> --fresh` 가 `seal_approve aborted: subscription expired …` 를 내는지 확인. 출력을 `C:\demo\logs\expired.txt` 로 저장
  - 빠른 대안: `npm run e2e` 가 60초 팩 + 구매자 구독을 만들고 `pack:` 을 출력한다. 1분 뒤 그 id 로 `recall --fresh` 하면 같은 거부가 난다 (단, 이 팩은 옛 텍스트 형식이라 만료 전에는 recall 이 파싱에 실패할 수 있다 — 만료 장면 전용)
- [ ] **폐기 대상 정하기**: 기존 Sui 기억 팩에서 `@mysten/sui 1.x` 시절 항목의 step 번호. retract 는 단계당 1회뿐이므로 **리허설용 N 과 본 데모용 N' 을 다르게** 잡는다
- [ ] 영수증 대체용: 리허설의 `leave_receipt` digest 기록: `________`
- [ ] **전체 리허설 1회를 녹화** (9/13, OBS, 1920×1080, 3분) → `C:\demo\recording\memory-market-demo.mp4`. 전면 실패 시 이 영상으로 발표
- [ ] 리허설 뒤 `setup.ps1 -Only buyer` 와 `-Only baseline` 으로 구매자·기준선만 초기화 (판매자는 `-KeepSellerSteps` 로 단계 보존)

### 30분 전

- [ ] 구매자·판매자 지갑 가스 각각 ≥ 1 SUI (`sui client gas --address <주소>`), 부족하면 faucet
- [ ] 시계: `cd C:\mm\scripts; npm run check` 첫 줄의 skew 확인. `session.ts` 가 보정하지만 120초 넘으면 중단되므로 관리자 PowerShell 에서 `w32tm /resync /force`
- [ ] `node C:\mm\demo\serve.mjs` → D 탭1 `http://localhost:8787/compare.html`, 상단 pill 이 **`state/compare-state.json · …갱신`** (샘플 데이터 아님) 인지. `F11`
- [ ] D 탭2 Suiscan 팩 객체 미리 로드 (첫 로드가 느리다)
- [ ] A: `C:\demo\buyer` 에서 `claude` → `/mcp` 에 memory-market **connected** → `market_find` 한 번 호출해 워밍(첫 Walrus 읽기가 느림) → `/clear`
- [ ] 구매자 `index.html` 이 v1 인지: `node C:\mm\tools\check.mjs C:\demo\buyer\index.html` → failed 5
- [ ] 구매자 지갑에 데모 팩의 **유효한 구독이 없는지** (있으면 subscribe tx 가 안 뜬다 → ttl 이 지났거나 지갑을 바꾼다)
- [ ] C: `C:\mm\scripts` 에서 `recall --fresh`, `state --live …`, `retract`, `recall` 네 명령을 한 번씩 입력해 히스토리에 올려두고 `cls`
- [ ] 프로젝터 1920×1080, 브라우저 확대 100%, 터미널 글꼴 18pt 이상, 알림 끄기(집중 지원)

### 5분 전

- [ ] D 탭1 에서 `F` (상태 다시 읽기) → `1` → 슬라이드 1
- [ ] A `/clear`, C `cls`, B 탐색기를 `.mm\steps` 에 열어두기

## 실패 시 대체 절차

| 장면 | 증상 | 대체 |
|---|---|---|
| 0–10 | `/improve` 가 명령으로 안 잡힘 | `.claude/commands/improve.md` 의 문장을 그대로 입력 |
| 50–75 구매 | `market_acquire` 가 30초 넘게 걸림 (Walrus 읽기·Seal 키 5개) | 기다리지 말고 75초 장면으로 갔다가 110초에 돌아와 로그 확인 |
| 50–75 구매 | 에이전트가 시장을 부르지 않음 | "먼저 market_find 로 관련 팩을 찾아서 사" 입력. 그래도 안 되면 C 에서 `npm run mm -- recall --pack <id>` 로 플레이북을 보여주고 계속 |
| 50–75 구매 | `이미 구독 중` (리허설 구독이 살아 있음) | 그대로 진행 — "어제 산 구독을 재사용" 이라고 말한다. subscribe tx 는 탭3 하단 리허설 digest 로 |
| 75–110 만료 | 거부가 아니라 복호화 성공 | `--fresh` 를 빠뜨렸는지 확인(같은 SealClient 는 키를 캐시한다). 그래도 안 되면 `type C:\demo\logs\expired.txt` |
| 75–110 만료 | `ExpiredSessionKeyError` 등 다른 에러 | 시계 오차(1ms 라도 미래면 거부). 시간 없으니 `expired.txt` 로 대체하고 넘어간다 |
| **110 비교** | LIVE 가 없거나 5/5 가 아님 | **`R` 키** → fallback(리허설 기록)으로 전환, "사전 실행" 라벨을 보이는 채로 설명. 거짓말하지 않는다 |
| 135 영수증 | tx 실패 (가스, `EReceiptExists`) | D-1 기록의 리허설 영수증 digest 를 탭3 에서 클릭 |
| 150 폐기 | `EAlreadyRetracted` / `ENoSuchBlob` | 본 데모용 step N' 을 썼는지 확인. 실패하면 리허설 retract digest + recall 스크린샷 |
| 전면 | RPC/Walrus/Seal 중 하나라도 죽음 (`npm run check` 실패) | **9/13 녹화 영상** `C:\demo\recording\memory-market-demo.mp4` 를 재생하며 같은 말을 한다. 영상 앞에 "테스트넷이 지금 불안정해 어제 녹화본으로" 한 문장 |

## 예상 질문

| 질문 | 답 |
|---|---|
| v0 · ChatGPT 공유 링크와 뭐가 다른가 | 링크는 **결과 한 장**. 팩은 **단계마다** 프롬프트·diff·스크린샷·왜·교훈·거절 여부가 있어 다른 프로젝트의 다른 선택자에 옮길 수 있다. 검증(검사 5항목 + 영수증), 만료(Seal), 폐기(retract), 정산(SUI)이 있다. |
| 구독자가 복호화한 HTML·스크린샷을 재배포하면 | 막지 못한다. 다만 사본에는 record_hash 체인·영수증·폐기 이력이 없어 정품과 구분된다. 향후 과제. |
| 검사 5항목은 누가 정하나 | 판매자가 manifest 에 **구매 전에** 선언한다. 구매자 에이전트가 같은 공개 검사기(`tools/check.mjs`)로 채점해 영수증을 남기므로 판매자가 스스로 채점하지 않는다. |
| 만료 뒤에도 이미 받은 키로 읽히지 않나 | 그렇다. Seal 은 발급된 키를 소급 회수하지 않는다. 회수는 **새 클라이언트·새 세션**에 즉시 적용된다. 그래서 `mm recall --fresh` 와 MCP 의 acquire 는 매번 새 SealClient·SessionKey 를 쓴다. |
| 판매자가 가짜 단계를 올리면 | 단계는 `prev_hash → record_hash` 체인이라 사후 수정이 드러난다. 전·후 스크린샷 sha 가 manifest 에 공개돼 구매 전 대조할 수 있고, 영수증 수·폐기 수가 팩에 남는다. |
| 왜 Sui 인가 | 구독권이 **소유 객체**라 `seal_approve` 가 sender 소유를 자연스럽게 검증하고, `Clock` 으로 만료를 온체인 판정하며, Seal 정책 함수와 Walrus 가 같은 생태계에 있다. 프로토콜 수정 없이 앱 층만으로 됐다. |
| 팔 사람이 있나 | 코딩 에이전트로 매일 디자인·개발을 반복하는 사람 전부. 판매자가 **따로 쓰는 것이 없다** — 평소처럼 고치면 훅이 기록한다. |

## 부록 — 기존 Sui 기억 팩 (150초 폐기 장면에서 사용)

이 프로젝트를 만들며 쌓인 Sui/Seal/Walrus 삽질 기록([dev-memories.md](dev-memories.md))이 `npm run sync` 로 평문 텍스트 기억(항목당 블롭 1개, 랜덤 nonce)으로 올라가 있다 (팩 id 는 `.env` 의 `MARKET_PACK_ID`). `mm retract --pack <Sui 팩> --step N` 은 이 팩에서 체인 등록 순서 N번째 블롭(= `mm recall` 출력의 번호)을 폐기한다.
`@mysten/sui 1.x` 시절 항목(예: "signAndExecuteTransaction 이 sender 를 안 채운다")은 2.x 에서는 틀린 답이라 폐기 대상으로 딱 맞는다.
이전 시나리오("같은 질문에 구독 전엔 일반론, 구독 후엔 삽질 기록")는 이 팩으로 여전히 재현할 수 있다: `market_recall` 에 `Session key has expired` 를 넘기면 시계 오차 항목이 나온다.
