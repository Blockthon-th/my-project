# Memory Market

**전문가의 에이전트가 일하면서 남긴 작업 과정을, 사본이 아니라 기간제 접근권으로, 사람이 아니라 다른 사람의 AI 에이전트에게 파는 시장.**
Sui · Walrus · Seal 위에 얹은 앱 층, 프로토콜 수정 없음.

Sui testnet 배포 완료 · Claude Code 플러그인으로 설치 가능 · 랜딩 [site/index.html](site/index.html)
<!-- 배포되면 여기에 공개 URL(Walrus Sites / GitHub Pages)을 넣는다 -->

## 무엇을 파는가

완성된 프롬프트도 결과물도 아니고 **고치는 과정 한 단계**다. 판매자가 Claude Code 로 평소처럼 작업하는 동안 훅이 턴마다
(프롬프트 · diff · 스크린샷 2장 · 부분수정/전체재작성 · 왜 고쳤는지 · 교훈 · 검사 결과)를 한 단계로 기록한다. 사람이 따로 쓰는 건 없다.
지금 팔리고 있는 5단계 중 하나:

> **2단계** *"제목이 세 줄로 떨어져서 답답해. 1280px 에서 두 줄 안에."* → `word-break:keep-all` 인 한국어 h1 은 폰트 크기를 낮추기 전에
> **카피 길이**를 줄인다. 목표 줄수 n 이면 글자수는 대략 `(컨테이너 폭 ÷ font-size) × n × 0.95` — 56px·640px·2줄이면 22자 안쪽.

팩이 공개적으로 보증하는 건 답안지가 아니라 상품 명세 —
[검사 5항목](tools/README.md)(CTA 대비 · h1 줄수 · 가로 스크롤 · 카드 높이 · nav 겹침).

## 왜 필요한가

프롬프트 마켓(PromptBase)은 누적 50만 건, 월 거래액 300만 달러다. 그런데 **1000개 올라오면 20개만 팔린다.**
불만은 셋 — 모델이 바뀌어 안 먹힌다 / 미리보기와 실제가 다르다 / 가짜 리뷰·계정 관리가 없다. 연구도 같은 곳을 가리킨다: 도구는
"한 방"을 전제로 하지만 사용자는 고치고 되돌리며 반복한다(*"거의 완성됐는데 한 부분 고치려고 재생성하면 승인된 나머지가 망가진다"*).
**파는 것이 잘못됐다. 노하우는 고치는 과정에 있는데 시장은 도착점만 판다.**

| | v0 fork · ChatGPT 공유 · PromptBase | Memory Market |
|---|---|---|
| 소비자 | 사람이 읽고 복붙 | **에이전트가 도구로 호출** |
| 기간 | 영구 사본 | 기간제 열쇠, 만료되면 체인이 거부 |
| 검증 | 없음 | 공개 manifest 해시 대조 + 구매자만 남기는 영수증 |
| 갱신 | 낡아도 방치 | 판매자가 단계 단위로 폐기·갱신 |
| 도구 | 그 도구 안에서만 | 도구 무관 (MCP) |

## 어떻게 동작하는가

```
[판매자] 평소대로 작업 → 훅 3종이 턴마다 .mm/steps/step-N.json (파일이 안 바뀐 턴은 안 센다)
   └ mm publish: 단계마다 Seal 암호화(열쇠 ID = 팩 ID ‖ u16 단계번호) → Walrus
     → 트랜잭션 1건으로 publish×N + 미리보기 3건.  공개되는 건 시작·끝 스크린샷과 manifest 뿐

[구매자 에이전트]
  market_find     팩 검색 · 미리보기 해시 대조 · 영수증/폐기 수
  market_acquire  SUI 결제 → 구독권(수수료 즉시 판매자에게).  Seal 키 서버는 온체인 seal_approve
                  (이 팩 구독인가 · Clock 기준 만료 전인가) 시뮬레이션을 통과할 때만 열쇠를 준다
                  → 배치 fetchKeys 1회로 전 단계 복호화 → 각 해시를 공개 manifest 와 대조
  market_receipt  적용·검사 후, 구독권 가진 사람만 남기는 영수증 (구독당 1회, 두 번째는 abort)

만료 → 새 클라이언트는 열쇠를 못 받는다 │ 판매자 retract → 구매자의 다음 조회에서 자동 제외
```

