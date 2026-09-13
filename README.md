# Memory Market

랜딩: https://blockthon-th.github.io/my-project/ · 저장소: https://github.com/Blockthon-th/my-project

**당신의 경험을 사겠습니다.** AI 와 일하며 쌓인 경험을, 다른 사람의 AI 가 값을 내고 정해진 기간 동안만 읽어 쓰는 곳입니다.

## AI 시대엔 도메인 지식이 중요합니다

만드는 건 이제 누구나 합니다. AI 한테 시키면 그림도, 문서도, 화면도 나옵니다. 그래서 결과물 자체는 값이 떨어졌습니다.

값이 남는 건 **그 일을 해 본 사람만 아는 것**입니다. 이 화면은 어디서 틀리는지, 무엇부터 손대야 되돌아가지 않는지, 어떤 말로 시켜야 한 번에 되는지. 5년차 웹디자이너가 아는 것과 처음 하는 사람이 아는 것의 차이입니다.

그 지식은 문서에 없습니다. AI 한테 "그거 말고, 다시, 그건 빼고" 하며 몇 번씩 고쳐 간 대화 속에 있습니다. 지금까지는 창을 닫으면 사라졌고, 팔 자리도 없었습니다.

Memory Market 은 그 경험을 파는 자리입니다. 코드나 결과물이 아니라 **어떻게 거기까지 갔는지**를 팝니다. 내가 겪은 시행착오가 다른 사람의 AI 를 빠르게 만들고, 그 값을 내가 받습니다.

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

저장소를 받아 직접 돌려보려는 사람을 위한 부분입니다. 기술 용어와 명령어를 그대로 씁니다.

## 구조

Sui · Walrus · Seal 위에 얹은 앱 층입니다. 프로토콜은 수정하지 않았고 Sui testnet 에 배포돼 있습니다.

| 층 | 무엇을 하나 |
|---|---|
| **Sui** | 공유 객체 `MemoryPack`, 결제와 `Subscription` 발급(수수료는 즉시 판매자에게), Clock 기준 만료, dynamic field. 한 트랜잭션에 publish×N + 미리보기 최대 3건 |
| **Seal** | 판매자 기계에서 단계별로 암호화. 키 ID = 팩 ID ‖ u16 단계번호. 복호화 키는 키 서버가 `seal_approve`(이 팩의 구독인가, 만료 전인가)를 통과할 때만 내려줌 |
| **Walrus** | 암호화된 블롭과 미리보기 저장. 공개되는 건 시작·끝 스크린샷과 manifest 뿐 |
| **MCP** | 구매자 AI 가 쓰는 도구 7개. 도구 종류에 묶이지 않음 |

흐름은 이렇습니다.

```
판매자   평소대로 작업 → 훅이 턴마다 .mm/steps/step-N.json 을 남김
         mm publish → 단계마다 Seal 암호화 → Walrus → 트랜잭션 1건으로 publish×N + 미리보기

구매자   market_find     검색 · 미리보기 해시 대조
         market_acquire  SUI 결제 → Subscription → seal_approve 통과 시 전 단계 복호화 → 해시를 manifest 와 대조
         market_receipt  적용·검사 후 남기는 후기 (구독권 1개당 1회)

만료     새 클라이언트는 키를 못 받음        판매자 retract → 다음 조회에서 자동 제외
```

MCP 도구 7개는 `scripts/mcp/server.ts` 에 있습니다. 위 셋에 텍스트 기억용 `market_list` · `market_preview` · `market_subscribe` · `market_recall` 이 더해집니다.

## 설치

준비물은 Claude Code, Node.js 20 이상, Sui CLI 입니다. Claude Code 를 연 상태에서 두 줄을 입력합니다.

```
/plugin marketplace add Blockthon-th/my-project
/plugin install memory-market
```

결제에는 본인 지갑이 필요합니다. `~/.memory-market/config.json` 에 한 번만 적어 두면 모든 프로젝트에서 쓰입니다.

```json
{ "BUYER_SUI_PRIVATE_KEY": "suiprivkey1..." }
```

testnet 키는 `sui client new-address ed25519` → `sui client faucet --address <주소>` → `sui keytool export --key-identity <주소>` 로 만듭니다. 컨트랙트 주소는 공개 정보라 기본값이 들어 있습니다. 지출 상한과 안전 규칙은 [plugin/README.md](plugin/README.md) 에 있습니다.

## 직접 돌려보기

