# memory_market (Move)

기억 팩 구독 시장 컨트랙트. Seal 공식 `subscription.move` 패턴 기반.

## 객체
| 객체 | 종류 | 역할 |
|---|---|---|
| `MemoryPack` | shared | 판매자 팩. 가격·기간·출처 이력. 블롭 ID를 dynamic field로 등록 |
| `PackCap` | owned (판매자) | 팩 관리 권한 (publish / add_preview / set_terms) |
| `Subscription` | owned (구독자) | 결제 후 발행. `expires_at_ms` 지나면 무효 |

## 흐름
1. 판매자 `create_pack_entry(name, desc, fee, ttl_ms, source_namespace, agent_label, 0x6)` → `PackCap`
2. sync 스크립트: 기억을 Seal로 암호화(열쇠 ID = pack id ‖ nonce) → Walrus 업로드 → `publish(pack, cap, blob_id, memory_at_ms)`
3. 구독자 `subscribe_entry(pack, coin<SUI> == fee, 0x6)` → `Subscription` (수수료는 판매자에게 즉시 전송)
4. Seal 키 서버가 `seal_approve(id, sub, pack, 0x6)` 시뮬레이션 → 구독 유효하면 열쇠 발급

`0x6` = Sui 시스템 Clock 객체.

## 명령
```sh
sui move build
sui move test
# testnet 배포 (sui client가 testnet + 가스 보유 상태여야 함)
sui client publish --gas-budget 100000000
```
배포 후 출력의 `PackageID`를 루트 `.env`의 `MARKET_PACKAGE_ID`에 기록.

## 테스트 (7개)
팩 생성·publish, 중복 publish 거부, 구독→결제→만료 전/직전 승인·만료 후 거부, 다른 팩 열쇠 거부, 잘못된 수수료 거부, 판매자 자체 승인.
