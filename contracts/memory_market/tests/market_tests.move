#[test_only]
module memory_market::market_tests;

use std::string;
use sui::{clock::{Self, Clock}, coin, event, sui::SUI, test_scenario as ts};
use memory_market::market::{Self, MemoryPack, PackCap, Subscription};

const SELLER: address = @0xA11CE;
const BUYER: address = @0xB0B;
const FEE: u64 = 1_000_000_000; // 1 SUI
const TTL: u64 = 7 * 24 * 60 * 60 * 1000; // 7일

fun new_pack(scn: &mut ts::Scenario, now_ms: u64): PackCap {
    let mut c = clock::create_for_testing(scn.ctx());
    c.set_for_testing(now_ms);
    let cap = market::create_pack(
        string::utf8(b"sui-dev 2w"),
        string::utf8(b"Sui/Walrus/Seal onboarding memory"),
        FEE,
        TTL,
        string::utf8(b"sui-dev"),
        string::utf8(b"claude-code"),
        &c,
        scn.ctx(),
    );
    c.destroy_for_testing();
    cap
}

/// 열쇠 ID = pack id bytes ‖ nonce
fun key_id(pack: &MemoryPack, nonce: u8): vector<u8> {
    let mut id = market::namespace(pack);
    id.push_back(nonce);
    id
}

/// `now_ms` 로 맞춘 테스트용 Clock. 호출자가 `destroy_for_testing()` 한다.
fun clock_at(scn: &mut ts::Scenario, now_ms: u64): Clock {
    let mut c = clock::create_for_testing(scn.ctx());
    c.set_for_testing(now_ms);
    c
}

/// 현재 tx 의 sender 가 `pack` 을 `now_ms` 시각에 정가로 구독.
fun buy(scn: &mut ts::Scenario, pack: &mut MemoryPack, now_ms: u64): Subscription {
    let c = clock_at(scn, now_ms);
    let fee = coin::mint_for_testing<SUI>(FEE, scn.ctx());
    let sub = market::subscribe(pack, fee, &c, scn.ctx());
    c.destroy_for_testing();
    sub
}

#[test]
fun seller_creates_pack_and_publishes() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);

    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    assert!(market::memory_count(&pack) == 0);
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    market::publish(&mut pack, &cap, string::utf8(b"blob-B"), 900);
    market::add_preview(&mut pack, &cap, string::utf8(b"blob-preview"));
    assert!(market::memory_count(&pack) == 2);
    assert!(market::has_blob(&pack, string::utf8(b"blob-A")));
    assert!(!market::has_blob(&pack, string::utf8(b"blob-Z")));
    ts::return_shared(pack);
    transfer::public_transfer(cap, SELLER);
    scn.end();
}

#[test, expected_failure(abort_code = market::EBlobAlreadyPublished)]
fun publish_same_blob_twice_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 600);
    abort 0
}

#[test]
fun subscribe_pays_seller_and_seal_approves_until_expiry() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    // 구매자가 구독
    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let mut c = clock::create_for_testing(scn.ctx());
    c.set_for_testing(10_000);
    let fee = coin::mint_for_testing<SUI>(FEE, scn.ctx());
    let sub = market::subscribe(&mut pack, fee, &c, scn.ctx());
    assert!(market::subscriber_count(&pack) == 1);
    assert!(market::expires_at_ms(&sub) == 10_000 + TTL);
    assert!(market::is_active(&sub, &c));

    // 유효 기간 안 → 통과
    market::seal_approve(key_id(&pack, 7), &sub, &pack, &c);

    // 만료 직전 → 통과
    c.set_for_testing(10_000 + TTL);
    market::seal_approve(key_id(&pack, 8), &sub, &pack, &c);
    assert!(market::is_active(&sub, &c));

    // 만료 후 → is_active false
    c.set_for_testing(10_000 + TTL + 1);
    assert!(!market::is_active(&sub, &c));

    transfer::public_transfer(sub, BUYER);
    ts::return_shared(pack);
    c.destroy_for_testing();

    // 판매자가 수수료를 받았는지
    scn.next_tx(SELLER);
    let paid = scn.take_from_sender<coin::Coin<SUI>>();
    assert!(paid.value() == FEE);
    scn.return_to_sender(paid);
    scn.end();
}

