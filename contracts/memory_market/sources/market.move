/// Memory Market, 에이전트 기억 팩 구독 시장.
///
/// 구조 (Seal 공식 subscription 패턴 기반):
/// - `MemoryPack`   : 판매자가 공개한 기억 팩. 공유 객체. 블롭 ID를 dynamic field로 등록.
/// - `PackCap`      : 팩 관리 권한 (판매자 소유).
/// - `Subscription` : 결제 후 구독자에게 발행. `expires_at_ms` 지나면 무효.
///
/// 팩(MemoryPack) UID 아래 dynamic field 로 붙는 기록:
/// - `String(blob_id) → MARKER`            : 등록된 암호화 기억 블롭 (publish)
/// - `ReceiptKey{subscription_id} → Receipt` : 구독자가 남긴 적용 결과 영수증 (leave_receipt, 구독당 1개)
/// - `RetractKey{blob_id} → Retraction`      : 판매자가 폐기한 블롭 (retract, 블롭당 1개)
///
/// Seal 열쇠 ID 규약: [pkg id]::[pack id][nonce]
///   → 팩 ID를 접두사로 갖는 모든 열쇠 ID는 이 팩의 `seal_approve`로 판단된다.
///   sync 스크립트는 팩 ID + 랜덤 nonce 로 각 블롭을 암호화한다.
///   디자인 단계 기록(mm.step/1)은 nonce = u16 big-endian step 번호(2바이트).
module memory_market::market;

use std::string::String;
use sui::{clock::Clock, coin::Coin, dynamic_field as df, event, sui::SUI};
use memory_market::utils::is_prefix;

// ───────────────────────── errors ─────────────────────────
const EInvalidCap: u64 = 0;
const EInvalidFee: u64 = 1;
const ENoAccess: u64 = 2;
const EBlobAlreadyPublished: u64 = 3;
/// 구독권이 이 팩의 것이 아님
const EInvalidSubscription: u64 = 4;
/// 이 구독권으로 이미 영수증을 남김
const EReceiptExists: u64 = 5;
/// outcome 이 {0,1,2} 밖
const EInvalidOutcome: u64 = 6;
/// 팩에 등록되지 않은 블롭
const ENoSuchBlob: u64 = 7;
/// 이미 폐기된 블롭
const EAlreadyRetracted: u64 = 8;
/// reason 이 {1,2,3} 밖
const EInvalidReason: u64 = 9;

const MARKER: u64 = 1;

/// 영수증 결과: 0 unresolved · 1 partial · 2 resolved
const OUTCOME_MAX: u8 = 2;
/// 폐기 사유: 1 model-changed · 2 wrong · 3 sdk-changed
const REASON_MIN: u8 = 1;
const REASON_MAX: u8 = 3;

// ───────────────────────── objects ─────────────────────────

/// 판매자가 공개한 기억 팩.
public struct MemoryPack has key {
    id: UID,
    owner: address,
    name: String,
    description: String,
    /// 구독료 (MIST 단위, 1 SUI = 1_000_000_000 MIST)
    fee: u64,
    /// 구독 유효 기간 (ms)
    ttl_ms: u64,
    // ── 출처 이력 (provenance) ──
    /// 원천 MemWal 네임스페이스 (예: "sui-dev")
    source_namespace: String,
    /// 기억을 만든 에이전트 라벨 (예: "claude-code")
    agent_label: String,
    /// 팩 생성 시각
    created_at_ms: u64,
    /// 등록된 암호화 기억 조각 수
    memory_count: u64,
    /// 등록된 기억 중 가장 오래된 / 최신 원본 생성 시각
    first_memory_at_ms: u64,
    last_memory_at_ms: u64,
    /// 누적 구독 수
    subscriber_count: u64,
    /// 무료 미리보기 블롭 (암호화 안 함)
    preview_blob_ids: vector<String>,
}

/// 팩 관리 권한.
public struct PackCap has key, store {
    id: UID,
    pack_id: ID,
}

/// 구독권. 소유자 = 구독자.
public struct Subscription has key, store {
    id: UID,
    pack_id: ID,
    subscriber: address,
    created_at_ms: u64,
    expires_at_ms: u64,
}

// ───────────────────────── dynamic field records ─────────────────────────
// (팩 UID 아래에 붙는다. 기존 객체 레이아웃은 건드리지 않으므로 업그레이드 호환.)

