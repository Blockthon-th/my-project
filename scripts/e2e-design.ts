/**
 * 디자인 팩 end-to-end (testnet):
 *   팩 생성 → 합성 단계 기록 3개(작은 스크린샷 b64 포함) 암호화·업로드 → manifest/미리보기 업로드
 *   → PTB 1건에 publish×3 + add_preview×3 → 구독 → 배치 복호화(fetchKeys 1회) → record_hash/manifest 대조
 *   → leave_receipt → 중복 영수증 실패 확인 → retract 1개 → recall 에서 제외 확인 → 중복 폐기 실패 확인
 *
 * 실행: npm run e2e:design
 * 필요: .env 의 MARKET_PACKAGE_ID(leave_receipt/retract 가 있는 버전), SELLER_SUI_PRIVATE_KEY, BUYER_SUI_PRIVATE_KEY
 *       (업그레이드 배포라면 SEAL_PACKAGE_ID=<첫 버전 ID>) · 두 주소 모두 testnet 가스 보유
 */
import {
  assertClockOk,
  explorerObject,
  explorerTx,
  keypairFrom,
  PACKAGE_ID,
  SEAL_PACKAGE_ID,
  storeBlob,
} from './config.js';
import {
  createPack,
  decryptAll,
  encryptStep,
  getPack,
  leaveReceipt,
  listActiveBlobIds,
  listReceipts,
  listRetracted,
  newSealClient,
  publishBatch,
  readManifest,
  retract,
  subscribeTx,
  uploadPreviewAssets,
  verifyAfterPreview,
} from './market.js';
import {
  CHECKS,
  finalizeChain,
  OUTCOME,
  parseStepRecord,
  REASON,
  recordHash,
  sha256Hex,
  stepFromIdentity,
  stepIdentity,
  stepTitle,
  verifyChain,
  type Evidence,
  type Manifest,
  type StepRecord,
} from './records.js';

const TTL_MS = 3 * 60_000; // 목록에서 숨겨지는 짧은 테스트 팩 (5분 미만)
const FEE_MIST = 10_000_000; // 0.01 SUI

/** 1x1 흰색 JPEG (약 630B) — 스크린샷 자리 */
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const seller = keypairFrom('SELLER_SUI_PRIVATE_KEY');
const buyer = keypairFrom('BUYER_SUI_PRIVATE_KEY');
const enc = new TextEncoder();
const dec = new TextDecoder();
const step = (n: string) => console.log(`\n── ${n}`);
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`❌ ${msg}`);
};

function shot() {
  const bytes = Buffer.from(TINY_JPEG_B64, 'base64');
  return { mime: 'image/jpeg', w: 1, h: 1, sha256: sha256Hex(new Uint8Array(bytes)), b64: TINY_JPEG_B64 };
}

/** 합성 단계 기록. pack_id / prev_hash / record_hash 는 finalizeChain 이 채운다. */
function makeRecord(n: number, seriesId: string, html: string, o: Partial<StepRecord>): StepRecord {
  return {
    schema: 'mm.step/1',
    pack_id: '',
    series_id: seriesId,
    step: n,
    ts: Date.now() - (4 - n) * 60_000,
    domain: 'design.web',
    tool: { name: 'claude-code', version: 'e2e' },
    model: 'claude',
    prompts: [],
    intent: 'fix',
    edit_mode: 'targeted',
    files_touched: ['index.html'],
    diff: '',
    html_full: html,
    html_sha256: sha256Hex(html),
    screenshot: shot(),
    screenshot_mobile: null,
    check: null,
    why: '',
    lesson: null,
    verdict: 'accepted',
    prev_hash: '',
    record_hash: '',
    ...o,
  };
}

