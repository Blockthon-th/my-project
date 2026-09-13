/**
 * Memory Market 온체인 조작 (팩 생성/등록/구독/조회 + 단계 기록·영수증·폐기).
 * sync 스크립트, mm CLI, e2e, MCP 서버가 공유한다.
 *
 * 팩(MemoryPack) UID 아래 dynamic field:
 *   String(blob_id)            → MARKER(u64)   등록된 암호화 블롭 (publish)
 *   ReceiptKey{subscription_id} → Receipt       구독자 영수증 (leave_receipt)
 *   RetractKey{blob_id}         → Retraction    판매자 폐기 (retract)
 * 필드 이름의 BCS 만으로는 String 과 RetractKey{String} 를 구분할 수 없으므로(레이아웃이 같다)
 * `name.type` 으로 가른다.
 */
import { EncryptedObject, NoAccessError, SealClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, isValidSuiObjectId, normalizeSuiObjectId, toHex, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import type { Signer } from '@mysten/sui/cryptography';
import {
  GRAPHQL_URL,
  KEY_SERVERS,
  PACKAGE_ID,
  SEAL_PACKAGE_ID,
  SEAL_THRESHOLD,
  readBlob,
  storeBlob,
  suiClient,
} from './config.js';
import {
  canonicalJson,
  parseManifest,
  sha256Hex,
  stepFromIdentity,
  stepIdentity,
  type Manifest,
  type StepRecord,
} from './records.js';
import { createSessionKey } from './session.js';
import { createdId, execute, type TxResult } from './tx.js';

export const newSealClient = () =>
  new SealClient({ suiClient, serverConfigs: KEY_SERVERS, verifyKeyServers: false });

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * 에이전트·CLI 가 넘긴 객체 ID 를 검증하고 정규화한다 (0x + 64 hex).
 * 팩 ID 는 캐시 폴더 이름과 Seal identity 접두사에 쓰이므로 임의 문자열이 흘러들면 안 된다.
 */
export function normalizeObjectId(id: string, what = 'pack id'): string {
  const s = String(id ?? '').trim();
  if (!isValidSuiObjectId(s)) throw new Error(`${what} 형식이 아닙니다 (0x + 64 hex): ${s.slice(0, 80)}`);
  return normalizeSuiObjectId(s);
}

/** Seal 이 키를 거부했는지 (만료·비구독 등 seal_approve abort) */
export const isNoAccess = (e: unknown): boolean =>
  e instanceof NoAccessError || /no ?access/i.test(String(e));

// ───────────────────────── 판매자 ─────────────────────────

export interface CreatePackInput {
  name: string;
  description: string;
  feeMist: number;
  ttlMs: number;
  sourceNamespace: string;
  agentLabel: string;
}

export async function createPack(signer: Signer, input: CreatePackInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::market::create_pack_entry`,
    arguments: [
      tx.pure.string(input.name),
      tx.pure.string(input.description),
      tx.pure.u64(input.feeMist),
      tx.pure.u64(input.ttlMs),
      tx.pure.string(input.sourceNamespace),
      tx.pure.string(input.agentLabel),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  const res = await execute(tx, signer);
  return {
    packId: createdId(res, '::market::MemoryPack'),
    capId: createdId(res, '::market::PackCap'),
    digest: res.digest,
  };
}

/** 기억 하나를 Seal 로 암호화 → Walrus 업로드 → 팩에 등록 (랜덤 nonce) */
export async function publishMemory(
  signer: Signer,
  seal: SealClient,
  packId: string,
  capId: string,
  memory: { text: string; at: number },
): Promise<string> {
  // 열쇠 ID = 팩 ID ‖ nonce (컨트랙트의 is_prefix 검사와 맞춤)
  const nonce = crypto.getRandomValues(new Uint8Array(5));
  const id = toHex(new Uint8Array([...fromHex(packId), ...nonce]));
  const { encryptedObject } = await seal.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: SEAL_PACKAGE_ID,
    id,
    data: enc.encode(memory.text),
  });
  const blobId = await storeBlob(encryptedObject);

  const tx = new Transaction();
  addPublishCall(tx, packId, capId, blobId, memory.at);
  await execute(tx, signer);
  return blobId;
}

/** 미리보기(평문) 등록 */
export async function publishPreview(
  signer: Signer,
  packId: string,
  capId: string,
  text: string,
): Promise<string> {
  const blobId = await storeBlob(enc.encode(text));
  const tx = new Transaction();
  addPreviewCall(tx, packId, capId, blobId);
  await execute(tx, signer);
  return blobId;
}

// ── PTB 조각 (mm publish 가 publish×N + add_preview×3 을 한 tx 에 담는다) ──

export function addPublishCall(
  tx: Transaction,
  packId: string,
  capId: string,
  blobId: string,
  memoryAtMs: number,
) {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::publish`,
    arguments: [tx.object(packId), tx.object(capId), tx.pure.string(blobId), tx.pure.u64(memoryAtMs)],
  });
}