#[test, expected_failure(abort_code = market::ENoAccess)]
fun seal_approve_fails_after_expiry() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let mut c = clock::create_for_testing(scn.ctx());
    c.set_for_testing(10_000);
    let fee = coin::mint_for_testing<SUI>(FEE, scn.ctx());
    let sub = market::subscribe(&mut pack, fee, &c, scn.ctx());

    c.set_for_testing(10_000 + TTL + 1);
    market::seal_approve(key_id(&pack, 1), &sub, &pack, &c);
    abort 0
}

#[test, expected_failure(abort_code = market::ENoAccess)]
fun seal_approve_fails_for_other_pack_key() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let mut c = clock::create_for_testing(scn.ctx());
    c.set_for_testing(10_000);
    let fee = coin::mint_for_testing<SUI>(FEE, scn.ctx());
    let sub = market::subscribe(&mut pack, fee, &c, scn.ctx());

    // 다른 팩의 열쇠 ID (접두사 불일치)
    market::seal_approve(b"not-this-pack", &sub, &pack, &c);
    abort 0
}

#[test, expected_failure(abort_code = market::EInvalidFee)]
fun subscribe_with_wrong_fee_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let c = clock::create_for_testing(scn.ctx());
    let fee = coin::mint_for_testing<SUI>(FEE - 1, scn.ctx());
    let _sub = market::subscribe(&mut pack, fee, &c, scn.ctx());
    abort 0
}

#[test]
fun owner_can_always_approve() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let pack = scn.take_shared<MemoryPack>();
    market::seal_approve_owner(key_id(&pack, 3), &cap, &pack);
    ts::return_shared(pack);
    transfer::public_transfer(cap, SELLER);
    scn.end();
}

// ───────────────────────── receipts ─────────────────────────

#[test]
fun subscriber_leaves_receipt() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let sub = buy(&mut scn, &mut pack, 10_000);
    let sub_id = object::id(&sub);
    assert!(!market::has_receipt(&pack, sub_id));

    let c = clock_at(&mut scn, 20_000);
    market::leave_receipt(&mut pack, &sub, 2, string::utf8(b"evidence-blob"), &c, scn.ctx());
    assert!(market::has_receipt(&pack, sub_id));

    let (who, outcome, evidence, at_ms) = market::receipt(&pack, sub_id);
    assert!(who == BUYER);
    assert!(outcome == 2);
    assert!(evidence == string::utf8(b"evidence-blob"));
    assert!(at_ms == 20_000);
    assert!(event::events_by_type<market::ReceiptLeft>().length() == 1);

    c.destroy_for_testing();
    transfer::public_transfer(sub, BUYER);
    ts::return_shared(pack);
    scn.end();
}

#[test, expected_failure(abort_code = market::EReceiptExists)]
fun second_receipt_for_same_subscription_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let sub = buy(&mut scn, &mut pack, 10_000);
    let c = clock_at(&mut scn, 20_000);
    market::leave_receipt(&mut pack, &sub, 1, string::utf8(b"evidence-1"), &c, scn.ctx());
    // 같은 구독권으로 두 번째 → 거부 (outcome 을 바꿔도 마찬가지)
    market::leave_receipt(&mut pack, &sub, 2, string::utf8(b"evidence-2"), &c, scn.ctx());
    abort 0
}

#[test, expected_failure(abort_code = market::EInvalidSubscription)]
fun receipt_with_other_packs_subscription_fails() {
    let mut scn = ts::begin(SELLER);
    let cap1 = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap1, SELLER);

    // 팩 1 구독
    scn.next_tx(BUYER);
    let mut pack1 = scn.take_shared<MemoryPack>();
    let sub1 = buy(&mut scn, &mut pack1, 10_000);
    ts::return_shared(pack1);
    transfer::public_transfer(sub1, BUYER);

    // 팩 2 생성 (가장 최근 공유 객체가 된다)
    scn.next_tx(SELLER);
    let cap2 = new_pack(&mut scn, 2_000);
    transfer::public_transfer(cap2, SELLER);

    // 팩 1 구독권으로 팩 2 에 영수증 → 거부
    scn.next_tx(BUYER);
    let mut pack2 = scn.take_shared<MemoryPack>();
    let sub1 = scn.take_from_sender<Subscription>();
    assert!(market::pack_id_of(&sub1) != object::id(&pack2));
    let c = clock_at(&mut scn, 20_000);
    market::leave_receipt(&mut pack2, &sub1, 2, string::utf8(b"evidence"), &c, scn.ctx());
    abort 0
}

