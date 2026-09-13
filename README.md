# Memory Market

랜딩: https://blockthon-th.github.io/my-project/ · 저장소: https://github.com/Blockthon-th/my-project

**당신의 경험을 사겠습니다.** AI 와 일하며 쌓인 경험을, 다른 사람의 AI 가 값을 내고 정해진 기간 동안만 읽어 쓰는 곳입니다.

## AI 시대의 오픈소스는 무엇이어야 하나

오픈소스는 코드를 공개하는 일이었습니다. 이제 그 방식이 잘 맞지 않습니다.

- **코드를 공개하는 것은 의미가 줄었습니다.** AI 로 만든 그림, 문서, 화면에는 공개할 코드가 없습니다. 코드가 있어도 다시 시키면 또 나옵니다.
- **결과물을 공개하는 것도 답이 아닙니다.** 남의 결과물을 그대로 쓰는 것은 저작권 문제가 되고, 내 일에 맞지도 않습니다.
- **정작 값진 것은 그 사이에 있습니다.** AI 한테 몇 번씩 다시 시켜 가며 겨우 찾아낸 요령, "그거 말고, 다시, 그건 빼고" 하며 오간 대화입니다. 그런데 이건 창을 닫으면 사라지고, 공개할 자리도 없습니다.

Memory Market 은 그 대화 기록을 공개하고 사고파는 자리입니다. 코드도 결과물도 아닌, **어떻게 거기까지 갔는지**를 팝니다.

## 어떻게 다른가

- **파는 것은 대화 기록입니다.** 뭘 시켰고, 뭐가 바뀌었고, 그래서 뭘 알게 됐는지가 한 번 고칠 때마다 한 덩어리로 남습니다. 파는 사람이 따로 글을 쓰지 않습니다. 평소처럼 AI 와 일하면 쌓입니다.
- **사는 쪽은 사람이 아니라 AI 입니다.** 사람이 읽고 베끼는 게 아니라, 내 AI 가 값을 내고 읽은 뒤 내 일에 바로 씁니다.
- **영원히 파는 게 아닙니다.** 정해진 기간(7일, 24시간) 동안만 열립니다. 기간이 지나면 새로 열 수 없습니다.
- **바꿔치기가 안 됩니다.** 올린 뒤 내용을 고칠 수 없고, 후기는 실제로 산 쪽만 남길 수 있습니다.

| | 코드 오픈소스 · 결과물 공유 · 명령문 시장 | Memory Market |
|---|---|---|
| 무엇을 | 코드, 완성본, 명령문 한 줄 | 거기까지 간 대화 기록 |
| 누가 쓰나 | 사람이 읽고 복사합니다 | 다른 사람의 AI 가 그대로 씁니다 |
| 얼마나 | 한 번 받으면 영원히 | 정해진 기간만 |
| 진짜인지 | 확인할 방법이 없습니다 | 올린 뒤 바꿔치기가 안 되고, 후기는 산 쪽만 남깁니다 |

> 제출물은 **이 저장소**와 **랜딩 페이지** 둘뿐입니다. 저장소·랜딩·체인에 올라간 것, 셋의 수치가 어긋나면 그건 잘못입니다.
> 모든 수치의 기준값은 [docs/ground-truth.md](docs/ground-truth.md) 한 곳에 있습니다.

## 안에 뭐가 들어 있나

웹디자이너 경험(AI 가 뱉은 보라색 랜딩을 열 번 고친 기록)에서 일곱 번째로 고친 대목입니다.

> **시킨 말**, *"제목이 네 줄로 떨어져서 첫 화면을 다 잡아먹었어. 크기를 낮추지 말고 문장을 줄여서 두 줄 안에 들어오게 해줘."*
>
> **알게 된 것**, 큰 제목은 글자 크기를 줄이는 대신 **한 줄에 들어가는 글자 수를 먼저 세고**, 그 안에 맞춰 문장을 다시 쓴다.
> 같은 기록의 다른 대목들: 꾸미는 색은 하나만, 강조색은 제일 중요한 버튼 하나에만, 왼쪽 정렬은 레이아웃으로 못박기.

디자인 기록에는 "이대로 하면 안 틀리는 것" 다섯 가지가 함께 붙어 있습니다, 버튼 색 대비 · 제목 줄 수 ·
가로로 밀리는지 · 카드 높이 · 메뉴가 겹치는지. 판 사람이 `tools/check.mjs` 가 재는 항목 그대로 적어 올린 것이고,
산 쪽은 같은 도구로 다시 재서 후기를 남깁니다.