/// 영수증 키: 구독권 1개당 영수증 1개.
public struct ReceiptKey has copy, drop, store { subscription_id: ID }

/// 구독자가 팩 지식을 적용한 결과. `evidence_blob_id` 는 Walrus 에 평문으로 올린 검사 결과.
public struct Receipt has store {
    subscriber: address,
    /// 0 unresolved · 1 partial · 2 resolved
    outcome: u8,
    evidence_blob_id: String,
    at_ms: u64,
}

/// 폐기 키: 블롭 1개당 폐기 기록 1개.
public struct RetractKey has copy, drop, store { blob_id: String }

/// 판매자가 블롭을 폐기한 기록. 블롭 등록(dynamic field) 자체는 남겨 이력을 보존한다.
public struct Retraction has store {
    /// 1 model-changed · 2 wrong · 3 sdk-changed
    reason: u8,
    at_ms: u64,
}

// ───────────────────────── events ─────────────────────────

public struct PackCreated has copy, drop {
    pack_id: ID,
    owner: address,
    name: String,
    fee: u64,
    ttl_ms: u64,
}

public struct MemoryPublished has copy, drop {
    pack_id: ID,
    blob_id: String,
    memory_count: u64,
}

public struct Subscribed has copy, drop {
    pack_id: ID,
    subscription_id: ID,
    subscriber: address,
    expires_at_ms: u64,
}

public struct ReceiptLeft has copy, drop {
    pack_id: ID,
    subscription_id: ID,
    subscriber: address,
    outcome: u8,
    evidence_blob_id: String,
}

public struct Retracted has copy, drop {
    pack_id: ID,
    blob_id: String,
    reason: u8,
}

// ───────────────────────── seller ─────────────────────────

/// 팩 생성. 팩은 공유 객체가 되고, 관리 권한(PackCap)을 돌려준다.
public fun create_pack(
    name: String,
    description: String,
    fee: u64,
    ttl_ms: u64,
    source_namespace: String,
    agent_label: String,
    c: &Clock,
    ctx: &mut TxContext,
): PackCap {
    let now = c.timestamp_ms();
    let pack = MemoryPack {
        id: object::new(ctx),
        owner: ctx.sender(),
        name,
        description,
        fee,
        ttl_ms,
        source_namespace,
        agent_label,
        created_at_ms: now,
        memory_count: 0,
        first_memory_at_ms: 0,
        last_memory_at_ms: 0,
        subscriber_count: 0,
        preview_blob_ids: vector[],
    };
    let pack_id = object::id(&pack);
    let cap = PackCap { id: object::new(ctx), pack_id };
    event::emit(PackCreated { pack_id, owner: ctx.sender(), name: pack.name, fee, ttl_ms });
    transfer::share_object(pack);
    cap
}

/// CLI/PTB 편의용: 생성 후 Cap을 호출자에게 전송.
entry fun create_pack_entry(
    name: String,
    description: String,
    fee: u64,
    ttl_ms: u64,
    source_namespace: String,
    agent_label: String,
    c: &Clock,
    ctx: &mut TxContext,
) {
    let cap = create_pack(name, description, fee, ttl_ms, source_namespace, agent_label, c, ctx);
    transfer::transfer(cap, ctx.sender());
}

/// 암호화된 기억 블롭을 팩에 등록. `memory_at_ms`는 원본 기억의 생성 시각(출처 이력용).
public fun publish(pack: &mut MemoryPack, cap: &PackCap, blob_id: String, memory_at_ms: u64) {
    assert!(cap.pack_id == object::id(pack), EInvalidCap);
    assert!(!df::exists(&pack.id, blob_id), EBlobAlreadyPublished);
    df::add(&mut pack.id, blob_id, MARKER);
    pack.memory_count = pack.memory_count + 1;
    if (pack.first_memory_at_ms == 0 || memory_at_ms < pack.first_memory_at_ms) {
        pack.first_memory_at_ms = memory_at_ms;
    };
    if (memory_at_ms > pack.last_memory_at_ms) {
        pack.last_memory_at_ms = memory_at_ms;
    };
    event::emit(MemoryPublished { pack_id: object::id(pack), blob_id, memory_count: pack.memory_count });
}

/// 무료 미리보기 블롭(평문) 등록.
public fun add_preview(pack: &mut MemoryPack, cap: &PackCap, blob_id: String) {
    assert!(cap.pack_id == object::id(pack), EInvalidCap);
    pack.preview_blob_ids.push_back(blob_id);
}

