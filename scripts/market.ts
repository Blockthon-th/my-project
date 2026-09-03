/**
 * Memory Market 온체인 조작 (팩 생성/등록/구독/조회).
 * sync 스크립트와 MCP 서버가 공유한다.
 */
import { EncryptedObject, SealClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex, SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import type { Signer } from '@mysten/sui/cryptography';
import {
  KEY_SERVERS,
  PACKAGE_ID,
  SEAL_THRESHOLD,
  readBlob,
  storeBlob,
  suiClient,
} from './config.js';
import { createSessionKey } from './session.js';
import { createdId, execute } from './tx.js';

export const newSealClient = () =>
  new SealClient({ suiClient, serverConfigs: KEY_SERVERS, verifyKeyServers: false });

const enc = new TextEncoder();
const dec = new TextDecoder();

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
  };
}

/** 기억 하나를 Seal 로 암호화 → Walrus 업로드 → 팩에 등록 */
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
    packageId: PACKAGE_ID,
    id,
    data: enc.encode(memory.text),
  });
  const blobId = await storeBlob(encryptedObject);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::market::publish`,
    arguments: [
      tx.object(packId),
      tx.object(capId),
      tx.pure.string(blobId),
      tx.pure.u64(memory.at),
    ],
  });
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
  tx.moveCall({
    target: `${PACKAGE_ID}::market::add_preview`,
    arguments: [tx.object(packId), tx.object(capId), tx.pure.string(blobId)],
  });
  await execute(tx, signer);
  return blobId;
}

// ───────────────────────── 구독자 ─────────────────────────

export async function subscribe(signer: Signer, packId: string, feeMist: number) {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [feeMist]);
  tx.moveCall({
    target: `${PACKAGE_ID}::market::subscribe_entry`,
    arguments: [tx.object(packId), coin, tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  const res = await execute(tx, signer);
  return createdId(res, '::market::Subscription');
}

/** 구독자가 가진 유효 구독권 중 이 팩의 것을 찾는다 */
export async function findSubscription(address: string, packId: string) {
  const res = await suiClient.listOwnedObjects({
    owner: address,
    type: `${PACKAGE_ID}::market::Subscription`,
    include: { content: true },
    limit: 50,
  });
  for (const obj of res.objects) {
    const fields = await readSubscription(obj.objectId);
    if (fields?.packId === packId) return { id: obj.objectId, ...fields };
  }
  return null;
}

async function readSubscription(objectId: string) {
  const { object } = await suiClient.getObject({ objectId, include: { json: true } });
  const j = (object as { json?: Record<string, unknown> }).json;
  if (!j) return null;
  return {
    packId: String(j.pack_id),
    expiresAtMs: Number(j.expires_at_ms),
  };
}

/** 구독권으로 팩의 기억들을 복호화한다 */
export async function decryptMemories(
  signer: Signer,
  address: string,
  seal: SealClient,
  packId: string,
  subscriptionId: string,
  blobIds: string[],
): Promise<string[]> {
  const sessionKey = await createSessionKey(signer, address);
  const out: string[] = [];
  for (const blobId of blobIds) {
    const data = await readBlob(blobId);
    const fullId = EncryptedObject.parse(data).id;
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::market::seal_approve`,
      arguments: [
        tx.pure.vector('u8', fromHex(fullId)),
        tx.object(subscriptionId),
        tx.object(packId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    const plain = await seal.decrypt({ data, sessionKey, txBytes });
    out.push(dec.decode(plain));
  }
  return out;
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

/**
 * PackCreated 이벤트로 시장의 팩을 나열한다.
 * @param includeAll true 면 테스트 팩까지 전부 (점검용)
 */
export async function listPacks(limit = 50, includeAll = false): Promise<PackInfo[]> {
  const res = await suiClient.listEvents({
    filter: { eventType: `${PACKAGE_ID}::market::PackCreated` },
    limit,
  });
  const ids = res.events
    .map((e) => (e.json as { pack_id?: string } | null)?.pack_id)
    .filter((v): v is string => typeof v === 'string');
  const packs = await Promise.all([...new Set(ids)].map((id) => getPack(id).catch(() => null)));
  const all = packs.filter((p): p is PackInfo => p !== null);
  if (includeAll) return all;
  return all.filter(
    (p) => p.ttlMs >= MIN_LISTED_TTL_MS && p.memoryCount > 0 && !hiddenPacks.has(p.packId),
  );
}

/**
 * 팩에 등록된 암호화 블롭 ID들.
 * `publish` 가 dynamic field 의 **키**로 blob_id(Move String)를 쓰므로, 필드 이름을 BCS 로 디코딩한다.
 */
export async function listPackBlobIds(packId: string, limit = 200): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null | undefined = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof suiClient.listDynamicFields>> =
      await suiClient.listDynamicFields({ parentId: packId, limit: 50, cursor });
    for (const f of page.dynamicFields) {
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

export async function readPreviews(pack: PackInfo): Promise<string[]> {
  const out: string[] = [];
  for (const blobId of pack.previewBlobIds) {
    try {
      out.push(dec.decode(await readBlob(blobId)));
    } catch {
      /* 미리보기 하나 실패는 무시 */
    }
  }
  return out;
}
