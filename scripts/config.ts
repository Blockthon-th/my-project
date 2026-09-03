import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// .env 는 프로젝트 루트에 있다. 실행 위치(scripts/)와 무관하게 찾도록 절대 경로로 지정.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '..', '.env') });

export const NETWORK = 'testnet' as const;
export const PACKAGE_ID = req('MARKET_PACKAGE_ID');

/**
 * 공개 풀노드는 JSON-RPC를 중단했다(Method not found / JsonRpcError).
 * 이제 gRPC(gRPC-web)로 붙는다. SDK는 반드시 @mysten/sui 2.x 이상 —
 * 1.x 의 gRPC 클라이언트는 transaction resolution 미지원 + read_mask 불일치로 현재 노드와 통신이 안 된다.
 */
export const GRPC_URL = process.env.SUI_GRPC_URL ?? 'https://fullnode.testnet.sui.io:443';
export const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC_URL });

/**
 * Seal 키 서버 (testnet). 두 가지 선택지:
 *  - independent (기본): 독립 운영 서버 2대, threshold 2. **현재 동작 확인된 조합.**
 *  - committee: 탈중앙 모드(aggregator 경유). 2026-09 기준 testnet 에서 세션 키 인증서를
 *    ttlMin=1 로 낮춰도 InvalidCertificate 로 거부한다(원인 미상, 서버 측 문제로 보임).
 * `.env` 의 SEAL_KEY_SERVERS 로 전환.
 */
const COMMITTEE_SERVERS = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    weight: 1,
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  },
];
const INDEPENDENT_SERVERS = [
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
];

export const SEAL_MODE = (process.env.SEAL_KEY_SERVERS ?? 'independent') as
  | 'committee'
  | 'independent';
export const KEY_SERVERS = SEAL_MODE === 'committee' ? COMMITTEE_SERVERS : INDEPENDENT_SERVERS;
export const SEAL_THRESHOLD = KEY_SERVERS.length;

/**
 * 세션 키 유효 시간(분).
 * 키 서버는 `session_key_ttl_max` 를 넘는 TTL 을 거부하고, SDK 는 그 응답을
 * `ExpiredSessionKeyError` 로 보여준다(실제 서버 코드: InvalidCertificate).
 * 서버 기본값은 30분이지만 배포에 따라 더 짧게 설정된 곳이 있다. 5분이면 대체로 안전.
 */
export const SEAL_SESSION_TTL_MIN = Number(process.env.SEAL_SESSION_TTL_MIN ?? 5);

/** Walrus testnet 공개 엔드포인트 */
export const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
export const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
/** blob 보관 기간 (epoch) */
export const WALRUS_EPOCHS = 1;

export function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`.env 에 ${name} 이 없습니다. .env.example 참고`);
  return v;
}

/** `suiprivkey1...` 형식의 키에서 keypair 생성 */
export function keypairFrom(envName: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(req(envName));
}

/** Walrus에 바이트를 올리고 blobId 반환 */
export async function storeBlob(bytes: Uint8Array): Promise<string> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${WALRUS_EPOCHS}`, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`Walrus 업로드 실패 ${res.status}: ${await res.text()}`);
  const info = await res.json();
  const blobId: string | undefined =
    info?.newlyCreated?.blobObject?.blobId ?? info?.alreadyCertified?.blobId;
  if (!blobId) throw new Error(`blobId 를 찾지 못함: ${JSON.stringify(info)}`);
  return blobId;
}

/** Walrus에서 blob 내려받기 */
export async function readBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus 다운로드 실패 ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const explorerObject = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;
export const explorerTx = (d: string) => `https://suiscan.xyz/${NETWORK}/tx/${d}`;

/**
 * PC 시계와 서버 시계의 차이를 잰다.
 * Seal 세션 키에는 클라이언트가 찍은 생성 시각이 들어가고, 키 서버가 자기 시계와 비교해 검증한다.
 * 시계가 몇 분만 어긋나도 서버가 인증서를 거부하고, SDK는 이를 `ExpiredSessionKeyError`
 * ("Session key has expired") 로 보여준다 — 실제 원인은 만료가 아니라 시계 오차다.
 */
export async function clockSkewMs(): Promise<number | null> {
  try {
    const res = await fetch(WALRUS_AGGREGATOR, { method: 'HEAD' });
    const date = res.headers.get('date');
    if (!date) return null;
    return Date.now() - new Date(date).getTime();
  } catch {
    return null;
  }
}

/**
 * 시계 오차를 알린다.
 * 키 서버는 인증서 생성 시각이 **1ms라도 미래이면 거부**하므로(허용 오차 0),
 * PC 시계가 서버보다 빠르면 그 자체로 문제다. 다만 session.ts 가 생성 시각을
 * 서버 기준으로 되돌려주므로 여기서는 중단하지 않고 정보만 출력한다.
 */
export async function assertClockOk() {
  const skew = await clockSkewMs();
  if (skew === null) {
    console.log('  (시계 확인 실패 — 건너뜀)');
    return;
  }
  const sec = (skew / 1000).toFixed(1);
  if (skew > 0) {
    console.log(`  시계: PC가 서버보다 ${sec}초 빠름 → 세션 키 생성 시 보정함`);
  } else {
    console.log(`  시계: PC가 서버보다 ${Math.abs(Number(sec))}초 느림 — 문제없음`);
  }
  if (Math.abs(skew) > 120_000) {
    throw new Error(
      `시계 오차가 ${sec}초로 너무 큽니다. 관리자 PowerShell 에서 맞추세요:\n` +
        `  net start w32time; w32tm /resync /force`,
    );
  }
}