export function addPreviewCall(tx: Transaction, packId: string, capId: string, blobId: string) {
  tx.moveCall({
    target: `${PACKAGE_ID}::market::add_preview`,
    arguments: [tx.object(packId), tx.object(capId), tx.pure.string(blobId)],
  });
}

/** publish 여러 건 + add_preview 여러 건을 PTB 1건으로 */
export async function publishBatch(
  signer: Signer,
  packId: string,
  capId: string,
  steps: { blobId: string; memoryAtMs: number }[],
  previewBlobIds: string[] = [],
): Promise<TxResult> {
  if (steps.length === 0 && previewBlobIds.length === 0) throw new Error('올릴 것이 없습니다');
  const tx = new Transaction();
  for (const s of steps) addPublishCall(tx, packId, capId, s.blobId, s.memoryAtMs);
  for (const b of previewBlobIds) addPreviewCall(tx, packId, capId, b);
  return execute(tx, signer);
}

// ── 단계 기록 (mm.step/1) ──

/** 기록을 identity = pack ‖ u16 step 로 암호화한다 (업로드·등록은 하지 않음). 평문은 canonical JSON. */
export async function encryptStep(seal: SealClient, packId: string, record: StepRecord) {
  const id = stepIdentity(packId, record.step);
  const plain = enc.encode(canonicalJson(record));
  const { encryptedObject } = await seal.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: SEAL_PACKAGE_ID,
    id,
    data: plain,
  });
  return { id, bytes: encryptedObject, plainSha256: sha256Hex(plain) };
}

/** 단계 기록 하나: 암호화 → Walrus → publish(memory_at_ms = ts). blobId 반환. */
export async function publishStep(
  signer: Signer,
  seal: SealClient,
  packId: string,
  capId: string,
  record: StepRecord,
): Promise<string> {
  const { bytes } = await encryptStep(seal, packId, record);
  const blobId = await storeBlob(bytes);
  const tx = new Transaction();
  addPublishCall(tx, packId, capId, blobId, record.ts);
  await execute(tx, signer);
  return blobId;
}

export interface PreviewShots {
  before: Uint8Array | null;
  after: Uint8Array | null;
}

/**
 * before/after 스크린샷과 manifest 를 Walrus 에 평문으로 올린다 (등록은 안 함).
 * manifest 의 previews / after_sha256 을 채워서 돌려준다.
 */
export async function uploadPreviewAssets(manifest: Manifest, shots: PreviewShots) {
  const beforeBlobId = shots.before ? await storeBlob(shots.before) : null;
  const afterBlobId = shots.after ? await storeBlob(shots.after) : null;
  const filled: Manifest = {
    ...manifest,
    previews: { before: beforeBlobId, after: afterBlobId },
    after_sha256: shots.after ? sha256Hex(shots.after) : null,
  };
  const manifestBlobId = await storeBlob(enc.encode(JSON.stringify(filled)));
  return { manifest: filled, manifestBlobId, beforeBlobId, afterBlobId };
}

