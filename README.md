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

## 어떻게 쓰나

### 파는 쪽

1. Claude Code 에 플러그인을 깝니다. 두 줄이면 끝납니다.
   ```
   /plugin marketplace add Blockthon-th/my-project
   /plugin install memory-market
   ```
2. 평소처럼 AI 와 일합니다. 한 번 고칠 때마다 뭘 시켰고, 뭐가 바뀌었고, 화면이 어떻게 달라졌고, 왜 그렇게 했는지가 자동으로 한 덩어리씩 쌓입니다.
3. 쌓인 걸 올립니다. 값과 기간을 정하면 끝입니다.
   ```
   npm run mm -- publish --new --fee 0.05 --ttl 7d
   ```

### 사는 쪽

1. 같은 플러그인을 깔고, AI 가 값을 치를 지갑을 한 번만 적어 둡니다.
   ```
   ~/.memory-market/config.json  →  {"BUYER_SUI_PRIVATE_KEY":"suiprivkey1..."}
   ```
2. AI 한테 그냥 일을 시킵니다. 사라는 말은 안 해도 됩니다.
3. AI 가 시장에서 맞는 경험을 찾아 사고, 읽고, 내 일에 씁니다. 기간이 지나면 새로 열 수 없습니다.

### 실제로 돌려본 기록 (2026-09-13)

플러그인만 깐 빈 폴더에 결함 있는 랜딩 초안을 두고 이렇게만 시켰습니다.

> 이 폴더의 index.html 은 우리 회사 랜딩 초안이야. 버튼이 배경에 묻히고 제목이 세 줄로 떨어지고 폰에서 옆으로 밀려. 이 셋을 고쳐줘.

AI 가 한 일은 이 순서였습니다.

1. 파일을 읽고 뭐가 문제인지 파악
2. `market_find("landing page hero CTA button contrast, headline line breaks, mobile horizontal scroll")` 로 시장 검색
3. 웹퍼블리셔 경험이 맞는다고 보고 `market_acquire` 로 구매 (체인에 결제 기록이 남았고, 그 기록의 산 사람이 1명이 됐습니다)
4. 다섯 단계를 복호화해 받아 파일을 고침

같은 결함을 두고 미리 재 본 값도 있습니다. 경험을 사서 고치면 2분 0초, 사지 않고 고치면 제일 빨랐던 때가 3분 30초였고 AI 사용료는 $0.70 대 $1.17 이었습니다.

### 지금 사볼 수 있는 것

| 기록 | 몇 번 | 값 | 기간 | 산 사람 | 사기 전에 보이는 것 |
|---|---|---|---|---|---|
| 웹디자이너 경험 | 10번 | 0.05 SUI | 7일 | 0 | 고치기 전·후 화면 2장 + 설명 |
| 웹퍼블리셔 경험 | 5번 | 0.05 SUI | 7일 | 1 | 고치기 전·후 화면 2장 + 설명 |
| 카피라이터 경험 | 8번 | 0.03 SUI | 7일 | 0 | 설명만 |
| 블록체인 개발자 경험 | 글 33건 | 0.01 SUI | 24시간 | 0 | 실제 교훈 글 2건 |

SUI 는 가상화폐 단위이고, 지금은 연습용 네트워크라 진짜 돈이 들지 않습니다. 이름과 값은 체인에 있는 그대로이며 `node tools/consistency.mjs` 가 매번 대조합니다.

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

마지막 것이 이 저장소의 주장을 스스로 검사합니다. 체인을 직접 읽어서 이 문서와 랜딩에 적힌 기록 주소·수치·거래가 실제와 맞는지, 컨트랙트 함수가 소스와 같은지 아홉 가지를 대조하고, 하나라도 어긋나면 종료 코드 1 로 끝납니다.
인터넷 연결이 필요합니다.

`.env` 는 [.env.example](.env.example) 참고, 커밋 금지. 데모 실행은 [demo/README.md](demo/README.md).
랜딩 페이지는 [site/index.html](site/index.html) 한 파일이고, 브라우저에서 체인과 Walrus 를 직접 읽습니다.

## 체인에 올라간 주소 (Sui testnet)

패키지 [`0x50cd511c…548f5196`](https://suiscan.xyz/testnet/object/0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196)

지갑, 파는 쪽 `0xb31cf4c4…560f` · 사는 쪽 `0x40648673…e5a6` · 예비 `0xf4f552bd…992a`

| 기록 | 개수 | 값 | 기간 | 산 사람 | 객체 |
|---|---|---|---|---|---|
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
- `0x0dcb9195…` 은 미리보기 블롭이 manifest 하나뿐이라 스크린샷이 없습니다. 검사 결과 칸도 비어 있습니다.
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
                          dev-memories.md 개발 기억 30건(Sui 기록의 원천이자 그 자체로 상품)
```

층별 문서 [contracts](contracts/memory_market/README.md) · [tools](tools/README.md) · [plugin](plugin/README.md) ·

## 로드맵

**정정(supersede)** 낡은 내용을 지우는 대신 새로 고친 것으로 대체하고 산 쪽이 차이를 본다 ·
**도메인 확장** 검사 항목을 기록이 직접 싣고 오게 해서 웹 디자인 밖으로 ·
**스폰서 결제** 재단이 예치하고 신규 개발자는 공짜로 ·
Quilt 로 한 기록을 묶어 저장 · Walrus Sites 카탈로그 · MemWal 자동 수집 연결

Blockthon 2026 출품작. MIT.