/// 구독료·기간 변경.
public fun set_terms(pack: &mut MemoryPack, cap: &PackCap, fee: u64, ttl_ms: u64) {
    assert!(cap.pack_id == object::id(pack), EInvalidCap);
    pack.fee = fee;
    pack.ttl_ms = ttl_ms;
}

/// 등록된 블롭을 폐기한다 (모델·SDK 변경, 잘못된 지식 등).
/// 블롭 등록은 그대로 두고 `RetractKey → Retraction` 을 덧붙인다. 구매자 측(recall)은 폐기분을 제외한다.
///
/// **한계 (의도된 것):** `seal_approve` 는 폐기를 검사하지 않는다. Seal 열쇠 ID(pack ‖ nonce)만으로는
/// 어느 blob_id 인지 알 수 없고, 폐기는 "더는 권하지 않음" 의 표식이지 회수가 아니다.
/// 따라서 유효한 구독자가 열쇠 ID 를 직접 대면 폐기된 블롭도 여전히 복호화된다.
/// 구매자 도구(mm recall / market_acquire)가 `is_retracted` 를 보고 걸러 준다.
/// reason: 1 model-changed · 2 wrong · 3 sdk-changed
entry fun retract(pack: &mut MemoryPack, cap: &PackCap, blob_id: String, reason: u8, c: &Clock) {
    assert!(cap.pack_id == object::id(pack), EInvalidCap);
    assert!(df::exists(&pack.id, blob_id), ENoSuchBlob);
    assert!(!df::exists(&pack.id, RetractKey { blob_id }), EAlreadyRetracted);
    assert!(reason >= REASON_MIN && reason <= REASON_MAX, EInvalidReason);
    df::add(&mut pack.id, RetractKey { blob_id }, Retraction { reason, at_ms: c.timestamp_ms() });
    event::emit(Retracted { pack_id: object::id(pack), blob_id, reason });
}

// ───────────────────────── subscriber ─────────────────────────

/// 구독. 정확히 `pack.fee` 만큼의 SUI를 내면 구독권을 돌려준다. 수수료는 판매자에게 즉시 전송.
public fun subscribe(
    pack: &mut MemoryPack,
    fee: Coin<SUI>,
    c: &Clock,
    ctx: &mut TxContext,
): Subscription {
    assert!(fee.value() == pack.fee, EInvalidFee);
    transfer::public_transfer(fee, pack.owner);
    let now = c.timestamp_ms();
    let sub = Subscription {
        id: object::new(ctx),
        pack_id: object::id(pack),
        subscriber: ctx.sender(),
        created_at_ms: now,
        expires_at_ms: now + pack.ttl_ms,
    };
    pack.subscriber_count = pack.subscriber_count + 1;
    event::emit(Subscribed {
        pack_id: object::id(pack),
        subscription_id: object::id(&sub),
        subscriber: ctx.sender(),
        expires_at_ms: sub.expires_at_ms,
    });
    sub
}

/// CLI/PTB 편의용: 구독 후 구독권을 호출자에게 전송.
entry fun subscribe_entry(pack: &mut MemoryPack, fee: Coin<SUI>, c: &Clock, ctx: &mut TxContext) {
    let sub = subscribe(pack, fee, c, ctx);
    transfer::transfer(sub, ctx.sender());
}

/// 구독자가 팩 지식을 적용한 결과 영수증을 남긴다. 구독권 1개당 1회.
/// 만료 여부는 검사하지 않는다, 구독 중 받은 지식의 결과는 만료 뒤에 나올 수 있다.
/// (구독권은 owned object 이고 이 함수는 `entry` 라 다른 모듈이 감싸서 부를 수 없다 →
///  PTB 입력으로 참조를 넘길 수 있는 건 현재 소유자뿐 → `Receipt.subscriber = ctx.sender()`.
///  구독권은 `store` 가 있어 양도될 수 있고, 그 경우 영수증의 subscriber 는 양수인이다.)
/// outcome: 0 unresolved · 1 partial · 2 resolved. `evidence_blob_id` 는 Walrus 평문 검사 결과.
entry fun leave_receipt(
    pack: &mut MemoryPack,
    sub: &Subscription,
    outcome: u8,
    evidence_blob_id: String,
    c: &Clock,
    ctx: &TxContext,
) {
    assert!(sub.pack_id == object::id(pack), EInvalidSubscription);
    let subscription_id = object::id(sub);
    assert!(!df::exists(&pack.id, ReceiptKey { subscription_id }), EReceiptExists);
    assert!(outcome <= OUTCOME_MAX, EInvalidOutcome);
    let subscriber = ctx.sender();
    df::add(
        &mut pack.id,
        ReceiptKey { subscription_id },
        Receipt { subscriber, outcome, evidence_blob_id, at_ms: c.timestamp_ms() },
    );
    event::emit(ReceiptLeft {
        pack_id: object::id(pack),
        subscription_id,
        subscriber,
        outcome,
        evidence_blob_id,
    });
}