/** manifest + before/after 를 올리고 add_preview ×3 (한 tx). */
export async function publishManifestAndPreviews(
  signer: Signer,
  packId: string,
  capId: string,
  manifest: Manifest,
  shots: PreviewShots,
) {
  const up = await uploadPreviewAssets(manifest, shots);
  const ids = [up.manifestBlobId, up.beforeBlobId, up.afterBlobId].filter((x): x is string => !!x);
  const res = await publishBatch(signer, packId, capId, [], ids);
  return { ...up, digest: res.digest };
}

/** 블롭 폐기. reason: 1 model-changed · 2 wrong · 3 sdk-changed */
export async function retract(
  signer: Signer,
  packId: string,
  capId: string,
  blobId: string,
  reason: number,
): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::market::retract`,
    arguments: [
      tx.object(packId),
      tx.object(capId),
      tx.pure.string(blobId),
      tx.pure.u8(reason),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, signer);
}

// ───────────────────────── 구독자 ─────────────────────────

export async function subscribe(signer: Signer, packId: string, feeMist: number) {
  const res = await subscribeTx(signer, packId, feeMist);
  return res.subscriptionId;
}

/** subscribe + digest (tx 로그용) */
export async function subscribeTx(signer: Signer, packId: string, feeMist: number) {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [feeMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::market::subscribe_entry`,
    arguments: [tx.object(packId), coin, tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  const res = await execute(tx, signer);
  return { subscriptionId: createdId(res, '::market::Subscription'), digest: res.digest };
}

export interface SubscriptionInfo {
  id: string;
  packId: string;
  expiresAtMs: number;
}

/** 구독자가 가진 이 팩의 구독권 전부 (만료 포함), 만료가 늦은 순 */
export async function findSubscriptions(address: string, packId: string): Promise<SubscriptionInfo[]> {
  const out: SubscriptionInfo[] = [];
  let cursor: string | null = null;
  for (;;) {
    const res: Awaited<ReturnType<typeof suiClient.listOwnedObjects>> = await suiClient.listOwnedObjects({
      owner: address,
      type: `${PACKAGE_ID}::market::Subscription`,
      limit: 50,
      cursor,
    });
    for (const obj of res.objects) {
      const fields = await readSubscription(obj.objectId);
      if (fields?.packId === packId) out.push({ id: obj.objectId, ...fields });
    }
    if (!res.hasNextPage || !res.cursor) break;
    cursor = res.cursor;
  }
  return out.sort((a, b) => b.expiresAtMs - a.expiresAtMs);
}

/** 구독자가 가진 구독권 중 이 팩의 것 — 유효한 것을 우선, 없으면 가장 최근 만료분 */
export async function findSubscription(address: string, packId: string) {
  const subs = await findSubscriptions(address, packId);
  const now = Date.now();
  return subs.find((s) => s.expiresAtMs > now) ?? subs[0] ?? null;
}

export async function readSubscription(objectId: string) {
  const { object } = await suiClient.getObject({ objectId, include: { json: true } });
  const j = (object as { json?: Record<string, unknown> }).json;
  if (!j) return null;
  return {
    packId: String(j.pack_id),
    expiresAtMs: Number(j.expires_at_ms),
  };
}

