# 데모 시나리오 (3분): 디자인 과정 팩

> 핵심 한 장면: **구매자 창에서 `/improve` 한 번.** 에이전트가 시장에서 다른 사람의 "고친 과정 팩"을 사서(온체인 결제 + Seal 복호화)
> 자기 랜딩에 적용하고, 검사 5/5 결과로 영수증을 체인에 남긴다.
> **같은 파일·같은 프롬프트를 팩 없이 돌린 3회는 210 / 350 / 218초, $1.17 / $1.88 / $1.20 가 들었다. 팩을 산 쪽은 120초, $0.70.**
> 검사 도구만 쥐여주면 팩 없이도 3회 다 결국 5/5 를 맞춘다(176 / 201 / 226초). 그래서 파는 것은 **되냐 안 되냐가 아니라 얼마나 빨리 되냐**다.
> 만료된 구독은 Seal 이 열쇠를 거부하고, 낡은 단계는 판매자가 폐기하면 다음 recall 에서 빠진다.

숫자는 전부 [ground-truth.md](ground-truth.md) 값이다. 이 대본과 어긋나면 ground-truth 가 맞다.

**발표 화면은 공개 랜딩(https://blockthon-th.github.io/my-project/)을 그대로 띄운다.** 별도 비교 화면(compare.html)은 저장소에서 뺐다.
아래 대본의 D 탭1 / 탭2 / 탭3 은 각각 랜딩의 첫 화면 / 기록 상세(`#/pack/…`) / 상세의 "이 기록을 쓰면" 칸으로 읽는다. `R`·`F` 키는 없다.
폴더 지도는 [demo/README.md](../demo/README.md), 판매자 5턴 대본은 [demo/seller/SESSION-SCRIPT.md](../demo/seller/SESSION-SCRIPT.md).

**아래 명령의 `$PACK` · `$SUIMEM` 은 터미널 C 에서 미리 잡아 두는 변수다** (PowerShell, 준비 단계에서 한 번):

```powershell
$PACK   = '0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132'   # Paylane 랜딩 5턴 교정 과정
$NEW    = '0xef238e432a6f24cd3118088b237ba2122ed39813bec649c39d70e38b9f2a813d'   # AI가 뱉은 랜딩을 고쳐나간 기록
$SUIMEM = '0x66c6eefe159f9f74ee3d137778561d7235fbf32a59338b33ea82b3eb8766fa7a'   # Sui 온보딩 실전 기억
```

## 먼저 알아야 할 두 가지 함정

1. **구매자 지갑으로는 Paylane 팩에 영수증을 다시 못 남긴다.**
   구매자 지갑 `0x40648673…e5a6` 는 Paylane 팩(`0x75b2…`)을 이미 샀고 그 구독권 `0x5deee9ce…d051c` 로 **영수증까지 남겼다**
   (outcome 2). 영수증은 **구독권 1개당 1회**라 같은 구독권으로 다시 부르면 `EReceiptExists`(abort code 5) 로 실패한다.
   그 구독권은 **2026-09-14 23:14:31 KST 에 만료**된다, 만료 뒤에 다시 사면 구독권이 새로 발급되므로 영수증도 다시 남길 수 있다.
   → **만료 전에 리허설을 찍으려면 예비 지갑 `0xf4f552bd…992a`(BUYER2) 를 쓴다.** 아래 "예비 지갑으로 바꾸기" 참고.
2. **비교 장면(탭3)의 기준선·LIVE 수치는 Paylane 팩 실험 값 하나뿐이다.**
   다른 세 팩에는 이 실험이 없다. 다른 팩을 사는 장면으로 바꾸면 **비교 표를 그 팩의 결과인 것처럼 말하면 안 된다.**

## 예비 지갑으로 바꾸기 (만료 전에 돌릴 때만)

`.env` 또는 `~/.memory-market/config.json` 의 `BUYER_SUI_PRIVATE_KEY` 를 BUYER2 키로 바꾼다. 확인:

```powershell
cd C:\mm\scripts
npm run check                      # 첫 줄 buyer 주소가 0xf4f552bd…992a 인지, 가스 ≥ 0.1 SUI 인지
sui client gas --address 0xf4f552bd…992a
```

MCP 서버는 시작할 때 키를 읽으므로 **구매자 창(`claude`)을 껐다 켜야** 바뀐 키가 먹는다.
데모가 끝나면 원래 키로 되돌린다.

## 지금 체인에 올라와 있는 것: 팩 넷

기준값은 [ground-truth.md](ground-truth.md). 이 표와 어긋나면 ground-truth 가 맞다.

패키지 `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196` ·
지갑, 판매자 `0xb31cf4c4…560f` · 구매자 `0x40648673…e5a6` · 예비 `0xf4f552bd…992a`

| 팩 | id | 개수 | 값 · 기간 | 구독 | 데모에서 |
|---|---|---|---|---|---|
| Paylane 랜딩 5턴 교정 과정 | `0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132` | 5 | 0.05 SUI · 7일 | 1 | **본 시나리오.** 미리보기 3건(manifest + 전·후 스크린샷). 비교 표가 이 팩 것이다 |
| AI가 뱉은 랜딩을 고쳐나간 기록 | `0xef238e432a6f24cd3118088b237ba2122ed39813bec649c39d70e38b9f2a813d` | 10 | 0.05 SUI · 7일 | 0 | 이번에 새로 올린 것. 미리보기 3건. 구독·영수증이 0 이라 **지갑을 안 바꿔도 라이브 구매가 되는 유일한 디자인 팩**. 단 비교 표는 못 쓴다 |
| 한국어 랜딩 카피 8번 고친 과정 | `0x0dcb91952d099a1592ad604702aad38f115ce943277127fff58b5b1ab23993e8` | 8 | 0.03 SUI · 7일 | 0 | 미리보기가 manifest 1건뿐이라 스크린샷이 없다(필름스트립이 와이어프레임으로 그려진다). **검사 결과 칸이 비어 있다** |
| Sui 온보딩 실전 기억 | `0x66c6eefe159f9f74ee3d137778561d7235fbf32a59338b33ea82b3eb8766fa7a` | 30 (글) | 0.01 SUI · 24시간 | 0 | 텍스트 팩이라 manifest 가 없고 미리보기가 기억 샘플 자체다. **150초 폐기 장면에서 쓴다** |

목록에 없지만 체인에는 남아 있는 것: e2e 테스트 팩 2개 · 통합 검증용 1개(기간 5분 미만이라 자동 제외),
그리고 `0xd2902d30…`(이름은 "다섯 번에"인데 14개가 들어 있어 기간을 5분 아래로 내려 내렸다). 심사위원이 체인에서 보면 물어볼 수 있다.

## 화면 배치

| 창 | 내용 | 위치 |
|---|---|---|
| **A** 구매자 Claude Code | `C:\demo\buyer` 에서 `claude`. `/improve` 만 친다 | 왼쪽 큰 창 |
| **B** 판매자 폴더 | 탐색기로 `C:\demo\seller\.mm\steps\` (step-1..5.jpg 미리보기 창), 사전 실행 결과 | 오른쪽 위, 50초에 닫음 |
| **C** 별도 터미널 | `C:\mm\scripts`. `mm recall --fresh`, `mm retract` 두 명령을 히스토리에 넣어 둠 | 오른쪽 아래 |
| **D** 브라우저 | 탭 1 https://blockthon-th.github.io/my-project/ (F11 전체화면), 탭 2 Suiscan 팩 객체, 탭 3 Suiscan tx (비워둠) | 전환용 |

발표자 한 명이 A → D → B → A → C → D → A → C → D 순으로 오간다. 창 전환은 Alt+Tab 이 아니라 **작업표시줄 클릭** (녹화·프로젝터에서 덜 틀린다).

## 타임라인 (180초)

| 초 | 창 | 하는 것 | 말 (요지) | 실패 시 |
|---|---|---|---|---|
| **0–10** | A | `/improve` 엔터. 도구 호출이 시작되는 것만 보고 D 로 | "구매자는 이 한 줄만 칩니다. 에이전트가 일하는 동안 배경을 보죠." | 명령이 안 뜨면 `.claude/commands/improve.md` 문장을 직접 붙여넣기 |
| **10–25** | D 탭1 (첫 화면) | `1` 키 | 화면의 큰 수치 셋(걸린 시간·주고받은 횟수·AI 사용료)을 짚는다. "결과 스냅샷(v0·ChatGPT 공유)이 아니라 **고친 과정**을, 기간제로, 검증과 함께 팝니다." |, |
| **25–50** | D 탭2 → B → D 탭2(Suiscan) | `2` 키. 필름스트립 5장(결함→교정, "선택자만 수정" 배지, 시각) 가리키고, B 의 step-N.jpg 를 슥 넘기고, Suiscan 팩 객체(`memory_count` 5, 미리보기 3건) | "판매자는 Claude Code 로 이 랜딩을 **5턴** 고쳤을 뿐입니다. 훅이 턴마다 프롬프트·diff·스크린샷·왜·알게 된 것을 한 단계로 기록해 Seal 로 잠그고 Walrus 에 올렸고, 팩 객체에 등록됐습니다. 구매 전에는 단계 제목과 해시, 전·후 스크린샷만 공개됩니다." | B 가 없으면 탭2 만으로 |
| **50–75** | A | 로그를 위에서 아래로 읽어 준다: `market_find` (관련도 1위) → `market_acquire` (subscribe tx digest → "단계 5개 복호화, record_hash 5/5 manifest 일치") → Edit 들. **B 창을 닫는다.** | "결제는 판매자에게 즉시 갔고, 복호화 열쇠는 Seal 키 서버가 **온체인 구독권을 확인하고** 내줬습니다. 판매자 컴퓨터는 이제 꺼져도 됩니다." (B 를 닫으며) | 에이전트가 시장을 안 부르면 "먼저 market_find 로 관련 팩 찾아서 사" 한 줄 입력. 그래도 안 되면 C 에서 `npm run mm -- recall --pack $PACK` 로 플레이북 출력 |
| **75–110** | C | `npm run mm -- recall --pack <만료 팩> --sub <만료 구독> --fresh` → `seal_approve aborted: subscription expired (expires_at_ms … < now)`. 탭3 의 LIVE 칸(스크린샷·5/5·적용표)은 구매자 창의 `market_receipt` 가 자동으로 채운다. 안 채워졌으면 `npm run mm -- --project C:\demo\seller state --live C:\demo\buyer --evidence C:\demo\buyer\evidence.json` (5초) | "이건 어제 산 구독인데 만료됐습니다. 새 클라이언트로 열쇠를 요청하면, 우리 서버가 아니라 **Seal 키 서버가** `seal_approve` 를 시뮬레이션해서 거부합니다. 평문 사본이 넘어간 적이 없으니 회수할 것도 없습니다. 블록체인 없이는 못 만드는 장면입니다." | 거부가 아니라 성공/다른 에러면: 리허설 때 저장한 `type C:\demo\logs\expired.txt` |
| **110–135** | D 탭3 (비교) | `3` 키. 왼쪽 "기록 없이 3회" 카드 세 장(210·350·218초, $1.17·$1.88·$1.20) → 오른쪽 "이 기록을 산 AI"(120초, $0.70) → 적용표(단계 → 선택자) | "같은 파일, 같은 프롬프트, 팩만 없이 세 번: 첫 수정은 1, 0, 1 이고 최종은 셋 다 4/5 에서 멈췄습니다. 셋 다 놓친 항목이 같은 `h1-lines`, 한국어 제목이 세 줄로 떨어지는 문제입니다.<br>(타일이 6장이면 위 3장은 `검사 도구 있음` 대조군이다. **먼저 짚고 넘어간다**: "검사 도구를 쥐여준 세 번은 결국 5/5 를 맞췄습니다, 176초, 201초, 226초 걸렸고요. 그래서 이 팩이 파는 건 되냐 안 되냐가 아니라 **얼마나 빨리 되냐**입니다. 아래 세 번이 검사 도구 없이 돌린, 실제 사용자에 가까운 쪽입니다.") 팩을 산 뒤엔 첫 시도에 5/5, **어느 단계의 알게 된 것이 이 파일의 어느 선택자로 갔는지** 표로 남습니다." | LIVE 가 아직 없거나 5/5 가 아니면 **`R` 키** → 오른쪽이 fallback(사전 실행)으로 바뀌고 "사전 실행" 라벨이 붙는다. 라벨을 가리지 말고 "리허설 기록입니다" 라고 말한다 |
| **135–150** | A → D 탭3 | A 의 마지막 줄 `market_receipt` → `leave_receipt` digest. D 탭3 하단 트랜잭션 목록의 "영수증 Suiscan ↗" 클릭 | "구매자 에이전트가 검사 결과를 Walrus 에 올리고 팩에 영수증을 남겼습니다. 다음 구매자는 '샀더니 됐다' 를 판매자 말이 아니라 체인에서 봅니다. 구독권 하나에 영수증 하나, 만료 뒤에도 남길 수 있습니다." | tx 실패(가스·`EReceiptExists`)면 D-1 에 기록한 리허설 영수증 digest 링크. `EReceiptExists` 면 **구매자 지갑을 안 바꾼 것**이다 (위 "먼저 알아야 할 두 가지 함정" 1번) |
| **150–168** | C | `npm run mm -- retract --pack $SUIMEM --step <N> --reason sdk-changed` → 이어서 `npm run mm -- recall --pack $SUIMEM` 에서 그 단계가 빠진 것 | "기억은 상합니다. 이 Sui 팩의 이 단계는 SDK 1.x 시절 얘기라 지금은 틀린 답입니다. 판매자가 폐기하면 구독자의 다음 recall 에서 즉시 빠지고, 폐기 이력은 팩에 남습니다." | `EAlreadyRetracted` 등이면 리허설 retract digest + "빠진 recall" 스크린샷 |
| **168–180** | D 탭1 (첫 화면) | `1` 키 | "결과가 아니라 과정을, 기간제로, 검증과 폐기까지. Sui 객체·Clock·Seal 정책·Walrus, 프로토콜 수정 없이 앱 층만으로." |, |

말은 120초 분량이다. 에이전트 로그가 늦으면 말을 늘리지 말고 **다음 장면으로 넘어갔다가 돌아온다** (50–75 와 135–150 은 순서를 바꿔도 된다).

## 실측 결과 (2026-09-07 리허설, testnet)

아래 수치는 **Paylane 팩(`0x75b2…`) 하나를 두고 한 실험이다. 다른 세 팩에는 이런 실험이 없다.**

| 항목 | 결과 |
|---|---|
| 판매자 5턴 (실제 Claude Code 헤드리스, 훅 자동 기록) | 단계 5개 전부 targeted, step-note 5/5, 검사 1/5→5/5, 턴당 41/70/46/55/40초, Stop 훅 1.7~2.1초 |
| 팩 발행 | publish×5 + add_preview×3 을 트랜잭션 1건으로, 팩 `0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132` |
| 구매자 라이브 (/improve 1회) | market_find → market_acquire(0.05 SUI 결제, 5단계 배치 복호화) → Edit 6회(Write 1) → 검사 **5/5 첫 시도** → evidence.json → market_receipt. 15턴 120초, AI 사용료 $0.70 |
| 기준선 A: 팩 없음 + 검사 도구 **있음** ×3 | 5/5, 5/5, 5/5, **도구를 주면 결국 맞춘다. 176초 / 201초 / 226초.** 숨기지 않고 말한다 |
| 기준선 B: 팩 없음 + 검사 도구 **없음** ×3 | 첫 수정 1/5 → 최종 4/5 (16턴 210초, Edit 11, $1.17) · 첫 수정 0/5 → 최종 4/5 (26턴 350초, Edit 20, $1.88) · 첫 수정 1/5 → 최종 4/5 (17턴 218초, Edit 14, $1.20) |
| 세 번 다 놓친 항목 | `h1-lines`, 한국어 제목이 세 줄로 떨어지는 문제. Paylane 팩의 2단계가 정확히 그 문제다 |
| 만료 거부 | 짧은 ttl 팩의 만료 구독으로 `mm recall --fresh` → `seal_approve aborted: subscription expired` (Seal 키 서버 거부, 실측) |
| CLI 체인 | publish → recall(자동 구독) → receipt ✓ → 같은 구독권 2번째 receipt abort code 5 ✓ → retract step 2 ✓ → recall 4/4 (폐기 제외) ✓ |
| 알려진 함정 (실측) | 기준선에 검사 도구를 주면 비교가 무너진다 / 워크스페이스 미신뢰 시 MCP 권한 거부 / 만료 대기는 **구독 시각** 기준 / 없는 파일도 4/5 로 채점되던 check.mjs → 수정됨 |

## 사전 준비 체크리스트

### D-1 (전날)

- [ ] **Claude Code 로그인·신뢰** (2026-09-07 실측에서 두 번 걸린 지점):
  - npm 설치본은 PATH 에 없다: `& "$env:APPDATA\npm\claude.cmd" auth login` (또는 사용자 PATH 에 `%APPDATA%\npm` 추가)
  - 각 데모 폴더(`C:\demo\seller`, `buyer`, `baseline-*`)에서 `claude` 를 한 번 열어 **신뢰 대화상자 수락**. 수락 전에는 `.claude/settings.json` 의 `permissions.allow` 가 무시되어 `market_find` 가 "haven't granted" 로 거부된다. 헤드리스(`claude -p`)로 돌릴 때는 `~/.claude.json` 의 `projects["C:/demo/buyer"].hasTrustDialogAccepted: true` 가 있어야 한다
- [ ] **오늘 체인 상태를 다시 확인한다**, 위 "지금 체인에 올라와 있는 것" 표와 [ground-truth.md](ground-truth.md) 가 같은 값인지.
- [ ] **`0xef238e43…` 로 돌릴지 결정.** Paylane 팩으로 갈 거면 **예비 지갑 BUYER2 로 바꾼다**(맨 위 "예비 지갑으로 바꾸기").
      구독권 만료(2026-09-14 23:14:31 KST) 뒤라면 원래 구매자 지갑 그대로도 된다, 새 구독권이 발급되므로 영수증도 새로 남는다
- [ ] `powershell -ExecutionPolicy Bypass -File C:\mm\demo\setup.ps1` → `C:\demo\{seller,buyer,baseline-1..3}`
- [ ] **판매자 5턴**: `C:\demo\seller` 에서 `claude`, [SESSION-SCRIPT.md](../demo/seller/SESSION-SCRIPT.md) 의 프롬프트 순서대로. 턴마다 ```step-note``` 블록 확인
- [ ] (아래 `mm` 명령은 전부 `cd C:\mm\scripts` 에서, `--project C:\demo\seller` 를 붙여 실행)
- [ ] `npm run mm -- --project C:\demo\seller review` → 단계 5개, 스크린샷 5쌍, record_hash 체인 OK. lesson 이 빈 단계는 `--step N --lesson ".."` 로 보충
- [ ] **publish 하기 전에** 만료 시연용 사본을 떠 둔다: `robocopy C:\demo\seller C:\demo\seller-expiry /E` (publish 는 `state.json` 에 발행 기록을 남겨 같은 폴더에서 두 번째 팩을 만들 수 없다)
- [ ] (새 팩을 또 올릴 거면) `npm run mm -- --project C:\demo\seller publish --new --fee 0.05 --ttl 7d --label claude-code` → **pack id 를 여기 적는다**: `0x________` (팩 이름은 `.mm/config.json` 의 `name`). **올린 팩은 ground-truth.md 표에 바로 추가한다**
- [ ] `npm run mm -- --project C:\demo\seller state --pack 0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132` → 오류 없이 끝나는지
- [ ] **기준선 3회** (템플릿은 **검사 도구 없이** 돌린다, 검사 도구를 쥐여준 기준선은 실측 3/3 이 5/5 를 맞췄고 176 / 201 / 226초가 걸렸다. 비교는 **첫 수정 점수 / 최종 점수 / 턴 수 / 소요 / AI 사용료** 로 한다): `C:\demo\baseline-1..3` 각각 `claude` → `/improve` → `npm run mm -- --project C:\demo\seller baseline --dir C:\demo\baseline-N --label run-N` → 탭3 왼쪽에 3장. 첫 수정 직후 파일은 훅이 `.first-edit.html` 로 남긴다 (`node C:\mm\tools\check.mjs C:\demo\baseline-N\.first-edit.html`)
- [ ] **만료 구독 준비** (사본 폴더에서, 6분 ttl, 5분 미만 팩은 목록에서 자동으로 숨겨져 구독 스크립트가 못 찾는다):
  1. `npm run mm -- --project C:\demo\seller-expiry publish --new --fee 0.01 --ttl 6m --name expiry-demo --label claude-code` → pack id `0x________`
  2. 구매자 지갑으로 구독: `$env:MARKET_PACK_ID='<그 id>'; npm run check -- --sub` → 출력의 구독권 id `0x________`
  3. **`.env` 의 `MARKET_HIDDEN_PACKS` 에 그 pack id 추가**, 안 그러면 데모 중 `market_find` 가 같은 manifest 의 이 팩을 후보로 띄운다 (`recall --pack` 은 영향 없음)
  4. **구독한 시각** 기준 6분 뒤(발행 시각이 아니다, 리허설 스크립트가 이걸 틀려 만료 26초 전에 실행한 적 있다) `npm run mm -- recall --pack <id> --sub <sub id> --fresh` 가 `seal_approve aborted: subscription expired …` 를 내는지 확인. 출력을 `C:\demo\logs\expired.txt` 로 저장
  - 빠른 대안: `npm run e2e` 가 짧은 ttl 팩 + 구매자 구독을 만들고 `pack:` 을 출력한다. 만료 뒤 그 id 로 `recall --fresh` 하면 같은 거부가 난다 (단, 이 팩은 텍스트 형식이라 만료 전에는 recall 이 파싱에 실패할 수 있다, 만료 장면 전용)
- [ ] **폐기 대상 정하기**: Sui 기억 팩(`0x66c6eefe…`)에서 `@mysten/sui 1.x` 시절 항목의 step 번호. retract 는 단계당 1회뿐이므로 **리허설용 N 과 본 데모용 N' 을 다르게** 잡는다. `recall` 은 구독이 없으면 자동으로 0.01 SUI 를 결제해 구독한다는 점을 알고 있을 것
- [ ] 영수증 대체용: 리허설의 `leave_receipt` digest 기록: `________`
- [ ] **전체 리허설 1회를 녹화** (OBS, 1920×1080, 3분) → `C:\demo\recording\memory-market-demo.mp4`. 전면 실패 시 이 영상으로 발표
- [ ] 리허설 뒤 `setup.ps1 -Only buyer` 와 `-Only baseline` 으로 구매자·기준선만 초기화 (판매자는 `-KeepSellerSteps` 로 단계 보존)

### 30분 전

- [ ] 구매자(또는 예비)·판매자 지갑 가스 각각 ≥ 1 SUI (`sui client gas --address <주소>`), 부족하면 faucet
- [ ] 시계: `cd C:\mm\scripts; npm run check` 첫 줄의 skew 확인. `session.ts` 가 보정하지만 120초 넘으면 중단되므로 관리자 PowerShell 에서 `w32tm /resync /force`
- [ ] 랜딩 상세(`#/pack/0x8ac6510d9c6066ee6b788ff5ec8753bff6cbeb7d2fcf9e91bc93e7f029cd3132`)가 체인 값을 제대로 읽어 오는지 (값 · 기간 · 산 사람 수)
- [ ] D 탭2 Suiscan 팩 객체 미리 로드 (첫 로드가 느리다)
- [ ] A: `C:\demo\buyer` 에서 `claude` → `/mcp` 에 memory-market **connected** → `market_find` 한 번 호출해 워밍(첫 Walrus 읽기가 느림) → `/clear`
- [ ] 구매자 `index.html` 이 v1 인지: `node C:\mm\tools\check.mjs C:\demo\buyer\index.html` → failed 5
- [ ] **살 팩에 그 지갑의 유효한 구독·영수증이 없는지.** 유효한 구독이 살아 있으면 `market_acquire` 가 재사용해서 subscribe tx 가 안 뜨고,
      그 구독권으로 영수증을 이미 남겼으면 135초 장면이 abort code 5 로 죽는다. 맨 위 "먼저 알아야 할 두 가지 함정" 1번을 다시 읽을 것
- [ ] C: `C:\mm\scripts` 에서 `recall --fresh`, `state --live …`, `retract`, `recall` 네 명령을 한 번씩 입력해 히스토리에 올려두고 `cls`
- [ ] 프로젝터 1920×1080, 브라우저 확대 100%, 터미널 글꼴 18pt 이상, 알림 끄기(집중 지원)

### 5분 전

- [ ] D 탭1 에서 `F` (상태 다시 읽기) → `1` 로 첫 화면
- [ ] A `/clear`, C `cls`, B 탐색기를 `.mm\steps` 에 열어두기

## 실패 시 대체 절차

| 장면 | 증상 | 대체 |
|---|---|---|
| 0–10 | `/improve` 가 명령으로 안 잡힘 | `.claude/commands/improve.md` 의 문장을 그대로 입력 |
| 50–75 구매 | `market_acquire` 가 30초 넘게 걸림 (Walrus 읽기·Seal 키 5개) | 기다리지 말고 75초 장면으로 갔다가 110초에 돌아와 로그 확인 |
| 50–75 구매 | 에이전트가 시장을 부르지 않음 | "먼저 market_find 로 관련 팩을 찾아서 사" 입력. 그래도 안 되면 C 에서 `npm run mm -- recall --pack $PACK` 로 플레이북을 보여주고 계속 |
| 50–75 구매 | `market_find` 가 `haven't granted` 로 거부 | 신뢰 대화상자 미수락. `claude` 를 종료하고 폴더에서 다시 열어 수락(또는 `~/.claude.json` 의 `hasTrustDialogAccepted`), MCP 재연결 |
| 50–75 구매 | `이미 구독 중` (리허설 구독이 살아 있음) | 그대로 진행, "어제 산 구독을 재사용" 이라고 말한다. subscribe tx 는 탭3 하단 리허설 digest 로. **단 그 구독권으로 영수증을 이미 남겼으면 135초 장면을 건너뛴다** |
| 75–110 만료 | 거부가 아니라 복호화 성공 | `--fresh` 를 빠뜨렸는지 확인(같은 SealClient 는 키를 캐시한다). 그래도 안 되면 `type C:\demo\logs\expired.txt` |
| 75–110 만료 | `ExpiredSessionKeyError` 등 다른 에러 | 시계 오차(1ms 라도 미래면 거부). 시간 없으니 `expired.txt` 로 대체하고 넘어간다 |
| **110 비교** | LIVE 가 없거나 5/5 가 아님 | **`R` 키** → fallback(리허설 기록)으로 전환, "사전 실행" 라벨을 보이는 채로 설명. 거짓말하지 않는다 |
| 135 영수증 | `EReceiptExists` (abort 5) | 그 구독권으로 이미 영수증을 남긴 것이다. 예비 지갑으로 안 바꿨다는 뜻, D-1 기록의 리허설 영수증 digest 를 탭3 에서 클릭하고 넘어간다 |
| 135 영수증 | 가스 부족 등 다른 tx 실패 | D-1 기록의 리허설 영수증 digest 링크 |
| 150 폐기 | `EAlreadyRetracted` / `ENoSuchBlob` | 본 데모용 step N' 을 썼는지 확인. 실패하면 리허설 retract digest + recall 스크린샷 |
| 전면 | RPC/Walrus/Seal 중 하나라도 죽음 (`npm run check` 실패) | **리허설 녹화 영상** `C:\demo\recording\memory-market-demo.mp4` 를 재생하며 같은 말을 한다. 영상 앞에 "테스트넷이 지금 불안정해 어제 녹화본으로" 한 문장 |

## 예상 질문

| 질문 | 답 |
|---|---|
| v0 · ChatGPT 공유 링크와 뭐가 다른가 | 링크는 **결과 한 장**. 팩은 **단계마다** 프롬프트·diff·스크린샷·왜·알게 된 것·거절 여부가 있어 다른 프로젝트의 다른 선택자에 옮길 수 있다. 검증(검사 5항목 + 영수증), 만료(Seal), 폐기(retract), 정산(SUI)이 있다. |
| 그래서 팩이 없으면 못 하는 일인가 | **아니다. 그건 우리가 직접 재서 확인했다.** 검사 도구만 쥐여주면 팩 없이도 세 번 다 5/5 를 맞췄다(176 / 201 / 226초). 팩이 줄여 주는 건 **시간·주고받은 횟수·AI 사용료**다, 2분 0초 / 15턴 / $0.70 대 평균 4분 20초 / 20턴 / $1.42. |
| 구독자가 복호화한 HTML·스크린샷을 재배포하면 | 막지 못한다. 다만 사본에는 record_hash 체인·영수증·폐기 이력이 없어 정품과 구분된다. 향후 과제. |
| 검사 5항목은 누가 정하나 | 판매자가 manifest 에 **구매 전에** 선언한다. 구매자 에이전트가 같은 공개 검사기(`tools/check.mjs`)로 채점해 영수증을 남기므로 판매자가 스스로 채점하지 않는다. 다만 **웹 랜딩 5항목이 기본값이고, 다른 검사 목록을 실은 팩은 그 검사를 무엇으로 재는지 사는 쪽에 알려줄 방법이 아직 없다**(카피 팩의 검사 칸이 비어 있는 이유). |
| 만료 뒤에도 이미 받은 키로 읽히지 않나 | 그렇다. Seal 은 발급된 키를 소급 회수하지 않는다. 회수는 **새 클라이언트·새 세션**에 즉시 적용된다. 그래서 `mm recall --fresh` 와 MCP 의 acquire 는 매번 새 SealClient·SessionKey 를 쓴다. |
| 폐기한 단계를 구독자가 여전히 열 수 있지 않나 | 열 수 있다. 폐기는 "더는 권하지 않음" 표식이지 회수가 아니다, `seal_approve` 는 열쇠 ID(pack ‖ nonce)만 보고 blob_id 를 모르므로 폐기를 검사하지 않는다(Move 테스트 `retracted_blob_key_still_approves_for_valid_subscriber` 로 명시). 구매자 도구가 `is_retracted` 로 걸러 준다. |
| 에이전트가 사용자 확인 없이 결제하나 | `market_acquire` 는 유효한 구독이 없으면 그 자리에서 결제한다. 데모 템플릿은 `mcp__memory-market__*` 를 allow 해 두었고 `/improve` 가 "0.5 SUI 안에서 알아서 사라" 고 명시한다. 상한은 서버 프로세스당 `MARKET_SPEND_CAP_SUI`(기본 0.5), 자세한 규칙은 `plugin/README.md` 의 "결제·안전 규칙". |
| 판매자가 가짜 단계를 올리면 | 단계는 `prev_hash → record_hash` 체인이라 사후 수정이 드러난다. 전·후 스크린샷 sha 가 manifest 에 공개돼 구매 전 대조할 수 있고, 영수증 수·폐기 수가 팩에 남는다. **다만 처음부터 지어낸 것을 올리는 건 못 막는다**, README "솔직한 한계" 에 적어 두었다. |
| 왜 Sui 인가 | 구독권이 **소유 객체**라 `seal_approve` 가 sender 소유를 자연스럽게 검증하고, `Clock` 으로 만료를 온체인 판정하며, Seal 정책 함수와 Walrus 가 같은 생태계에 있다. 프로토콜 수정 없이 앱 층만으로 됐다. |
| 팔 사람이 있나 | 코딩 에이전트로 매일 디자인·개발을 반복하는 사람 전부. 판매자가 **따로 쓰는 것이 없다**, 평소처럼 고치면 훅이 기록한다. |
| 지금 시장에 팩이 몇 개 있나 | testnet 에 **넷**. 디자인 과정 팩 셋, Paylane 5단계(스크린샷 있음), AI가 뱉은 랜딩 10단계(스크린샷 있음), 한국어 카피 8단계(스크린샷 없음), 과 Sui 기억 팩(30건·텍스트). ttl 5분 미만인 e2e 테스트 팩은 목록에서 자동으로 빠지고, 이름과 개수가 어긋난 팩 하나는 우리가 기간을 내려 내렸다. 넷의 모양이 다 달라서 도구가 한 형태에만 맞춰져 있지 않다는 증거가 된다. |

## 부록: Sui 기억 팩 (150초 폐기 장면에서 사용)

이 프로젝트를 만들며 쌓인 Sui/Seal/Walrus 삽질 기록([dev-memories.md](dev-memories.md))이 `npm run sync` 로 평문 텍스트 기억
(항목당 블롭 1개, 랜덤 nonce)으로 `0x66c6eefe159f9f74ee3d137778561d7235fbf32a59338b33ea82b3eb8766fa7a` 에 올라가 있다
(`.env` 의 `MARKET_PACK_ID` 와 같은 값).
`mm retract --pack $SUIMEM --step N` 은 이 팩에서 체인 등록 순서 N번째 블롭(= `mm recall` 출력의 번호)을 폐기한다.
`@mysten/sui 1.x` 시절 항목(예: "signAndExecuteTransaction 이 sender 를 안 채운다")은 2.x 에서는 틀린 답이라 폐기 대상으로 딱 맞는다.
텍스트 팩 시나리오("같은 질문에 구독 전엔 일반론, 구독 후엔 삽질 기록")도 이 팩으로 재현할 수 있다:
`market_recall` 에 `Session key has expired` 를 넘기면 시계 오차 항목이 나온다.