// ───────────────────────── Seal access control ─────────────────────────

/// 열쇠 ID 규약: [pack id][nonce]. 팩 ID 접두사이면 이 팩의 열쇠.
fun approve_internal(id: vector<u8>, sub: &Subscription, pack: &MemoryPack, c: &Clock): bool {
    if (object::id(pack) != sub.pack_id) {
        return false
    };
    if (c.timestamp_ms() > sub.expires_at_ms) {
        return false
    };
    is_prefix(pack.id.to_bytes(), id)
}

/// Seal 키 서버가 호출. 유효한 구독권을 가진 호출자만 통과.
/// (구독권은 owned object이므로, 트랜잭션 sender가 소유자여야 참조를 넘길 수 있다.)
entry fun seal_approve(id: vector<u8>, sub: &Subscription, pack: &MemoryPack, c: &Clock) {
    assert!(approve_internal(id, sub, pack, c), ENoAccess);
}

/// 판매자 본인은 언제나 열 수 있다 (팩 점검·복구용).
entry fun seal_approve_owner(id: vector<u8>, cap: &PackCap, pack: &MemoryPack) {
    assert!(cap.pack_id == object::id(pack), EInvalidCap);
    assert!(is_prefix(pack.id.to_bytes(), id), ENoAccess);
}

// ───────────────────────── views ─────────────────────────

public fun is_active(sub: &Subscription, c: &Clock): bool {
    c.timestamp_ms() <= sub.expires_at_ms
}

public fun pack_id_of(sub: &Subscription): ID { sub.pack_id }
public fun expires_at_ms(sub: &Subscription): u64 { sub.expires_at_ms }
public fun fee(pack: &MemoryPack): u64 { pack.fee }
public fun ttl_ms(pack: &MemoryPack): u64 { pack.ttl_ms }
public fun owner(pack: &MemoryPack): address { pack.owner }
public fun memory_count(pack: &MemoryPack): u64 { pack.memory_count }
public fun subscriber_count(pack: &MemoryPack): u64 { pack.subscriber_count }
public fun has_blob(pack: &MemoryPack, blob_id: String): bool { df::exists(&pack.id, blob_id) }
/// 팩 ID 바이트 = Seal 열쇠 ID 접두사.
public fun namespace(pack: &MemoryPack): vector<u8> { pack.id.to_bytes() }

/// 이 구독권으로 영수증을 남겼는지.
public fun has_receipt(pack: &MemoryPack, subscription_id: ID): bool {
    df::exists(&pack.id, ReceiptKey { subscription_id })
}

/// 영수증 내용 (subscriber, outcome, evidence_blob_id, at_ms). 없으면 abort.
public fun receipt(pack: &MemoryPack, subscription_id: ID): (address, u8, String, u64) {
    let r: &Receipt = df::borrow(&pack.id, ReceiptKey { subscription_id });
    (r.subscriber, r.outcome, r.evidence_blob_id, r.at_ms)
}

/// 블롭이 폐기됐는지. (등록되지 않은 블롭도 false)
public fun is_retracted(pack: &MemoryPack, blob_id: String): bool {
    df::exists(&pack.id, RetractKey { blob_id })
}

/// 폐기 내용 (reason, at_ms). 없으면 abort.
public fun retraction(pack: &MemoryPack, blob_id: String): (u8, u64) {
    let r: &Retraction = df::borrow(&pack.id, RetractKey { blob_id });
    (r.reason, r.at_ms)
}

// ───────────────────────── test helpers ─────────────────────────

#[test_only]
public fun destroy_for_testing(pack: MemoryPack, cap: PackCap, sub: Subscription) {
    let MemoryPack { id, .. } = pack;
    object::delete(id);
    let PackCap { id, .. } = cap;
    object::delete(id);
    let Subscription { id, .. } = sub;
    object::delete(id);
}
