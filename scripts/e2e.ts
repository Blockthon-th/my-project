/**
 * end-to-end 검증: 팩 생성 → Seal 암호화 → Walrus 업로드 → publish
 *                → 구독 → 복호화 성공  → (만료 후) 복호화 실패
 *
 * 실행: npm run e2e
 * 필요: .env 의 MARKET_PACKAGE_ID, SELLER_SUI_PRIVATE_KEY, BUYER_SUI_PRIVATE_KEY
 *       두 주소 모두 testnet 가스 보유
 */
import { EncryptedObject, NoAccessError, SealClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import {
  assertClockOk,
  KEY_SERVERS,
  SEAL_MODE,
  SEAL_SESSION_TTL_MIN,
  SEAL_THRESHOLD,
  PACKAGE_ID,
  explorerObject,
  keypairFrom,
  readBlob,
  storeBlob,
  suiClient,
} from './config.js';
import { createdId, execute } from './tx.js';
import { createSessionKey } from './session.js';

const TTL_MS = 60_000; // 데모: 60초짜리 구독 (만료 시연용)
const FEE_MIST = 10_000_000; // 0.01 SUI

/** 데모용 판매자 기억 (실제로는 MemWal에서 export) */
const MEMORIES = [
  {
    text: '공개 풀노드는 JSON-RPC를 중단했다. SuiClient 대신 SuiGrpcClient를 쓰고, 트랜잭션은 keypair.signAndExecuteTransaction({transaction, client}) 로 보낸다.',
    at: Date.now() - 2 * 86_400_000,
  },
  {
    text: '@mysten/sui 는 2.x 로 크게 바뀌었다. 1.x 의 gRPC 클라이언트는 transaction resolution 미지원 + read_mask 불일치로 testnet 노드와 아예 통신이 안 된다. 2.x 로 올리고 응답 필드는 include 로 명시할 것.',
    at: Date.now() - 86_400_000,
  },
  {
    text: 'Seal 열쇠 ID 규약은 [패키지ID]::[정책객체ID][nonce]. seal_approve 안에서 is_prefix(정책객체.id.to_bytes(), id) 로 소관을 확인한다.',
    at: Date.now() - 3_600_000,
  },
];

const seller = keypairFrom('SELLER_SUI_PRIVATE_KEY');
const buyer = keypairFrom('BUYER_SUI_PRIVATE_KEY');

/**
 * SealClient 는 키 서버에서 받아온 파생 키를 내부에 캐시한다.
 * 한 번 키를 받으면 이후 복호화는 로컬에서 일어나므로, 같은 클라이언트로는 만료를 확인할 수 없다.
 * → 만료 검증은 캐시가 빈 새 클라이언트로 해야 한다(= 새 세션의 구독자).
 */
const newSealClient = () =>
  new SealClient({ suiClient, serverConfigs: KEY_SERVERS, verifyKeyServers: false });

const seal = newSealClient();

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const step = (n: string) => console.log(`\n── ${n}`);

async function main() {
  console.log(`판매자: ${seller.toSuiAddress()}`);
  console.log(`구독자: ${buyer.toSuiAddress()}`);
  console.log(`패키지: ${PACKAGE_ID}`);
  console.log(`Seal 키 서버: ${SEAL_MODE} (threshold ${SEAL_THRESHOLD}, 세션 ${SEAL_SESSION_TTL_MIN}분)`);
  await assertClockOk();

  // ───────── 1. 팩 생성 ─────────
  step('1. 판매자가 기억 팩 생성');
  const packRes = await (async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::market::create_pack_entry`,
      arguments: [
        tx.pure.string('sui-dev onboarding'),
        tx.pure.string('Sui/Walrus/Seal 온보딩 과정에서 쌓인 실패와 해결 기록'),
        tx.pure.u64(FEE_MIST),
        tx.pure.u64(TTL_MS),
        tx.pure.string('sui-dev'),
        tx.pure.string('claude-code'),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return execute(tx, seller);
  })();
  const packId = createdId(packRes, '::market::MemoryPack');
  const capId = createdId(packRes, '::market::PackCap');
  console.log(`  pack: ${packId}`);
  console.log(`  cap : ${capId}`);

  // ───────── 2. 암호화 + 업로드 + publish ─────────
  step('2. 기억을 Seal로 암호화 → Walrus 업로드 → 팩에 등록');
  const packBytes = fromHex(packId);
  const blobIds: string[] = [];
  for (const m of MEMORIES) {
    // 열쇠 ID = 팩 ID ‖ nonce  (컨트랙트의 is_prefix 검사와 맞춤)
    const nonce = crypto.getRandomValues(new Uint8Array(5));
    const id = toHex(new Uint8Array([...packBytes, ...nonce]));
    const { encryptedObject } = await seal.encrypt({
      threshold: SEAL_THRESHOLD,
      packageId: PACKAGE_ID,
      id,
      data: enc.encode(m.text),
    });
    const blobId = await storeBlob(encryptedObject);
    blobIds.push(blobId);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::market::publish`,
      arguments: [
        tx.object(packId),
        tx.object(capId),
        tx.pure.string(blobId),
        tx.pure.u64(m.at),
      ],
    });
    await execute(tx, seller);
    console.log(`  ✓ ${blobId}  ← "${m.text.slice(0, 40)}…"`);
  }

  // ───────── 3. 구독 ─────────
  step('3. 구독자가 결제하고 구독권 발급');
  const subRes = await (async () => {
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [FEE_MIST]);
    tx.moveCall({
      target: `${PACKAGE_ID}::market::subscribe_entry`,
      arguments: [tx.object(packId), coin, tx.object(SUI_CLOCK_OBJECT_ID)],
    });
    return execute(tx, buyer);
  })();
  const subId = createdId(subRes, '::market::Subscription');
  console.log(`  구독권: ${subId} (유효 ${TTL_MS / 1000}초)`);

  // ───────── 4. 구독자가 복호화 ─────────
  step('4. 구독 유효 → 복호화 시도');
  /** 세션 키는 짧게 만료되므로 필요할 때마다 새로 만든다(서버 시각 정렬 포함). */
  const newSessionKey = () => createSessionKey(buyer, buyer.toSuiAddress());

  /** seal_approve 호출만 담은 트랜잭션 (실행하지 않고 키 서버가 시뮬레이션한다) */
  const approveTx = (fullId: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::market::seal_approve`,
      arguments: [
        tx.pure.vector('u8', fromHex(fullId)),
        tx.object(subId),
        tx.object(packId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    // onlyTransactionKind: true → 가스·sender 없이 빌드
    return tx.build({ client: suiClient, onlyTransactionKind: true });
  };

  const decryptAll = async (client: SealClient = seal) => {
    const sessionKey = await newSessionKey();
    const out: string[] = [];
    for (const blobId of blobIds) {
      const data = await readBlob(blobId);
      const fullId = EncryptedObject.parse(data).id;
      const txBytes = await approveTx(fullId);
      const plain = await client.decrypt({ data, sessionKey, txBytes });
      out.push(dec.decode(plain));
    }
    return out;
  };

  const texts = await decryptAll();
  texts.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  if (texts.length !== MEMORIES.length) throw new Error('복호화된 개수가 다릅니다');
  console.log('  ✅ 구독 중에는 읽힌다');

  // ───────── 5. 만료 후 ─────────
  step(`5. ${TTL_MS / 1000}초 대기 후 만료 → 복호화 실패해야 정상`);
  await sleep(TTL_MS + 5_000);

  // 캐시가 살아 있는 기존 클라이언트로는 여전히 읽힌다 (키를 이미 받아뒀으므로)
  const cached = await decryptAll(seal);
  console.log(`  참고: 키를 캐시한 클라이언트는 만료 후에도 로컬 복호화 가능 (${cached.length}건)`);

  // 새 클라이언트 = 키를 새로 요청해야 하는 상황 → 여기서 거부되어야 한다
  let expiredBlocked = false;
  try {
    await decryptAll(newSealClient());
  } catch (e) {
    if (e instanceof NoAccessError || /no ?access/i.test(String(e))) {
      expiredBlocked = true;
      console.log('  ✅ 만료 후 새 클라이언트는 키를 못 받는다 (NoAccessError)');
    } else {
      throw e;
    }
  }
  if (!expiredBlocked) {
    throw new Error('❌ 만료됐는데도 새 클라이언트가 복호화함 — seal_approve 정책이 동작하지 않음');
  }

  step('완료');
  console.log(`  팩:     ${explorerObject(packId)}`);
  console.log(`  구독권: ${explorerObject(subId)}`);
}

main().catch((e) => {
  console.error('\n실패:', e);
  if (/expired|certificate/i.test(String(e))) {
    console.error(
      '\n힌트: 키 서버는 인증서 생성 시각이 자기 시계보다 미래이면 무조건 거부합니다(허용 오차 0).\n' +
        '      session.ts 가 보정하지만 부족하면 여유분을 늘리거나 PC 시계를 맞추세요:\n' +
        '        net start w32time; w32tm /resync /force   (관리자 PowerShell)\n' +
        '      키 서버를 바꿔보려면 .env 에: SEAL_KEY_SERVERS=committee',
    );
  }
  process.exit(1);
});