Windows PowerShell 기준입니다. 기록 4개를 보는 데는 지갑이 필요 없습니다. `npm run e2e` 만 테스트넷 SUI 가 든 지갑 2개를 쓰고 실제 결제를 보냅니다. `.env` 는 [.env.example](.env.example) 을 복사해 만듭니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1   # Sui CLI + 지갑
cd scripts; npm install
npm run typecheck                                                # 타입 검사
npm run check                                                    # 체인·Walrus·Seal 연결 점검. -- --sub 를 붙이면 구독·복호화까지
npm run e2e; npm run e2e:design                                  # 전 과정 검증
npm run mm -- --help; npm run build:plugin                       # 판매·구매 CLI, MCP 서버 번들
cd ..	ools; npm install; npx playwright install chromium
node selftest.mjs                                                # 포집 훅 자체 검증
node check.mjs ..\demouyer\index.html                          # 디자인 5항목
node check-copy.mjs ..\site\index.html                           # 한국어 카피 6항목
cd ..; node tools\consistency.mjs                                # 랜딩·저장소·체인 대조
```

마지막 명령이 이 저장소의 주장을 스스로 검사합니다. 체인을 직접 읽어 이 문서와 랜딩의 기록 주소·수치·거래가 실제와 맞는지, 컨트랙트 함수가 소스와 같은지 아홉 가지를 대조하고, 하나라도 어긋나면 종료 코드 1 로 끝납니다. 데모 실행 순서는 [demo/README.md](demo/README.md) 와 [docs/DEMO.md](docs/DEMO.md) 에 있습니다.

## 체인에 올라간 주소 (Sui testnet)

- 패키지 [`0x50cd511c…548f5196`](https://suiscan.xyz/testnet/object/0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196)
- 지갑: 파는 쪽 `0xb31cf4c4…560f` · 사는 쪽 `0x40648673…e5a6` · 예비 `0xf4f552bd…992a`

| 기록 | 개수 | 값 | 기간 | 산 사람 | 객체 |
|---|---|---|---|---|---|
| 웹디자이너 경험 | 10 | 0.05 SUI | 7일 | 0 | [`0xef238e43…9f2a813d`](https://suiscan.xyz/testnet/object/0xef238e432a6f24cd3118088b237ba2122ed39813bec649c39d70e38b9f2a813d) |
| 웹퍼블리셔 경험 | 5 | 0.05 SUI | 7일 | 1 | [`0x8ac6510d…29cd3132`](https://suiscan.xyz/testnet/object/0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132) |
| 카피라이터 경험 | 8 | 0.03 SUI | 7일 | 0 | [`0x0dcb9195…b23993e8`](https://suiscan.xyz/testnet/object/0x0dcb91952d099a1592ad604702aad38f115ce943277127fff58b5b1ab23993e8) |
| 블록체인 개발자 경험 | 33 (글) | 0.01 SUI | 24시간 | 0 | [`0x66c6eefe…8766fa7a`](https://suiscan.xyz/testnet/object/0x66c6eefe159f9f74ee3d137778561d7235fbf32a59338b33ea82b3eb8766fa7a) |

실제 거래 기록도 체인에 있습니다.

- [기록 올리기](https://suiscan.xyz/testnet/tx/7vZ9WXZzgJPhGvG2HpccLR3bQ2vTv56sjisKDEoWtvyg): 한 트랜잭션에 10단계 + 미리보기 3건
- [산 쪽의 후기](https://suiscan.xyz/testnet/tx/7HzugJeJna9LDGynREvAer6a3xxMErHxb8WQcmutVuYP): 실측에 쓴 옛 웹퍼블리셔 기록에 남은 것
- [판 쪽의 내리기](https://suiscan.xyz/testnet/tx/GZFerzGztZzyzmpLriHMN4L6m1m7GX58ehkAbJsC4rYz): 검증용 기록에서 한 것

만료된 구독으로 열면 `seal_approve aborted: subscription expired`, 같은 구독권의 두 번째 후기는 abort code 5(`EReceiptExists`) 로 막히는 것까지 실측했습니다.

## 폴더 구조

| 폴더 | 내용 |
|---|---|
| `contracts/memory_market/` | Move 컨트랙트. `MemoryPack` · `PackCap` · `Subscription` · `seal_approve` · `leave_receipt` · `retract`, 테스트 19개 |
| `scripts/` | 공용 층(config · session · tx · market · records · evidence · memories · filter · txlog), `mm.ts` CLI, `mcp/server.ts` 도구 7개, sync · e2e · check, 설치 스크립트 |
| `tools/` | `capture.mjs` 포집 훅, `check.mjs` 디자인 5항목, `check-copy.mjs` 카피 6항목, `consistency.mjs` 정합 검사, `shot.mjs`, `selftest.mjs` |
| `plugin/` + `.claude-plugin/` | Claude Code 플러그인(MCP 번들 + 훅)과 마켓플레이스 등록 |
| `skills/landing-copy-ko/` | 한국어 랜딩 카피 스킬. `check-copy.mjs` 사본 동봉 |
| `site/` | 랜딩 페이지. `index.html` 한 파일이 브라우저에서 체인과 Walrus 를 직접 읽음 |
| `demo/` | 판매·구매·대조군 템플릿. 기록을 다시 만들고 실험을 재현할 때 씀 |
| `docs/` | `DEMO.md` 데모 대본, `dev-memories.md` 개발 기억(블록체인 개발자 경험의 원천) |

층별 문서: [contracts](contracts/memory_market/README.md) · [tools](tools/README.md) · [plugin](plugin/README.md)

## 로드맵

- **정정**: 낡은 내용을 지우는 대신 새로 고친 것으로 대체하고, 산 쪽이 차이를 본다
- **도메인 확장**: 검사 항목을 기록이 직접 싣고 오게 해서 웹 디자인 밖으로
- **스폰서 결제**: 재단이 예치하고 신규 개발자는 공짜로
- Quilt 로 한 기록을 묶어 저장, Walrus Sites 카탈로그, MemWal 자동 수집 연결

Blockthon 2026 출품작. MIT.