도구 7개 = 위 셋 + 텍스트 기억 팩용 `market_list` → `market_preview` → `market_subscribe` → `market_recall`.

## 실측 (2026-09-07, Sui testnet + 실제 Claude Code 세션)

같은 결함 5개가 있는 랜딩을 구매자 에이전트에게 고치게 했다.

| | 최종 | 첫 수정 | 턴 | 시간 | Edit |
|---|---|---|---|---|---|
| **팩 구매** (`/improve` 1회) | **5/5** | **5/5 첫 시도** | 15 | 120초 | 6 |
| 기준선 A — 검사 도구 **있음** ×3 | 5/5 · 5/5 · 5/5 | — | 여러 턴 | 176 / 201 / 226초 | — |
| 기준선 B — 검사 도구 **없음** ×3 | **4/5 · 4/5 · 4/5 (멈춤)** | 1/5 · 0/5 · 1/5 | 16 / 26 / 17 | 210 / 350 / 218초 | 11 / 20 / 14 |

정직한 해석, 과장하지 않는다:
- 검사 도구를 쥐여주면 에이전트는 **결국 다 맞춘다**(3~4분). 팩이 "못 하던 걸 하게" 만드는 게 아니다.
- 도구 없이 혼자 하면 **셋 다 4/5 에서 멈췄고, 셋 다 같은 항목**(`h1-lines` — 한국어 제목이 세 줄로 떨어지는 문제)을 놓쳤다.
- 그 놓친 항목이 위 2단계 교훈과 정확히 같다. 팩을 사면 첫 시도에 5/5, 턴 절반, 수정 횟수 1/3.

체인 쪽도 같은 날 실측 — 만료 구독 조회는 `seal_approve aborted: subscription expired`, 같은 구독의 두 번째 영수증은 abort code 5,
`retract` 후 조회 제외 확인. 전체 표·트랜잭션 목록·3분 대본은 [docs/DEMO.md](docs/DEMO.md).

## 써보기

```
/plugin marketplace add Blockthon-th/my-project
/plugin install memory-market
```

구독에는 **본인 지갑**이 필요하다. `~/.memory-market/config.json` 에 `{ "BUYER_SUI_PRIVATE_KEY": "suiprivkey1..." }` 를 한 번 넣으면
모든 프로젝트에서 쓰인다. testnet 키는 `sui client new-address ed25519` → `sui client faucet --address <주소>` →
`sui keytool export --key-identity <주소>`. 컨트랙트 주소는 공개 정보라 기본값이 들어 있다.
그다음은 에이전트가 알아서 한다 — 결제·지출 상한·증거 파일 안전 규칙은 [plugin/README.md](plugin/README.md)를 **읽고** 쓸 것.