## 지금 올라와 있는 기록: 정확히 4개

기준값은 [docs/ground-truth.md](docs/ground-truth.md).
**산 사람 수는 2026-09-13 기준입니다.** 이 값은 누가 살 때마다 늘어납니다. `node tools/consistency.mjs` 를 돌리면 이 표와 체인이 어긋나는지 알려줍니다.

| 기록 | 몇 번 | 값 | 기간 | 산 사람 | 사기 전에 보이는 것 |
|---|---|---|---|---|---|
| 웹디자이너 경험 | 10번 | 0.05 SUI | 7일 | 0 | 고치기 전·후 화면 2장 + 설명 |
| 웹퍼블리셔 경험 | 5번 | 0.05 SUI | 7일 | 1 | 고치기 전·후 화면 2장 + 설명 |
| 카피라이터 경험 | 8번 | 0.03 SUI | 7일 | 0 | 설명만 (화면 사진 없음) |
| 블록체인 개발자 경험 | 글 33건 | 0.01 SUI | 24시간 | 0 | 실제 교훈 글 2건 |

SUI 는 Sui 네트워크의 가상화폐 단위입니다. 지금은 연습용 네트워크(testnet)라 진짜 돈이 들지 않습니다.
객체 주소와 링크는 아래 [체인에 올라간 주소](#체인에-올라간-주소-sui-testnet) 에 있습니다.

**목록에 없는 것도 체인에는 남아 있습니다.** 체인을 직접 보면 위 넷보다 많이 보이는데, 이유는 이렇습니다.

- e2e 테스트 팩 2개와 통합 검증용 1개, 기간이 5분 미만이라 `market_find` 가 자동으로 뺍니다
  (`MIN_LISTED_TTL_MS`, `scripts/market.ts`). 랜딩도 같은 기준(`MIN_TTL`)으로 거릅니다.
- `0xd2902d30…`, 이름은 "다섯 번에"인데 실제로는 14개가 들어 있었습니다. 이름과 내용이 어긋나서 기간을 5분 아래로 내려 목록에서 내렸습니다.

## 실측: 직접 재본 결과

**이 표는 웹퍼블리셔 경험(송금 앱 랜딩을 다섯 번 고친 기록, 실험 당시 id `0x75b2…`) 하나로 한 실험입니다.** 같은 결함이 심어진 랜딩을 AI에게 고치게 했고,
한 번은 이 기록을 사서, 세 번은 아무것도 없이 시켰습니다. 2026-09-07 측정.

| 누가 | 첫 수정에서 잡은 것 | 걸린 시간 | 주고받은 횟수 | 파일 수정 | AI 사용료 |
|---|---|---|---|---|---|
| **이 기록을 산 AI** | **5개 전부** | **2분 0초** | **15** | **7** | **$0.70** |
| 기록 없이 1회차 | 5개 중 1개 | 3분 30초 | 16 | 11 | $1.17 |
| 기록 없이 2회차 | 5개 중 0개 | 5분 50초 | 26 | 20 | $1.88 |
| 기록 없이 3회차 | 5개 중 1개 | 3분 38초 | 17 | 14 | $1.20 |

- 기록 없이 한 세 번은 **끝까지 한 군데(제목 줄바꿈)를 못 잡았습니다.** 그 기록의 두 번째 대목이 바로 그 문제였습니다.
- 그런데 기록 대신 **검사 도구만 쥐여주고** 기록 없이 돌리면 **세 번 다 결국 다 잡습니다, 176초 / 201초 / 226초.**
  숨기지 않고 적습니다.
- 그래서 이 기록이 파는 것은 **"되냐 안 되냐"가 아니라 "얼마나 빨리 되냐"입니다.** 못 하던 일을 하게 만들어 주지 않습니다.
  줄여 주는 것은 걸린 시간과 주고받은 횟수, 그리고 AI 사용료입니다.
  채점기를 안 쥔 쪽이 실제 사용자에 더 가깝다고 보고 위 표의 비교 축으로 삼았습니다.
- **나머지 세 기록에는 이런 실험이 없습니다.** 랜딩에 보이는 그 셋의 시간·사용료는 데모용 가상 값입니다(아래 "솔직한 한계").

## 솔직한 한계

랜딩 페이지에는 싣지 않기로 한 목록입니다. 저장소에는 그대로 둡니다.

- **한 번 열어본 내용은 도로 거둘 수 없습니다.** 기간이 막는 것은 기간이 끝난 뒤 다시 여는 것입니다.
- **판 사람이 자기 걸 사서 후기를 남기는 건 못 막습니다.**
- **올린 뒤 바꿔치기는 막지만, 처음부터 지어낸 걸 올리는 건 못 막습니다.**
- 저희가 돌리는 서버는 없지만, 저장소와 잠금장치는 남의 인프라입니다(Walrus 공개 엔드포인트, Mysten 의 Seal 키 서버).
- 아직 연습용 네트워크라 진짜 돈은 안 듭니다.
- 카피 기록(`0x8e36…`)은 검사 결과가 비어 있고, 그 검사를 무엇으로 재는지 사는 쪽에 알려줄 방법이 아직 없습니다.
- 사는 쪽 지갑이 옛 웹퍼블리셔 기록을 이미 샀고 후기도 남겨서, 같은 지갑으로는 후기를 다시 못 남깁니다. 예비 지갑을 씁니다.
- 기록을 남기고 채점하는 도구는 Claude Code 와 웹 화면(HTML) 작업에 맞춰져 있습니다.
- **랜딩 상세의 "이 기록을 쓰면" 수치는 웹퍼블리셔 경험 것만 실측입니다.** 나머지 세 기록의 시간·사용료는 데모용 가상 값입니다. 판 사람 프로필("5년차 웹디자이너")도 데모용 표시입니다.

---

# 여기부터는 개발자용입니다

위쪽은 이 서비스가 무엇인지 설명한 부분입니다. 아래쪽은 저장소를 받아 직접 돌려보려는 사람을 위한 것이라
기술 용어와 명령어를 그대로 씁니다. 수치는 위와 같은 값을 씁니다.

## 기술 스택

Sui · Walrus · Seal 위에 얹은 앱 층이고, 프로토콜은 수정하지 않았습니다. Sui testnet 배포 완료.

- **Seal**, 판매자 기계에서 단계별로 암호화한다. 키 ID = 팩 ID ‖ u16 단계번호. 복호화 키는 키 서버(Mysten)가
  온체인 `seal_approve` 시뮬레이션(이 팩의 구독인가 · Clock 기준 만료 전인가)을 통과할 때만 내려온다.
- **Walrus**, 암호화된 블롭과 미리보기 블롭 저장. 공개되는 건 시작·끝 스크린샷과 manifest 뿐이다.
- **Sui**, 공유 객체 `MemoryPack`, 결제와 `Subscription` 발급(수수료는 즉시 판매자에게), Clock 기준 만료,
  dynamic field. 한 트랜잭션에 publish×N + 미리보기 최대 3건.
- **MCP**, 구매자 에이전트가 쓰는 도구 7개. 도구 종류에 묶이지 않는다.

```
[판매자] 평소대로 작업 → 훅 3종이 턴마다 .mm/steps/step-N.json (파일이 안 바뀐 턴은 안 센다)
   └ mm publish: 단계마다 Seal 암호화 → Walrus → 트랜잭션 1건으로 publish×N + 미리보기

[구매자 에이전트]
  market_find     검색 · 미리보기 해시 대조 · 영수증/폐기 수
  market_acquire  SUI 결제 → Subscription → seal_approve 통과 시에만 배치 fetchKeys 1회로 전 단계 복호화
                  → 각 해시를 공개 manifest 와 대조
  market_receipt  적용·검사 후, 구독권 가진 사람만 남기는 영수증 (구독권 1개당 1회, 두 번째는 abort code 5)

만료 → 새 클라이언트는 키를 못 받는다 │ 판매자 retract → 구매자의 다음 조회에서 자동 제외
```

MCP 도구 7개(`scripts/mcp/server.ts`) = 위 셋 + 텍스트 기억용
`market_list` → `market_preview` → `market_subscribe` → `market_recall`.

## 설치

준비물: Claude Code(터미널용 AI 도구) · Node.js 20 이상 · Sui CLI(아래 `scripts/setup-sui.ps1` 또는 docs.sui.io). Claude Code 를 연 상태에서 아래 두 줄을 입력합니다.

```
/plugin marketplace add Blockthon-th/my-project
/plugin install memory-market
```

결제에는 **본인 지갑**이 필요합니다. `~/.memory-market/config.json` 에 `{ "BUYER_SUI_PRIVATE_KEY": "suiprivkey1..." }` 를
한 번 넣으면 모든 프로젝트에서 쓰입니다. testnet 키는 `sui client new-address ed25519` →
`sui client faucet --address <주소>` → `sui keytool export --key-identity <주소>`.
컨트랙트 주소는 공개 정보라 기본값이 들어 있습니다.
그다음은 AI 가 필요할 때 사도 되냐고 묻고, 허용해 두면 알아서 삽니다. 결제·지출 상한·증거 파일 안전 규칙은 [plugin/README.md](plugin/README.md)를 **읽고** 쓸 것.

## 직접 돌려보기

Windows PowerShell 기준입니다. 기록 4개를 보는 데는 지갑이 필요 없습니다. `npm run e2e` 만 테스트넷 SUI 가 든 지갑 2개를 쓰고 실제 결제를 보냅니다. `.env` 는 [.env.example](.env.example) 을 복사해 만듭니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1   # Sui CLI + 지갑 (이어서 setup-wallets.ps1. deploy.ps1 은 컨트랙트를 새로 올릴 때만)
cd scripts; npm install
npm run typecheck                                                # 타입 검사
npm run check                                                    # RPC·Walrus·Seal 연결 점검 (`-- --sub` 면 구독·복호화까지)
npm run e2e; npm run e2e:design                                  # 전 과정 검증 (텍스트 기억 / 디자인 과정)
npm run mm -- --help; npm run build:plugin                       # 판매·구매 CLI · MCP 서버 번들
cd ..\tools; npm install; npx playwright install chromium
node selftest.mjs                                                # 포집 훅 자체 검증
node check.mjs ..\demo\buyer\index.html                          # 디자인 5항목
node check-copy.mjs ..\site\index.html                           # 한국어 카피 6항목
cd ..; node tools\consistency.mjs                                # 랜딩·저장소·체인이 어긋나는지
```

마지막 것이 이 저장소의 주장을 스스로 검사합니다. 체인을 직접 읽어서 문서와 랜딩에 적힌 기록 주소·수치·거래가 실제와 맞는지, 컨트랙트 함수가 소스와 같은지 아홉 가지를 대조하고, 하나라도 어긋나면 종료 코드 1 로 끝납니다.
인터넷 연결이 필요합니다.

`.env` 는 [.env.example](.env.example) 참고, 커밋 금지. 데모 실행은 [demo/README.md](demo/README.md).
랜딩 페이지는 [site/index.html](site/index.html) 한 파일이고, 브라우저에서 체인과 Walrus 를 직접 읽습니다.

## 체인에 올라간 주소 (Sui testnet)

패키지 [`0x50cd511c…548f5196`](https://suiscan.xyz/testnet/object/0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196)

지갑, 파는 쪽 `0xb31cf4c4…560f` · 사는 쪽 `0x40648673…e5a6` · 예비 `0xf4f552bd…992a`

| 기록 | 개수 | 값 | 기간 | 산 사람 | 객체 |
|---||---|---|---|---|---|---|
| 웹디자이너 경험 | 10 | 0.05 SUI | 7일 | 0 | [`0xef238e43…9f2a813d`](https://suiscan.xyz/testnet/object/0xef238e432a6f24cd3118088b237ba2122ed39813bec649c39d70e38b9f2a813d) |
| 웹퍼블리셔 경험 | 5 | 0.05 SUI | 7일 | 1 | [`0x8ac6510d…29cd3132`](https://suiscan.xyz/testnet/object/0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132) |
| 카피라이터 경험 | 8 | 0.03 SUI | 7일 | 0 | [`0x0dcb9195…b23993e8`](https://suiscan.xyz/testnet/object/0x0dcb91952d099a1592ad604702aad38f115ce943277127fff58b5b1ab23993e8) |
| 블록체인 개발자 경험 | 33 (글) | 0.01 SUI | 24시간 | 0 | [`0x66c6eefe…8766fa7a`](https://suiscan.xyz/testnet/object/0x66c6eefe159f9f74ee3d137778561d7235fbf32a59338b33ea82b3eb8766fa7a) |

- `0xef238e43…` 는 이번에 새로 올린 것입니다. AI에게 "랜딩 만들어줘" 해서 나온 보라색 그라데이션 페이지
  (Supercharge · Power of AI · 🚀 · Lightning Fast 카드)에서 시작해, 한 번에 하나씩 열 번 고쳐 실제 제품이 보이는 페이지로 만든 과정입니다.
  시작은 디자인 검사 5개 중 3개 · 카피 검사 6개 중 4개 통과였고, 끝은 디자인 5개 전부 · 카피 6개 중 5개입니다
  (따옴표 절제만 걸렸습니다, 예시 문구를 따옴표로 감싸서). 5~6번째에서 awwwards 올해의 사이트 cerebrium.ai 를 참고했고
  (제목 89px · 굵기 300 · 줄간격 1.0 · 자간 -2.2px · 왼쪽 정렬 · 각진 버튼),
  **7번째가 이 기록의 값어치입니다**, 그 수치를 그대로 베꼈더니 한국어 제목이 네 줄로 터져 첫 화면을 통째로 먹었고,
  크기를 낮추는 대신 카피를 줄여서 잡았습니다. publish 트랜잭션
  [`7vZ9WXZz…`](https://suiscan.xyz/testnet/tx/7vZ9WXZzgJPhGvG2HpccLR3bQ2vTv56sjisKDEoWtvyg) 한 건에 10단계 + 미리보기 3건.
- `0x0dcb9195…` 은 미리보기 블롭이 manifest 하나뿐이라 스크린샷이 없습니다. 검사 결과 칸도 비어 있습니다(위 "솔직한 한계" 참고).
- `0x66c6eefe…` 는 텍스트 기억이라 manifest 가 없고, 미리보기 자리에 기억 두 건이 그대로 올라가 있습니다.
  사기 전에 이만큼이 보입니다, *"한글이 포함된 `.ps1` 은 UTF-8 BOM 없이 저장하면 PowerShell 5.x 가 CP949 로 읽어 깨진다"* ·
  *"`expected_failure(abort_code = ...)` 를 쓰는 Move 테스트는 마지막에 도달 불가 코드가 필요해서 `abort 0` 으로 끝내면 컴파일이 통과한다"*.
- 라이브 트랜잭션, [영수증](https://suiscan.xyz/testnet/tx/7HzugJeJna9LDGynREvAer6a3xxMErHxb8WQcmutVuYP)(`0x75b2…` 에 남은 것) ·
  [폐기](https://suiscan.xyz/testnet/tx/GZFerzGztZzyzmpLriHMN4L6m1m7GX58ehkAbJsC4rYz)(통합 검증용 팩에 남은 것, 지금은 목록에 없음)

만료 구독 조회는 `seal_approve aborted: subscription expired`, 같은 구독권의 두 번째 영수증은 abort code 5(`EReceiptExists`),
`retract` 후 조회 제외까지 실측했습니다. 전체 표·트랜잭션 목록·3분 대본은 [docs/DEMO.md](docs/DEMO.md).

## 폴더 구조

```
contracts/memory_market/  Move, MemoryPack · PackCap · Subscription · seal_approve · leave_receipt · retract (테스트 19개)
scripts/                  공용 층(config·session·tx·market·records·evidence·memories·filter·txlog·demo-state) · mm.ts CLI
                          mcp/server.ts (도구 7개) · sync · e2e · e2e-design · check · setup-sui/deploy/setup-wallets.ps1
tools/                    capture.mjs 포집 훅 · check.mjs 디자인 5항목 · check-copy.mjs 카피 6항목 · shot.mjs · first-edit.mjs · lib.mjs · selftest.mjs
skills/                   landing-copy-ko 한국어 랜딩 카피 스킬 (카피 기록이 나온 작업 규칙, check-copy.mjs 사본 동봉, 두 벌을 같이 고친다)
plugin/                   Claude Code 플러그인 (MCP 번들 + 훅), .claude-plugin/marketplace.json 과 짝
demo/                     seller · buyer · baseline 템플릿 (기록을 다시 만들고 실험을 재현할 때 쓴다) · setup.ps1
site/                     랜딩 페이지, index.html 단일 파일, 브라우저에서 체인과 Walrus 를 직접 읽는다
docs/                     ground-truth.md 수치 기준값 · glossary.md 어휘 규칙 · DEMO.md 3분 대본 ·
                          dev-memories.md 개발 기억 30건(Sui 기록의 원천이자 그 자체로 상품)
```

층별 문서 [contracts](contracts/memory_market/README.md) · [tools](tools/README.md) · [plugin](plugin/README.md) ·
[demo](demo/README.md) · [site](site/README.md) · 기획(문제 정의·신뢰 모델) [PLANNING.md](PLANNING.md).

## 로드맵

**정정(supersede)** 낡은 내용을 지우는 대신 새로 고친 것으로 대체하고 산 쪽이 차이를 본다 ·
**도메인 확장** 검사 항목을 기록이 직접 싣고 오게 해서 웹 디자인 밖으로 ·
**스폰서 결제** 재단이 예치하고 신규 개발자는 공짜로 ·
Quilt 로 한 기록을 묶어 저장 · Walrus Sites 카탈로그 · MemWal 자동 수집 연결

Blockthon 2026 출품작. MIT.