#[test, expected_failure(abort_code = market::EInvalidOutcome)]
fun receipt_with_invalid_outcome_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let sub = buy(&mut scn, &mut pack, 10_000);
    let c = clock_at(&mut scn, 20_000);
    // 허용 범위는 0/1/2
    market::leave_receipt(&mut pack, &sub, 3, string::utf8(b"evidence"), &c, scn.ctx());
    abort 0
}

#[test]
fun receipt_allowed_after_subscription_expiry() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    transfer::public_transfer(cap, SELLER);

    scn.next_tx(BUYER);
    let mut pack = scn.take_shared<MemoryPack>();
    let sub = buy(&mut scn, &mut pack, 10_000);

    // 만료 후: Seal 승인은 안 되지만 영수증은 남길 수 있다
    let c = clock_at(&mut scn, 10_000 + TTL + 1);
    assert!(!market::is_active(&sub, &c));
    market::leave_receipt(&mut pack, &sub, 0, string::utf8(b"evidence-late"), &c, scn.ctx());
    assert!(market::has_receipt(&pack, object::id(&sub)));
    let (_, outcome, _, at_ms) = market::receipt(&pack, object::id(&sub));
    assert!(outcome == 0);
    assert!(at_ms == 10_000 + TTL + 1);

    c.destroy_for_testing();
    transfer::public_transfer(sub, BUYER);
    ts::return_shared(pack);
    scn.end();
}

// ───────────────────────── retraction ─────────────────────────

#[test]
fun seller_retracts_blob() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);

    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    market::publish(&mut pack, &cap, string::utf8(b"blob-B"), 900);
    assert!(!market::is_retracted(&pack, string::utf8(b"blob-A")));

    let c = clock_at(&mut scn, 5_000);
    market::retract(&mut pack, &cap, string::utf8(b"blob-A"), 3, &c);
    assert!(market::is_retracted(&pack, string::utf8(b"blob-A")));
    assert!(!market::is_retracted(&pack, string::utf8(b"blob-B")));
    // 등록 자체와 카운트는 유지 (이력 보존) — 제외는 구매자 측에서 한다
    assert!(market::has_blob(&pack, string::utf8(b"blob-A")));
    assert!(market::memory_count(&pack) == 2);
    let (reason, at_ms) = market::retraction(&pack, string::utf8(b"blob-A"));
    assert!(reason == 3);
    assert!(at_ms == 5_000);
    assert!(event::events_by_type<market::Retracted>().length() == 1);

    c.destroy_for_testing();
    ts::return_shared(pack);
    transfer::public_transfer(cap, SELLER);
    scn.end();
}

#[test, expected_failure(abort_code = market::ENoSuchBlob)]
fun retract_unknown_blob_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    let c = clock_at(&mut scn, 5_000);
    market::retract(&mut pack, &cap, string::utf8(b"blob-Z"), 2, &c);
    abort 0
}

#[test, expected_failure(abort_code = market::EAlreadyRetracted)]
fun retract_twice_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    let c = clock_at(&mut scn, 5_000);
    market::retract(&mut pack, &cap, string::utf8(b"blob-A"), 1, &c);
    market::retract(&mut pack, &cap, string::utf8(b"blob-A"), 2, &c);
    abort 0
}

#[test, expected_failure(abort_code = market::EInvalidCap)]
fun retract_with_other_packs_cap_fails() {
    let mut scn = ts::begin(SELLER);
    let cap1 = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let cap2 = new_pack(&mut scn, 2_000);

    // 가장 최근 공유 객체 = 팩 2. cap2 로 등록하고 cap1 로 폐기 시도
    scn.next_tx(SELLER);
    let mut pack2 = scn.take_shared<MemoryPack>();
    market::publish(&mut pack2, &cap2, string::utf8(b"blob-A"), 500);
    let c = clock_at(&mut scn, 5_000);
    market::retract(&mut pack2, &cap1, string::utf8(b"blob-A"), 2, &c);
    abort 0
}

#[test, expected_failure(abort_code = market::EInvalidReason)]
fun retract_with_invalid_reason_fails() {
    let mut scn = ts::begin(SELLER);
    let cap = new_pack(&mut scn, 1_000);
    scn.next_tx(SELLER);
    let mut pack = scn.take_shared<MemoryPack>();
    market::publish(&mut pack, &cap, string::utf8(b"blob-A"), 500);
    let c = clock_at(&mut scn, 5_000);
    // 허용 범위는 1/2/3
    market::retract(&mut pack, &cap, string::utf8(b"blob-A"), 0, &c);
    abort 0
}
