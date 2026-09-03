#[test_only]
module memory_market::market_tests;

use std::string;
use sui::{clock, coin, sui::SUI, test_scenario as ts};
use memory_market::market::{Self, MemoryPack, PackCap};

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
