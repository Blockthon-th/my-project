# Memory Market — 기획서 (Blockthon 2026)

> 전문가 에이전트의 **살아 있는 기억**을 필요한 기간만 구독하는 시장.
> Sui · Walrus · Seal · MemWal 위에 얹는 앱 층 프로젝트. 프로토콜 수정 없음.

## 1. 문제

AI 코딩 에이전트는 사용자와 함께 일하며 기억(교과서에 없는 실무 경험)을 쌓는다.
그러나 그 기억은 한 사람의 계정에 갇혀 있다.

- **Sui 개발자 온보딩이 어렵다.** Move, Walrus, Seal, MemWal은 문서만으로 익히기 힘들고,
  먼저 겪은 사람의 "삽질 기록"(무엇을 시도했고 왜 실패했는지)은 어디에도 공유되지 않는다.
- **MemWal의 공유 장치(델리게이트)는 친구용이다.** 소유자가 상대 키를 직접 온체인에 등록해야 하고,
  등록되면 계정 전체가 열리며, 최대 20명, 결제·만료 개념이 없다. 시장이 될 수 없다.
- **기억은 상하는 재료다.** SDK 버전이 바뀌면 옛 기억은 틀린 답이 된다. 사본을 사는 것보다
  전문가가 지금도 쌓고 있는 기억에 접근하는 것이 가치 있다.

## 2. 해결 — 기억 팩 구독

판매자는 자신의 MemWal 네임스페이스 하나를 **기억 팩**으로 공개한다.
구독자는 SUI로 결제하고, 기간 동안 자기 에이전트에서 그 팩을 검색(recall)해 쓴다.
만료되면 Seal이 열쇠를 내주지 않아 자동으로 끊긴다. 평문 사본은 넘어가지 않는다.

**공유 vs 구독 (차별점 한 줄)**
| | MemWal 델리게이트 | Memory Market |
|---|---|---|
| 범위 | 계정 전체 | 팩(네임스페이스) 하나 |
| 상대 | 소유자가 직접 등록, ≤20명 | 누구나, 제한 없음 |
| 돈 | 없음 | SUI 결제, 판매자에게 즉시 전송 |
| 만료 | 소유자가 손으로 회수 | 온체인 시각 기준 자동 |
| 검증 | 데이터 무변조·소유권 | + 출처 이력(생성 에이전트, 기간, 조각 수) |

근거: MemWal 문서(`ownership-and-access.md`)는 "memory marketplace"를 미래 기능으로 한 문장 언급만 하고 있고,
컨트랙트(`account.move`)는 소유자당 Seal 열쇠 1개 구조라 팩 단위 접근 제어가 불가능하다.
arXiv 2605.11032("Portable Agent Memory")도 memory marketplace를 future work로 남겼다.

## 3. 구조 (전부 앱 층)

```
판매자 Claude Code ──(MemWal 플러그인)──▶ MemWal 릴레이어 ──▶ Walrus (판매자 열쇠로 잠김)
                                              │
                        sync 스크립트 ◀───────┘  read API (/v1/owners/:owner/memories)
                             │  개인정보 필터 → 우리 팩 열쇠(Seal)로 재암호화
                             ▼
                        Walrus (팩 열쇠로 잠김)  +  Sui: MemoryPack 객체(blob ids, 가격, ttl, 출처 이력)

구독자 Claude Code ──(market_recall MCP)──▶ 우리 서비스 ──▶ Seal: seal_approve(구독 유효?) ──▶ 복호화·검색·반환
                                                              Sui: Subscription 객체(pack_id, created_at)
```

구성 요소 4개
1. **Move 패키지** `memory_market` — `MemoryPack`(공유 객체), `subscribe`(결제→Subscription 발행), `seal_approve`(구독·만료 확인), `publish`(블롭 등록). Seal 공식 `subscription.move` 패턴 기반.
2. **sync 스크립트** (TS) — 판매자 기억 export → 개인정보 필터(LLM) → Seal 암호화 → Walrus 업로드 → `publish`. 주기 실행으로 팩이 "살아 있음".
3. **market MCP 서버** (TS) — `market_list`, `market_subscribe`, `market_recall(pack, query)`. 구독자 에이전트가 직접 호출.
4. **목록 웹** (Next.js, 선택: Walrus Sites 배포) — 팩 목록, 미리보기, 출처 이력, 구독 버튼.

신뢰 모델: sync/MCP 서버는 평문을 잠시 본다. MemWal 공식 릴레이어와 동일한 가정. 향후 TEE.

## 4. 데모 시나리오 (3분)

1. 판매자 = 이 프로젝트를 만든 2주간의 Claude Code 기억(`--namespace sui-dev`). 출처 이력이 진짜.
2. 구독자 = Sui 계정을 방금 만든 개발자의 Claude Code.
3. 같은 질문 "Seal 복호화가 안 되는데 왜지?" — 구독 전: 일반론. 구독 후: "이전 소유자가 같은 지점에서 이틀 헤맸다, 원인은 X".
4. 판매자가 새 기억을 저장 → sync → 구독자 에이전트가 바로 반영 (**살아 있음**).
5. 구독 만료(ttl 짧게 설정) → `market_recall` 빈손 (**회수됨**).

## 5. 심사 기준 대응

- 기술 완성도 30%: 4개 구성 요소 중 1·2·3이 통하면 데모 성립. 4는 선택.
- Sui·Walrus 활용도 25%: Sui(객체·결제·Clock), Walrus(블롭), Seal(구독 정책), MemWal(원천·플러그인), Walrus Sites(선택).
- AI × Blockchain 25%: 블록체인이 없으면 불가능한 장면 — 자동 만료, 무허가 구독, 출처 이력.
- 문제 정의 20%: Sui 온보딩 난이도. 우리가 겪은 온보딩 고통이 곧 상품.

## 6. 범위 결정

- 개인정보 필터만 적용. 기밀·규제 필터는 향후 과제로 명시.
- 사본 판매(buyout) 없음. 구독만.
- 재판매 방지: 평문 미전달로 구조적으로 해결.

## 7. 일정 (9/3 ~ 9/14 온라인 예선, 혼자, Move 처음)

| 일 | 목표 |
|---|---|
| D1–2 | MemWal 플러그인 설치·기억 수집 시작. Move 패키지 작성·테스트·테스트넷 배포 |
| D3–4 | Seal 암호화→Walrus 업로드→구독→복호화 end-to-end 스크립트 |
| D5–6 | sync 스크립트(export·필터·재암호화·publish) |
| D7–8 | market MCP 서버(list/subscribe/recall), 구독자 Claude Code에 연결 |
| D9–10 | 목록 웹, 데모 리허설, 만료 시나리오 |
| D11–12 | 버퍼, README·발표 자료 |
