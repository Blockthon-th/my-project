# memory_market (Move)

기록을 기간제로 파는 시장 컨트랙트. Seal 이 공개한 예제 `subscription.move` 의 패턴을 따랐다 (우리 저장소 파일이 아니라 Seal 쪽 파일이다).

## 객체
| 객체 | 종류 | 역할 |
|---|---|---|
| `MemoryPack` | shared | 판매자 팩. 가격·기간·출처 이력. 블롭 ID·영수증·폐기 기록을 dynamic field로 보관 |
| `PackCap` | owned (판매자) | 팩 관리 권한 (publish / add_preview / set_terms / retract) |
| `Subscription` | owned (구독자) | 결제 후 발행. `expires_at_ms` 지나면 Seal 승인 무효. `leave_receipt` 의 증표 |

세 객체의 레이아웃은 v1 배포 이후 바뀌지 않았다 (업그레이드 호환). 신규 기능은 전부 팩 UID 아래 dynamic field 로 붙는다.

### 팩 UID 아래 dynamic field
| 키 | 값 | 쓰는 함수 | 의미 |
|---|---|---|---|
| `String` (blob_id) | `u64` MARKER | `publish` | 등록된 암호화 기억 블롭 |
| `ReceiptKey { subscription_id: ID }` | `Receipt { subscriber, outcome: u8, evidence_blob_id: String, at_ms }` | `leave_receipt` | 구독자가 팩 지식을 적용한 결과. 구독권당 1개 |
| `RetractKey { blob_id: String }` | `Retraction { reason: u8, at_ms }` | `retract` | 판매자가 폐기한 블롭. 블롭당 1개. 블롭 등록과 `memory_count` 는 그대로 남긴다 (이력 보존, 제외는 구매자 측 recall 이 한다) |

- `outcome`: `0` unresolved · `1` partial · `2` resolved
- `reason`: `1` model-changed · `2` wrong · `3` sdk-changed

## 흐름
1. 판매자 `create_pack_entry(name, desc, fee, ttl_ms, source_namespace, agent_label, 0x6)` → `PackCap`
2. sync 스크립트: 기억을 Seal로 암호화(열쇠 ID = pack id ‖ nonce) → Walrus 업로드 → `publish(pack, cap, blob_id, memory_at_ms)`
   - 디자인 단계 기록(`mm.step/1`)은 nonce = u16 big-endian step 번호(2바이트). 단계 1개 = 블롭 1개 = publish 1회
3. 구독자 `subscribe_entry(pack, coin<SUI> == fee, 0x6)` → `Subscription` (수수료는 판매자에게 즉시 전송)
4. Seal 키 서버가 `seal_approve(id, sub, pack, 0x6)` 시뮬레이션 → 구독 유효하면 열쇠 발급
5. 구독자 `leave_receipt(pack, sub, outcome, evidence_blob_id, 0x6)` → `ReceiptKey → Receipt` + `ReceiptLeft` 이벤트. 구독권당 1회. **만료 여부는 검사하지 않는다** (구독 중 받은 지식의 결과는 만료 뒤에 나올 수 있다)
6. 판매자 `retract(pack, cap, blob_id, reason, 0x6)` → `RetractKey → Retraction` + `Retracted` 이벤트. 이후 recall 은 이 블롭을 제외한다

`0x6` = Sui 시스템 Clock 객체.

## 진입점 시그니처
```move
public fun create_pack(name, description, fee, ttl_ms, source_namespace, agent_label, c: &Clock, ctx): PackCap
entry  fun create_pack_entry(...같음..., c: &Clock, ctx)
public fun publish(pack: &mut MemoryPack, cap: &PackCap, blob_id: String, memory_at_ms: u64)
public fun add_preview(pack: &mut MemoryPack, cap: &PackCap, blob_id: String)
public fun set_terms(pack: &mut MemoryPack, cap: &PackCap, fee: u64, ttl_ms: u64)
entry  fun retract(pack: &mut MemoryPack, cap: &PackCap, blob_id: String, reason: u8, c: &Clock)
public fun subscribe(pack: &mut MemoryPack, fee: Coin<SUI>, c: &Clock, ctx): Subscription
entry  fun subscribe_entry(pack: &mut MemoryPack, fee: Coin<SUI>, c: &Clock, ctx)
entry  fun leave_receipt(pack: &mut MemoryPack, sub: &Subscription, outcome: u8, evidence_blob_id: String, c: &Clock, ctx: &TxContext)
entry  fun seal_approve(id: vector<u8>, sub: &Subscription, pack: &MemoryPack, c: &Clock)
entry  fun seal_approve_owner(id: vector<u8>, cap: &PackCap, pack: &MemoryPack)
```

## 뷰 (devInspect 용)
| 함수 | 반환 |
|---|---|
| `is_active(sub, c)` | bool |
| `pack_id_of(sub)` / `expires_at_ms(sub)` | ID / u64 |
| `fee(pack)` / `ttl_ms(pack)` / `owner(pack)` / `memory_count(pack)` / `subscriber_count(pack)` | u64 / u64 / address / u64 / u64 |
| `has_blob(pack, blob_id)` | bool |
| `namespace(pack)` | vector<u8> — Seal 열쇠 ID 접두사 |
| `has_receipt(pack, subscription_id)` | bool |
| `receipt(pack, subscription_id)` | (address, u8, String, u64) = (subscriber, outcome, evidence_blob_id, at_ms). 없으면 abort |
| `is_retracted(pack, blob_id)` | bool (등록되지 않은 블롭도 false) |
| `retraction(pack, blob_id)` | (u8, u64) = (reason, at_ms). 없으면 abort |