직접 돌려보려면:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1   # Sui CLI + 지갑 (이어서 deploy.ps1, setup-wallets.ps1)
cd scripts; npm install; npm run e2e; npm run e2e:design         # 전 과정 검증 (텍스트 기억 팩 / 디자인 과정 팩)
npm run mm -- --help; npm run build:plugin                       # 판매자·구매자 CLI · MCP 서버 번들
cd ..\tools; npm install; npx playwright install chromium
node selftest.mjs; node check.mjs ..\demo\buyer\index.html       # 포집 훅 자체 검증 · 검사 5항목
```

`.env` 는 [.env.example](.env.example) 참고, 커밋 금지. 데모 실행은 [demo/README.md](demo/README.md).

## 온체인 (Sui testnet)

- 패키지 [`0x50cd511c…548f5196`](https://suiscan.xyz/testnet/object/0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196)
- 디자인 과정 팩 · 5단계 · 0.05 SUI · 7일 [`0x75b25d24…22cfcb1d`](https://suiscan.xyz/testnet/object/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d)
- Sui 삽질 기억 팩 · 30건 · 0.01 SUI · 24시간 [`0xaa3b7edc…36b52a40`](https://suiscan.xyz/testnet/object/0xaa3b7edcbc7281896372c43a3ca8eae75f3b20accba985af9f4622bc36b52a40)
- 한국어 랜딩 카피 팩 · 8단계 · 0.03 SUI · 7일 [`0x8e366e40…1ecde683`](https://suiscan.xyz/testnet/object/0x8e366e409998682402364c08822d62e2e84639113c712223c0c897521ecde683).
  미리보기 블롭이 manifest 하나뿐이다. 스크린샷이 없는 대신 채점 기준인 카피 검사 6항목을 manifest 에 직접 싣고 온다
- 라이브 트랜잭션 [영수증](https://suiscan.xyz/testnet/tx/7HzugJeJna9LDGynREvAer6a3xxMErHxb8WQcmutVuYP) · [폐기](https://suiscan.xyz/testnet/tx/GZFerzGztZzyzmpLriHMN4L6m1m7GX58ehkAbJsC4rYz)

## 구조

```
contracts/memory_market/  Move — MemoryPack · PackCap · Subscription · seal_approve · leave_receipt · retract
scripts/                  공용 층(config·session·tx·market·records·evidence) · mm.ts CLI
                          mcp/server.ts (도구 7개) · sync · e2e · e2e-design · check · *.ps1
tools/                    capture.mjs 포집 훅 · check.mjs 검사 5항목 · check-copy.mjs 카피 검사 6항목 · shot.mjs · lib.mjs · selftest.mjs
skills/                   landing-copy-ko 한국어 랜딩 카피 스킬 (카피 팩의 8단계가 나온 작업 규칙, check-copy.mjs 사본 동봉)
plugin/                   Claude Code 플러그인 (MCP 번들 + 훅), .claude-plugin/marketplace.json 과 짝
demo/                     seller · buyer · baseline 템플릿 · compare.html 발표 화면 · setup.ps1 · serve.mjs
site/                     랜딩 페이지 — index.html 단일 파일, 브라우저에서 체인과 Walrus 를 직접 읽는다
docs/                     DEMO.md 3분 대본 · dev-memories.md 개발 기억 30건(Sui 팩의 원천이자 그 자체로 상품)
```

층별 문서 [contracts](contracts/memory_market/README.md) · [tools](tools/README.md) · [plugin](plugin/README.md) ·
[demo](demo/README.md) · 기획(문제 정의·신뢰 모델) [PLANNING.md](PLANNING.md).

## 한계 (숨기지 않는다)

- **이미 복호화한 평문은 회수 못 한다.** 만료가 막는 건 *이후 추가되는 단계와 정정*에 대한 접근이다.
- 폐기(`retract`)도 회수가 아니다. 구매자 조회에서 빠질 뿐, 유효한 구독자가 열쇠 ID 를 직접 대면 여전히 복호화된다.
- 판매자가 자기 팩을 사서 영수증을 남기는 건 막지 못한다 — 그 결제도 원장에 남을 뿐이다.
- manifest 해시 대조는 "발행 후 바꿔치기 불가"만 보장한다. 지어낸 단계를 올리는 것 자체는 체인이 막지 못한다.
- **"서버 없음"은 "우리가 운영하는 서버 없음"이다.** Seal 키 서버(Mysten)와 Walrus 공개 엔드포인트는 제3자 인프라다.
- 포집과 검사 5항목은 Claude Code + 웹 랜딩(HTML) 도메인에 맞춰져 있다.

## 로드맵

**supersede(정정)** 낡은 단계를 지우는 대신 새 단계로 대체하고 구매자가 차이를 본다 ·
**도메인 확장** 검사 항목을 팩이 직접 싣고 오게 해서 웹 디자인 밖으로 ·
**스폰서 결제** 재단이 예치하고 신규 개발자는 구독 무료 ·
Quilt 로 단계 묶음 저장 · Walrus Sites 카탈로그 · MemWal 자동 수집 연결

Blockthon 2026 출품작. MIT.
