/**
 * MCP 서버를 거치지 않고 시장 조회·구독·회상을 직접 확인한다.
 *
 *   npm run check              목록 · 팩 상세 · 블롭 · 미리보기 (읽기만)
 *   npm run check -- --sub     위 + 구독 결제 + 복호화 회상까지
 */
import { explorerObject, keypairFrom } from './config.js';
import {
  decryptMemories,
  findSubscription,
  getPack,
  listPackBlobIds,
  listPacks,
  newSealClient,
  readPreviews,
  subscribe,
} from './market.js';

const WITH_SUB = process.argv.includes('--sub');
const step = (s: string) => console.log(`\n── ${s}`);

async function main() {
  step('1. market_list, 시장의 팩 목록');
  const ALL = process.argv.includes('--all');
  const packs = await listPacks(50, ALL);
  console.log(`   ${packs.length}개${ALL ? ' (테스트 팩 포함)' : ' (테스트 팩 제외, 전체를 보려면 --all)'}`);
  for (const p of packs) {
    const span =
      p.firstMemoryAtMs && p.lastMemoryAtMs
        ? `${new Date(p.firstMemoryAtMs).toISOString().slice(0, 10)} ~ ${new Date(p.lastMemoryAtMs).toISOString().slice(0, 10)}`
        : '기간 없음';
    console.log(
      `   · ${p.name} | 기억 ${p.memoryCount} · 구독자 ${p.subscriberCount} | ${(p.feeMist / 1e9).toFixed(4)} SUI / ${(p.ttlMs / 3.6e6).toFixed(1)}시간 | ${p.agentLabel}/${p.sourceNamespace} ${span}`,
    );
    console.log(`     ${p.packId}`);
  }
  if (packs.length === 0) return console.log('팩이 없습니다. npm run sync 를 먼저 실행하세요.');

  const target = process.env.MARKET_PACK_ID ?? packs[0].packId;
  const pack = await getPack(target);
  if (!pack) return console.log(`팩을 찾을 수 없음: ${target}`);

  step('2. 등록된 암호화 블롭');
  const blobIds = await listPackBlobIds(target);
  console.log(`   ${blobIds.length}건 (팩의 memory_count = ${pack.memoryCount})`);
  console.log(`   예: ${blobIds.slice(0, 3).join(', ')}`);
  if (blobIds.length !== pack.memoryCount) {
    console.log('   ⚠ 개수 불일치, listDynamicFields 페이징 확인 필요');
  }

  step('3. market_preview, 무료 미리보기');
  const previews = await readPreviews(pack);
  previews.forEach((p, i) => console.log(`   ${i + 1}. ${p.slice(0, 110)}…`));
  if (previews.length === 0) console.log('   (없음)');

  if (!WITH_SUB) {
    console.log('\n구독까지 확인하려면: npm run check -- --sub');
    return;
  }

  const buyer = keypairFrom('BUYER_SUI_PRIVATE_KEY');
  const address = buyer.toSuiAddress();

  step('4. 구독 상태 확인');
  let sub = await findSubscription(address, target);
  if (sub && sub.expiresAtMs > Date.now()) {
    console.log(`   이미 구독 중 (만료 ${new Date(sub.expiresAtMs).toLocaleString()})`);
  } else {
    console.log(`   구독 없음 → 결제 ${(pack.feeMist / 1e9).toFixed(4)} SUI`);
    const subId = await subscribe(buyer, target, pack.feeMist);
    console.log(`   구독권: ${explorerObject(subId)}`);
    sub = await findSubscription(address, target);
  }
  if (!sub) throw new Error('구독권을 찾지 못했습니다');

  step('5. market_recall, 복호화');
  const t0 = Date.now();
  const memories = await decryptMemories(
    buyer,
    address,
    newSealClient(),
    target,
    sub.id,
    blobIds.slice(0, 5), // 확인용으로 5건만
  );
  console.log(`   ${memories.length}건 복호화 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  memories.forEach((m, i) => console.log(`   ${i + 1}. ${m.slice(0, 100)}…`));

  console.log('\n✅ 전 과정 확인 완료');
}

main().catch((e) => {
  console.error('\n실패:', e);
  process.exit(1);
});