## 이벤트
| 이벤트 | 필드 |
|---|---|
| `PackCreated` | pack_id, owner, name, fee, ttl_ms |
| `MemoryPublished` | pack_id, blob_id, memory_count |
| `Subscribed` | pack_id, subscription_id, subscriber, expires_at_ms |
| `ReceiptLeft` | pack_id, subscription_id, subscriber, outcome, evidence_blob_id |
| `Retracted` | pack_id, blob_id, reason |

## 에러 코드
| 코드 | 이름 | 언제 |
|---|---|---|
| 0 | `EInvalidCap` | cap.pack_id ≠ pack (publish / add_preview / set_terms / retract / seal_approve_owner) |
| 1 | `EInvalidFee` | subscribe: 코인 금액 ≠ pack.fee |
| 2 | `ENoAccess` | seal_approve: 다른 팩 열쇠 ID, 다른 팩 구독권, 만료된 구독권 |
| 3 | `EBlobAlreadyPublished` | publish: 같은 blob_id 재등록 |
| 4 | `EInvalidSubscription` | leave_receipt: sub.pack_id ≠ pack |
| 5 | `EReceiptExists` | leave_receipt: 같은 구독권으로 두 번째 영수증 |
| 6 | `EInvalidOutcome` | leave_receipt: outcome ∉ {0,1,2} |
| 7 | `ENoSuchBlob` | retract: 등록되지 않은 blob_id |
| 8 | `EAlreadyRetracted` | retract: 이미 폐기된 blob_id |
| 9 | `EInvalidReason` | retract: reason ∉ {1,2,3} |

## 명령
```sh
sui move build
sui move test
# 최초 배포 (sui client가 testnet + 가스 보유 상태여야 함)
sui client publish --gas-budget 100000000
# 이후 변경분 반영: 업그레이드 (UpgradeCap 은 Published.toml 의 upgrade-capability)
sui client upgrade --upgrade-capability 0x671e4b87dae28ecdbf25a94bdd96f00b5889a6b473336c1b272b221d5a245cd2 --gas-budget 200000000
```
현재 배포(2026-09-07, testnet): 패키지 `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196` (v1 `0x9202…` 의 UpgradeCap 소유 키가 없어 판매자 지갑 `0xb31c…` 로 **새로 publish** 했다. 옛 패키지의 팩은 새 패키지에서 보이지 않으므로 Sui 기억 팩은 `npm run sync` 로 다시 만들었다). UpgradeCap `0x671e…` 은 판매자 지갑 소유 — 다음부터는 위 `upgrade` 명령으로 올릴 수 있다.
업그레이드 뒤 `Published.toml` 의 `published-at` 만 새 주소로 바뀌고 `original-id` 는 유지된다. 스크립트에서 두 주소를 구분해서 써야 한다:
- **Seal identity / 객체 타입 문자열** (`…::market::MemoryPack`, `…::market::Subscription`): `original-id` 그대로. 키 서버는 항상 최신 버전의 `seal_approve` 를 실행한다.
- **새 함수 호출** (`leave_receipt`, `retract`, `has_receipt`, `is_retracted` …): 반드시 새 `published-at` 주소로. 옛 주소로 부르면 함수가 없어 실패한다. 기존 함수도 새 주소로 부르는 편이 단순하다.

## 테스트 (17개)
| 영역 | 테스트 | 기대 |
|---|---|---|
| 팩 | `seller_creates_pack_and_publishes` | publish 2회 + add_preview, memory_count·has_blob |
| 팩 | `publish_same_blob_twice_fails` | `EBlobAlreadyPublished` |
| 구독/Seal | `subscribe_pays_seller_and_seal_approves_until_expiry` | 결제 전송, 만료 전·직전 승인, 만료 후 `is_active` false |
| 구독/Seal | `seal_approve_fails_after_expiry` | `ENoAccess` |
| 구독/Seal | `seal_approve_fails_for_other_pack_key` | `ENoAccess` |
| 구독/Seal | `subscribe_with_wrong_fee_fails` | `EInvalidFee` |
| 구독/Seal | `owner_can_always_approve` | 판매자 `seal_approve_owner` 통과 |
| 영수증 | `subscriber_leaves_receipt` | `has_receipt` true, 저장 필드 4개, `ReceiptLeft` 1건 |
| 영수증 | `second_receipt_for_same_subscription_fails` | `EReceiptExists` |
| 영수증 | `receipt_with_other_packs_subscription_fails` | `EInvalidSubscription` |
| 영수증 | `receipt_with_invalid_outcome_fails` | `EInvalidOutcome` (outcome 3) |
| 영수증 | `receipt_allowed_after_subscription_expiry` | 만료 뒤에도 영수증 성공 |
| 폐기 | `seller_retracts_blob` | `is_retracted` true, 다른 블롭 false, `has_blob`·`memory_count` 유지, `Retracted` 1건 |
| 폐기 | `retract_unknown_blob_fails` | `ENoSuchBlob` |
| 폐기 | `retract_twice_fails` | `EAlreadyRetracted` |
| 폐기 | `retract_with_other_packs_cap_fails` | `EInvalidCap` |
| 폐기 | `retract_with_invalid_reason_fails` | `EInvalidReason` (reason 0) |