async function main() {
  console.log(`판매자: ${seller.toSuiAddress()}`);
  console.log(`구독자: ${buyer.toSuiAddress()}`);
  console.log(`패키지: ${PACKAGE_ID}${SEAL_PACKAGE_ID !== PACKAGE_ID ? `  (Seal 네임스페이스 ${SEAL_PACKAGE_ID})` : ''}`);
  await assertClockOk();

  // ───────── 1. 팩 ─────────
  step('1. 팩 생성');
  const seriesId = `e2e-design-${Date.now().toString(36)}`;
  const { packId, capId, digest: createDigest } = await createPack(seller, {
    name: '[e2e-design] landing iterations',
    description: 'Claude Code 로 랜딩 페이지를 3턴 고친 합성 기록 (e2e 테스트)',
    feeMist: FEE_MIST,
    ttlMs: TTL_MS,
    sourceNamespace: seriesId,
    agentLabel: 'claude-code',
  });
  console.log(`  pack ${packId}\n  cap  ${capId}\n  tx   ${explorerTx(createDigest)}`);

  // ───────── 2. 단계 기록 ─────────
  step('2. 합성 단계 3개 → 해시 사슬');
  const html1 = '<!doctype html><html><body><section class="hero"><h1>Ship faster with our very long headline that wraps</h1><a class="btn" style="color:#999;background:#eee">Start</a></section></body></html>';
  const html2 = html1.replace('color:#999;background:#eee', 'color:#fff;background:#1a4d2e');
  const html3 = html2.replace('Ship faster with our very long headline that wraps', 'Ship faster');
  const raw = [
    makeRecord(1, seriesId, html1, {
      intent: 'init',
      edit_mode: 'rewrite',
      prompts: ['랜딩 페이지 초안 만들어줘'],
      diff: '+<section class="hero">…',
      check: { passed: ['no-hscroll', 'card-height', 'nav-overlap'], failed: ['cta-contrast', 'h1-lines'] },
      why: '첫 초안. CTA 대비와 h1 줄수는 아직 손대지 않음.',
      lesson: null,
      verdict: 'partial',
    }),
    makeRecord(2, seriesId, html2, {
      prompts: ['버튼이 잘 안 보여'],
      diff: '-<a class="btn" style="color:#999;background:#eee">\n+<a class="btn" style="color:#fff;background:#1a4d2e">',
      check: { passed: ['no-hscroll', 'card-height', 'nav-overlap', 'cta-contrast'], failed: ['h1-lines'] },
      why: 'CTA 전경 #999/배경 #eee 는 대비 2.3:1. 흰 글자 + 진녹색 배경으로 7.9:1.',
      lesson: '연한 회색 CTA 는 항상 4.5:1 에 미달한다 — 배경을 브랜드 진색으로, 글자는 흰색으로 고정하는 편이 빠르다.',
    }),
    makeRecord(3, seriesId, html3, {
      intent: 'polish',
      prompts: ['제목이 두 줄 넘어가'],
      diff: '-<h1>Ship faster with our very long headline that wraps</h1>\n+<h1>Ship faster</h1>',
      check: { passed: ['no-hscroll', 'card-height', 'nav-overlap', 'cta-contrast', 'h1-lines'], failed: [] },
      why: '1280px 에서 h1 이 3줄. 부제로 내릴 수 없는 문장은 줄이는 게 낫다.',
      lesson: 'h1 은 40자 안쪽으로 — font-size 를 줄이면 모바일에서 더 나빠진다.',
    }),
  ];
  const records = finalizeChain(raw, packId, seriesId);
  const chain = verifyChain(records, packId, seriesId);
  assert(chain.ok, `사슬 검증 실패: ${chain.errors.join('; ')}`);
  records.forEach((r) => console.log(`  step ${r.step}  ${r.record_hash.slice(0, 16)}…  prev ${r.prev_hash.slice(0, 8)}…  identity …${stepIdentity(packId, r.step).slice(-4)}`));
  assert(stepFromIdentity(packId, stepIdentity(packId, 3)) === 3, 'stepIdentity 왕복 실패');

  // ───────── 3. 암호화·업로드 ─────────
  step('3. Seal 암호화 → Walrus 업로드 (identity = pack ‖ u16 step)');
  const seal = newSealClient();
  const uploads: { step: number; blobId: string; memoryAtMs: number }[] = [];
  for (const r of records) {
    const { bytes } = await encryptStep(seal, packId, r);
    const blobId = await storeBlob(bytes);
    uploads.push({ step: r.step, blobId, memoryAtMs: r.ts });
    console.log(`  step ${r.step}  ${bytes.length}B → ${blobId}`);
  }

  step('4. manifest + before/after 미리보기 업로드');
  const manifest0: Manifest = {
    schema: 'mm.manifest/1',
    pack_id: packId,
    series_id: seriesId,
    brief: '랜딩 페이지 CTA 대비 · h1 줄수 수정 과정',
    domain: 'design.web',
    tool: records[0].tool,
    model: records[0].model,
    steps: records.map((r) => ({ step: r.step, title: stepTitle(r), record_sha256: r.record_hash })),
    final_html_sha256: records[2].html_sha256,
    checks: CHECKS,
    previews: { before: null, after: null },
    after_sha256: null,
  };
  const before = new Uint8Array(Buffer.from(records[0].screenshot!.b64, 'base64'));
  const after = new Uint8Array(Buffer.from(records[2].screenshot!.b64, 'base64'));
  const up = await uploadPreviewAssets(manifest0, { before, after });
  console.log(`  manifest ${up.manifestBlobId}\n  before   ${up.beforeBlobId}\n  after    ${up.afterBlobId}`);

  step('5. PTB 1건: publish ×3 + add_preview ×3');
  const pubRes = await publishBatch(seller, packId, capId, uploads, [up.manifestBlobId, up.beforeBlobId!, up.afterBlobId!]);
  console.log(`  tx ${explorerTx(pubRes.digest)}`);
  const pack = await getPack(packId);
  assert(pack && pack.memoryCount === 3, `memory_count 가 3 이 아님: ${pack?.memoryCount}`);
  assert(pack && pack.previewBlobIds.length === 3, `preview 가 3 이 아님: ${pack?.previewBlobIds.length}`);
  const manifest = await readManifest(pack!);
  assert(manifest && manifest.steps.length === 3, 'manifest 를 미리보기에서 읽지 못함');
  assert((await verifyAfterPreview(manifest!)) === true, 'after 스크린샷 sha256 대조 실패');
  console.log('  ✅ 팩 등록 확인 (memory_count 3, preview 3, manifest 읽힘, after sha256 일치)');

  // ───────── 6. 구독 ─────────
  step('6. 구독자 결제 → 구독권');
  const { subscriptionId: subId, digest: subDigest } = await subscribeTx(buyer, packId, FEE_MIST);
  console.log(`  sub ${subId}\n  tx  ${explorerTx(subDigest)}`);

  // ───────── 7. 배치 복호화 ─────────
  step('7. 배치 복호화 (seal_approve ×3 을 한 PTB 로, fetchKeys 1회)');
  const buyerAddr = buyer.toSuiAddress();
  const { active, retracted } = await listActiveBlobIds(packId);
  assert(active.length === 3 && retracted.length === 0, `active ${active.length} / retracted ${retracted.length}`);
  const items = await decryptAll(buyer, buyerAddr, newSealClient(), packId, subId, active, { log: (s) => console.log(`  ${s}`) });
  assert(items.length === 3, `복호화 개수 ${items.length}`);
  const got: StepRecord[] = [];
  for (const it of items) {
    const r = parseStepRecord(dec.decode(it.plain));
    assert(r, `mm.step/1 로 파싱 실패 (${it.blobId})`);
    assert(it.step === r!.step, `identity 의 step(${it.step}) ≠ 기록 step(${r!.step})`);
    const expect = manifest!.steps.find((s) => s.step === r!.step)!.record_sha256;
    assert(recordHash(r!) === r!.record_hash && r!.record_hash === expect, `step ${r!.step} record_hash 가 manifest 와 다름`);
    got.push(r!);
    console.log(`  step ${r!.step}  ✓ record_hash = manifest.record_sha256  (${r!.lesson ?? r!.why})`);
  }
  const gotChain = verifyChain(got, packId, seriesId);
  assert(gotChain.ok, `복호화본 사슬 검증 실패: ${gotChain.errors.join('; ')}`);
  console.log('  ✅ 3단계 모두 manifest 와 일치, 사슬 정상');

  // ───────── 8. 영수증 ─────────
  step('8. leave_receipt (증거 → Walrus 평문)');
  const evidence: Evidence = {
    schema: 'mm.evidence/1',
    pack_id: packId,
    subscription_id: subId,
    ts: Date.now(),
    check: { passed: ['cta-contrast', 'h1-lines', 'no-hscroll', 'card-height', 'nav-overlap'], failed: [] },
    applied: [
      { step: 2, selector: '.hero a.btn' },
      { step: 3, selector: '.hero h1' },
    ],
    note: 'e2e-design',
  };
  const evidenceBlobId = await storeBlob(enc.encode(JSON.stringify(evidence)));
  const rcpt = await leaveReceipt(buyer, packId, subId, OUTCOME.resolved, evidenceBlobId);
  console.log(`  tx ${explorerTx(rcpt.digest)}  evidence ${evidenceBlobId}`);
  const receipts = await listReceipts(packId);
  assert(receipts.length === 1, `영수증 수 ${receipts.length}`);
  assert(receipts[0].subscriber === buyerAddr && receipts[0].outcome === 2 && receipts[0].subscriptionId === subId, '영수증 필드 불일치');
  console.log(`  ✅ 영수증 1건: subscriber ${receipts[0].subscriber.slice(0, 10)}… outcome ${receipts[0].outcome} at ${receipts[0].atMs}`);

  step('9. 같은 구독권으로 두 번째 영수증 → 실패해야 정상 (EReceiptExists = 5)');
  let dupBlocked = false;
  try {
    await leaveReceipt(buyer, packId, subId, OUTCOME.partial, evidenceBlobId);
  } catch (e) {
    dupBlocked = true;
    console.log(`  ✅ 거부됨: ${String(e).slice(0, 160)}`);
  }
  assert(dupBlocked, '중복 영수증이 통과했다');

  // ───────── 10. 폐기 ─────────
  step('10. retract step 2 (sdk-changed) → recall 에서 제외');
  const blob2 = uploads.find((u) => u.step === 2)!.blobId;
  const ret = await retract(seller, packId, capId, blob2, REASON['sdk-changed']);
  console.log(`  tx ${explorerTx(ret.digest)}`);
  const retracted2 = await listRetracted(packId);
  assert(retracted2.length === 1 && retracted2[0].blobId === blob2 && retracted2[0].reason === 3, '폐기 필드 불일치');
  const after2 = await listActiveBlobIds(packId);
  assert(after2.active.length === 2 && !after2.active.includes(blob2), `폐기 후 active ${after2.active.length}`);
  const items2 = await decryptAll(buyer, buyerAddr, newSealClient(), packId, subId, after2.active);
  const steps2 = items2.map((i) => i.step).sort();
  assert(steps2.length === 2 && steps2[0] === 1 && steps2[1] === 3, `폐기 후 recall 단계 ${steps2.join(',')}`);
  console.log(`  ✅ 폐기 후 recall: step ${steps2.join(', ')} (step 2 제외)`);

  step('11. 같은 블롭 두 번째 폐기 → 실패해야 정상 (EAlreadyRetracted = 8)');
  let dupRetract = false;
  try {
    await retract(seller, packId, capId, blob2, REASON.wrong);
  } catch (e) {
    dupRetract = true;
    console.log(`  ✅ 거부됨: ${String(e).slice(0, 160)}`);
  }
  assert(dupRetract, '중복 폐기가 통과했다');

  step('완료');
  console.log(`  팩:     ${explorerObject(packId)}`);
  console.log(`  구독권: ${explorerObject(subId)}`);
  console.log(`  영수증 1 · 폐기 1 · 단계 3 (활성 2)`);
}

main().catch((e) => {
  console.error('\n실패:', e);
  if (/not the first version/i.test(String(e))) {
    console.error('\n힌트: 업그레이드 배포면 .env 에 SEAL_PACKAGE_ID=<첫 버전 패키지 ID> 를 두세요 (config.ts 주석 참고).');
  }
  if (/FunctionNotFound|leave_receipt|retract/i.test(String(e))) {
    console.error('\n힌트: MARKET_PACKAGE_ID 가 leave_receipt/retract 가 있는 새 배포를 가리키는지 확인하세요.');
  }
  process.exit(1);
});