/** seal_approve 호출만 담은 PTB (실행하지 않고 키 서버가 시뮬레이션한다). id 여러 개 = moveCall 여러 개. */
export async function approveTxBytes(ids: string[], subscriptionId: string, packId: string) {
  const tx = new Transaction();
  for (const id of ids) {
    tx.moveCall({
      target: `${PACKAGE_ID}::market::seal_approve`,
      arguments: [
        tx.pure.vector('u8', fromHex(id)),
        tx.object(subscriptionId),
        tx.object(packId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
  }
  // onlyTransactionKind: true → 가스·sender 없이 빌드
  return tx.build({ client: suiClient, onlyTransactionKind: true });
}

/** 구독권으로 팩의 기억들을 복호화한다 (블롭당 요청 — 기존 호환) */
export async function decryptMemories(
  signer: Signer,
  address: string,
  seal: SealClient,
  packId: string,
  subscriptionId: string,
  blobIds: string[],
): Promise<string[]> {
  const items = await decryptAll(signer, address, seal, packId, subscriptionId, blobIds);
  return items.map((i) => dec.decode(i.plain));
}

export interface DecryptedBlob {
  blobId: string;
  /** Seal identity (hex) */
  id: string;
  /** identity 가 pack ‖ u16 이면 step 번호 */
  step: number | null;
  plain: Uint8Array;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * 배치 복호화: 블롭 전부 내려받고 → identity 를 모아 seal_approve ×N 을 한 PTB 에 담아
 * `fetchKeys` 1회로 키를 받은 뒤 → 로컬 복호화. 키 서버 왕복이 블롭 수와 무관하게 1회.
 * 배치 요청이 (NoAccess 가 아닌 이유로) 실패하면 블롭당 요청으로 폴백한다.
 * NoAccess(만료·비구독)는 그대로 던진다 — 호출자가 만료 메시지로 바꾼다.
 */
export async function decryptAll(
  signer: Signer,
  address: string,
  seal: SealClient,
  packId: string,
  subscriptionId: string,
  blobIds: string[],
  opts: { log?: (s: string) => void } = {},
): Promise<DecryptedBlob[]> {
  const log = opts.log ?? (() => {});
  if (blobIds.length === 0) return [];
  const fetched = await mapLimit(blobIds, 4, async (blobId) => {
    const data = await readBlob(blobId);
    const id = EncryptedObject.parse(data).id;
    return { blobId, data, id };
  });
  // 블롭은 판매자가 올린 것이다. identity 가 이 팩의 접두사가 아니면 seal_approve 가 ENoAccess 로 abort 하고
  // 배치 전체가 "거부" 로 보이므로(만료로 오인), 그런 블롭은 미리 빼고 알린다.
  const prefix = toHex(fromHex(packId));
  const items = fetched.filter((it) => {
    const ok = it.id.toLowerCase().startsWith(prefix.toLowerCase());
    if (!ok) log(`Seal: 블롭 ${it.blobId.slice(0, 12)}… 의 identity 가 이 팩 접두사가 아님 → 제외`);
    return ok;
  });
  if (items.length === 0) return [];
  const sessionKey = await createSessionKey(signer, address);
  const ids = [...new Set(items.map((i) => i.id))];
  const batchTx = await approveTxBytes(ids, subscriptionId, packId);

  let batched = true;
  try {
    await seal.fetchKeys({ ids, txBytes: batchTx, sessionKey, threshold: SEAL_THRESHOLD });
    log(`Seal: ${ids.length}개 identity 키를 요청 1회로 수신`);
  } catch (e) {
    if (isNoAccess(e)) throw e;
    batched = false;
    log(`Seal: 배치 요청 실패 (${String(e).slice(0, 120)}) → 블롭당 요청으로 폴백`);
  }

  const out: DecryptedBlob[] = [];
  for (const it of items) {
    const txBytes = batched ? batchTx : await approveTxBytes([it.id], subscriptionId, packId);
    const plain = await seal.decrypt({ data: it.data, sessionKey, txBytes });
    out.push({ blobId: it.blobId, id: it.id, step: safeStep(packId, it.id), plain });
  }
  return out;
}

function safeStep(packId: string, id: string): number | null {
  try {
    return stepFromIdentity(packId, id);
  } catch {
    return null;
  }
}

/** 영수증. outcome: 0 unresolved · 1 partial · 2 resolved. 만료된 구독권으로도 남길 수 있다. */
export async function leaveReceipt(
  signer: Signer,
  packId: string,
  subscriptionId: string,
  outcome: number,
  evidenceBlobId: string,
): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::market::leave_receipt`,
    arguments: [
      tx.object(packId),
      tx.object(subscriptionId),
      tx.pure.u8(outcome),
      tx.pure.string(evidenceBlobId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return execute(tx, signer);
}

// ───────────────────────── 조회 ─────────────────────────

export interface PackInfo {
  packId: string;
  name: string;
  description: string;
  owner: string;
  feeMist: number;
  ttlMs: number;
  sourceNamespace: string;
  agentLabel: string;
  memoryCount: number;
  subscriberCount: number;
  firstMemoryAtMs: number;
  lastMemoryAtMs: number;
  previewBlobIds: string[];
}

export async function getPack(packId: string): Promise<PackInfo | null> {
  const { object } = await suiClient.getObject({ objectId: packId, include: { json: true } });
  const j = (object as { json?: Record<string, unknown> }).json;
  if (!j) return null;
  return {
    packId,
    name: String(j.name),
    description: String(j.description),
    owner: String(j.owner),
    feeMist: Number(j.fee),
    ttlMs: Number(j.ttl_ms),
    sourceNamespace: String(j.source_namespace),
    agentLabel: String(j.agent_label),
    memoryCount: Number(j.memory_count),
    subscriberCount: Number(j.subscriber_count),
    firstMemoryAtMs: Number(j.first_memory_at_ms),
    lastMemoryAtMs: Number(j.last_memory_at_ms),
    previewBlobIds: (j.preview_blob_ids as string[]) ?? [],
  };
}

/**
 * 구독 기간이 이보다 짧은 팩은 목록에 띄우지 않는다.
 * `e2e.ts` 가 만료를 시연하려고 만드는 60초짜리 테스트 팩을 걸러내기 위한 것이고,
 * 실제 상품으로도 몇 분짜리 구독은 팔 물건이 아니다.
 */
const MIN_LISTED_TTL_MS = 5 * 60 * 1000;

/** `.env` 의 MARKET_HIDDEN_PACKS 에 쉼표로 나열한 팩은 숨긴다. */
const hiddenPacks = new Set(
  (process.env.MARKET_HIDDEN_PACKS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const PACK_CREATED = () => `${PACKAGE_ID}::market::PackCreated`;

/** 풀노드 gRPC 이벤트 색인 — 빠르지만 최근 체크포인트만 들고 있다. */
async function packIdsFromGrpc(limit: number): Promise<string[]> {
  const res = await suiClient.listEvents({ filter: { eventType: PACK_CREATED() }, limit });
  return res.events
    .map((e) => (e.json as { pack_id?: string } | null)?.pack_id)
    .filter((v): v is string => typeof v === 'string');
}

/**
 * GraphQL 색인 — 전체 이력을 들고 있다. 오래된 팩이 gRPC 에서 사라지는 걸 메운다.
 * (config.ts 의 GRAPHQL_URL 주석 참고. 한 페이지 상한이 50 이다.)
 */
async function packIdsFromGraphql(limit: number): Promise<string[]> {
  const first = Math.min(Math.max(limit, 1), 50);
  const query = `{ events(filter: { type: "${PACK_CREATED()}" }, first: ${first}) { nodes { contents { json } } } }`;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status} ${res.statusText}`);
  const body = (await res.json()) as {
    data?: { events?: { nodes?: { contents?: { json?: { pack_id?: string } | null } | null }[] } };
    errors?: { message?: string }[];
  };
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return (body.data?.events?.nodes ?? [])
    .map((n) => n.contents?.json?.pack_id)
    .filter((v): v is string => typeof v === 'string');
}

/**
 * PackCreated 이벤트로 시장의 팩을 나열한다.
 * 두 색인(GraphQL = 전체 이력, gRPC = 최신)을 합집합으로 쓴다. 한쪽이 죽어도 목록은 나오고,
 * 둘 다 죽으면 그때 예외를 올린다.
 * @param includeAll true 면 테스트 팩까지 전부 (점검용)
 */
export async function listPacks(limit = 50, includeAll = false): Promise<PackInfo[]> {
  const [gql, grpc] = await Promise.allSettled([packIdsFromGraphql(limit), packIdsFromGrpc(limit)]);
  if (gql.status === 'rejected' && grpc.status === 'rejected') throw grpc.reason;
  // GraphQL 이 체크포인트 오름차순이라 그걸 앞에 두고, gRPC 에만 있는(= 색인이 아직 안 따라온) 팩을 뒤에 붙인다.
  const ids = [
    ...(gql.status === 'fulfilled' ? gql.value : []),
    ...(grpc.status === 'fulfilled' ? grpc.value : []),
  ];
  const packs = await Promise.all([...new Set(ids)].map((id) => getPack(id).catch(() => null)));
  const all = packs.filter((p): p is PackInfo => p !== null);
  if (includeAll) return all;
  return all.filter(
    (p) => p.ttlMs >= MIN_LISTED_TTL_MS && p.memoryCount > 0 && !hiddenPacks.has(p.packId),
  );
}

// ── dynamic field 디코딩 ──

const ReceiptKeyBcs = bcs.struct('ReceiptKey', { subscription_id: bcs.Address });
const ReceiptBcs = bcs.struct('Receipt', {
  subscriber: bcs.Address,
  outcome: bcs.u8(),
  evidence_blob_id: bcs.string(),
  at_ms: bcs.u64(),
});
const RetractKeyBcs = bcs.struct('RetractKey', { blob_id: bcs.string() });
const RetractionBcs = bcs.struct('Retraction', { reason: bcs.u8(), at_ms: bcs.u64() });

export interface ReceiptInfo {
  subscriptionId: string;
  subscriber: string;
  /** 0 unresolved · 1 partial · 2 resolved */
  outcome: number;
  evidenceBlobId: string;
  atMs: number;
}
export interface RetractionInfo {
  blobId: string;
  /** 1 model-changed · 2 wrong · 3 sdk-changed */
  reason: number;
  atMs: number;
}
export interface PackFields {
  /** 등록된 암호화 블롭 (폐기분 포함) */
  blobIds: string[];
  retracted: RetractionInfo[];
  receipts: ReceiptInfo[];
}

const isStringType = (t: string | undefined) => !!t && /::string::String$/.test(t);
const isReceiptKey = (t: string | undefined) => !!t && /::market::ReceiptKey$/.test(t);
const isRetractKey = (t: string | undefined) => !!t && /::market::RetractKey$/.test(t);

/**
 * 팩의 dynamic field 를 한 번 훑어 블롭·영수증·폐기를 모두 꺼낸다.
 * 값이 페이지에 실려 오지 않는 노드면 getDynamicField 로 하나씩 보충한다.
 */
export async function listPackFields(packId: string, limit = 500): Promise<PackFields> {
  const out: PackFields = { blobIds: [], retracted: [], receipts: [] };
  let cursor: string | null = null;
  let seen = 0;
  for (;;) {
    const page: Awaited<ReturnType<typeof suiClient.listDynamicFields<{ value: true }>>> =
      await suiClient.listDynamicFields({
        parentId: packId,
        limit: 50,
        cursor,
        include: { value: true },
      });
    for (const f of page.dynamicFields) {
      seen++;
      const t = f.name.type;
      try {
        if (isStringType(t)) {
          out.blobIds.push(bcs.string().parse(f.name.bcs));
        } else if (isRetractKey(t)) {
          const { blob_id } = RetractKeyBcs.parse(f.name.bcs);
          const v = await fieldValue(packId, f);
          const r = RetractionBcs.parse(v);
          out.retracted.push({ blobId: blob_id, reason: r.reason, atMs: Number(r.at_ms) });
        } else if (isReceiptKey(t)) {
          const { subscription_id } = ReceiptKeyBcs.parse(f.name.bcs);
          const v = await fieldValue(packId, f);
          const r = ReceiptBcs.parse(v);
          out.receipts.push({
            subscriptionId: subscription_id,
            subscriber: r.subscriber,
            outcome: r.outcome,
            evidenceBlobId: r.evidence_blob_id,
            atMs: Number(r.at_ms),
          });
        }
        // 그 밖의 필드는 우리 규약이 아니다 — 건너뛴다
      } catch (e) {
        console.error(`[market] dynamic field 해석 실패 (${t}): ${String(e).slice(0, 100)}`);
      }
    }
    if (!page.hasNextPage || seen >= limit) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return out;
}

async function fieldValue(
  parentId: string,
  f: { name: { type: string; bcs: Uint8Array }; value?: { bcs: Uint8Array } },
): Promise<Uint8Array> {
  if (f.value && f.value.bcs.length > 0) return f.value.bcs;
  const { dynamicField } = await suiClient.getDynamicField({ parentId, name: f.name });
  return dynamicField.value.bcs;
}

/**
 * 팩에 등록된 암호화 블롭 ID들 (폐기분 포함).
 * `publish` 가 dynamic field 의 **키**로 blob_id(Move String)를 쓰므로 필드 이름을 BCS 로 디코딩한다.
 */
export async function listPackBlobIds(packId: string, limit = 200): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null | undefined = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof suiClient.listDynamicFields>> =
      await suiClient.listDynamicFields({ parentId: packId, limit: 50, cursor });
    for (const f of page.dynamicFields) {
      // RetractKey{blob_id: String} 은 String 과 BCS 레이아웃이 같아서 타입으로 걸러야 한다
      if (!isStringType(f.name.type)) continue;
      try {
        out.push(bcs.string().parse(f.name.bcs));
      } catch {
        /* 우리 규약이 아닌 필드는 건너뛴다 */
      }
    }
    if (!page.hasNextPage || out.length >= limit) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return out.slice(0, limit);
}

/** 폐기된 블롭 (RetractKey dynamic field) */
export async function listRetracted(packId: string): Promise<RetractionInfo[]> {
  return (await listPackFields(packId)).retracted;
}

/** 영수증 (ReceiptKey dynamic field) */
export async function listReceipts(packId: string): Promise<ReceiptInfo[]> {
  return (await listPackFields(packId)).receipts;
}

/** 폐기분을 뺀, 구독자가 받아야 할 블롭 */
export async function listActiveBlobIds(packId: string) {
  const f = await listPackFields(packId);
  const retracted = new Set(f.retracted.map((r) => r.blobId));
  return {
    active: f.blobIds.filter((b) => !retracted.has(b)),
    retracted: f.retracted,
    receipts: f.receipts,
  };
}

// ── 미리보기 / manifest ──

const looksBinary = (b: Uint8Array) =>
  (b[0] === 0xff && b[1] === 0xd8) || // JPEG
  (b[0] === 0x89 && b[1] === 0x50) || // PNG
  (b[0] === 0x47 && b[1] === 0x49); // GIF

/** 평문 미리보기 텍스트 (이미지·manifest JSON 은 제외) */
export async function readPreviews(pack: PackInfo): Promise<string[]> {
  const out: string[] = [];
  for (const blobId of pack.previewBlobIds) {
    try {
      const bytes = await readBlob(blobId);
      if (looksBinary(bytes)) continue;
      const text = dec.decode(bytes);
      if (parseManifest(text)) continue;
      out.push(text);
    } catch {
      /* 미리보기 하나 실패는 무시 */
    }
  }
  return out;
}

/** 미리보기 중 mm.manifest/1 — 여러 번 발행됐으면 가장 최근 것 */
export async function readManifest(pack: PackInfo): Promise<Manifest | null> {
  for (const blobId of [...pack.previewBlobIds].reverse()) {
    try {
      const bytes = await readBlob(blobId);
      if (looksBinary(bytes)) continue;
      const m = parseManifest(dec.decode(bytes));
      if (m) return m;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** manifest 의 after 미리보기 바이트가 after_sha256 과 맞는지. null = 확인 불가 */
export async function verifyAfterPreview(m: Manifest): Promise<boolean | null> {
  if (!m.previews?.after || !m.after_sha256) return null;
  try {
    const bytes = await readBlob(m.previews.after);
    return sha256Hex(bytes) === m.after_sha256;
  } catch {
    return null;
  }
}
