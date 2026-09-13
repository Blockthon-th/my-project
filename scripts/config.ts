import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

/**
 * 설정을 찾는 순서. 위로 갈수록 우선한다.
 *
 *  1. 환경변수 (CI·컨테이너)
 *  2. 작업 중인 프로젝트의 `.env` (저장소 개발용)
 *  3. **사용자 단위 설정** `~/.memory-market/config.json` (플러그인 사용자의 정상 경로)
 *
 * 비밀키는 플러그인과 함께 배포되지 않는다, 지갑은 사람마다 다르고, 플러그인은 모두가
 * 같은 코드를 받기 때문이다. MemWal 도 같은 구조로, 코드는 플러그인에 두고 자격 증명은
 * 로그인 절차로 `~/.memwal/credentials.json` 에 따로 만든다.
 *
 * quiet: true 필수, dotenv 가 stdout 에 로그를 찍으면 MCP 의 stdio JSON-RPC 스트림이 깨진다.
 */
const here = dirname(fileURLToPath(import.meta.url));

for (const p of [
  process.env.MEMORY_MARKET_ENV,
  resolve(process.cwd(), '.env'),
  resolve(here, '..', '.env'),
  resolve(here, '..', '..', '.env'),
]) {
  if (p && existsSync(p)) {
    loadEnv({ path: p, quiet: true });
    break;
  }
}

/** 사용자 단위 설정 파일. 한 번 만들어두면 어느 프로젝트에서든 쓰인다. */
export const USER_CONFIG_PATH = resolve(homedir(), '.memory-market', 'config.json');

function loadUserConfig(): Record<string, string> {
  try {
    if (!existsSync(USER_CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
const userConfig = loadUserConfig();

/** 환경변수 → .env → 사용자 설정 순으로 찾는다. */
function setting(name: string): string | undefined {
  return process.env[name] ?? userConfig[name];
}

export const NETWORK = 'testnet' as const;
/**
 * 배포된 시장 컨트랙트. 공개 정보이므로 기본값을 넣어둔다 ·
 * 구독자가 따로 설정해야 하는 건 자기 지갑 키뿐이다.
 */
const DEFAULT_PACKAGE_ID =
  '0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196';
export const PACKAGE_ID = setting('MARKET_PACKAGE_ID') ?? DEFAULT_PACKAGE_ID;

/**
 * Seal 네임스페이스로 쓰는 패키지 ID.
 * Seal SDK 는 `SessionKey.create` / `encrypt` 의 packageId 가 **패키지의 첫 버전**이어야 한다고 검사한다
 * (`InvalidPackageError: Package … is not the first version`). 컨트랙트를 `sui client upgrade` 로 올리면
 * MARKET_PACKAGE_ID(최신, moveCall 대상)와 첫 버전 ID 가 달라지므로, 그때는 .env 에
 * SEAL_PACKAGE_ID=<첫 버전 ID> 를 둔다. 새로 배포(publish)했다면 둘이 같으므로 비워도 된다.
 */
export const SEAL_PACKAGE_ID = setting('SEAL_PACKAGE_ID') ?? PACKAGE_ID;

/**
 * 구매자 에이전트가 한 MCP 세션에서 구독에 쓸 수 있는 SUI 상한. market_acquire 가 검사한다.
 * 에이전트가 팩을 연달아 사며 지갑을 비우는 일을 막기 위한 것.
 */
export const MARKET_SPEND_CAP_SUI = parseSpendCap(setting('MARKET_SPEND_CAP_SUI'));
function parseSpendCap(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 0.5;
  const n = Number(raw);
  // NaN 이면 `spent + fee > NaN` 이 항상 false 라 상한이 사라진다. 이상한 값은 기본값으로 되돌리고 알린다.
  if (!Number.isFinite(n) || n < 0) {
    console.error(`[memory-market] MARKET_SPEND_CAP_SUI="${raw}" 는 0 이상의 숫자가 아닙니다 → 기본값 0.5 SUI 적용`);
    return 0.5;
  }
  return n;
}

/**
 * 공개 풀노드는 JSON-RPC를 중단했다(Method not found / JsonRpcError).
 * 이제 gRPC(gRPC-web)로 붙는다. SDK는 반드시 @mysten/sui 2.x 이상 ·
 * 1.x 의 gRPC 클라이언트는 transaction resolution 미지원 + read_mask 불일치로 현재 노드와 통신이 안 된다.
 */
export const GRPC_URL = setting('SUI_GRPC_URL') ?? 'https://fullnode.testnet.sui.io:443';
export const suiClient = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC_URL });

/**
 * 풀노드의 **이벤트 색인은 최근 체크포인트만** 들고 있다. 며칠 지난 PackCreated 는
 * gRPC `listEvents` 에서 아예 사라진다(2026-09-13 확인: 팩 6개 중 당일에 만든 1개만 돌아왔다).
 * GraphQL 색인은 전체 이력을 갖고 있어서 팩 목록을 만들 때 gRPC 와 합쳐서 쓴다.
 * 조회 전용이고 CORS 가 `*` 라 정적 랜딩(site/)도 같은 엔드포인트를 읽는다.
 */
export const GRAPHQL_URL = setting('SUI_GRAPHQL_URL') ?? 'https://graphql.testnet.sui.io/graphql';

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

export const SEAL_MODE = (setting('SEAL_KEY_SERVERS') ?? 'independent') as
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
export const SEAL_SESSION_TTL_MIN = Number(setting('SEAL_SESSION_TTL_MIN') ?? 5);

/** Walrus testnet 공개 엔드포인트 */
export const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
export const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
/**
 * blob 보관 기간 (epoch). testnet 1 epoch ≈ 1일.
 * 1 로 두면 데모 전날 올린 팩이 당일 사라진다, 30 으로 둔다. .env 의 WALRUS_EPOCHS 로 조정.
 */
export const WALRUS_EPOCHS = Number(setting('WALRUS_EPOCHS') ?? 30);

export function req(name: string): string {
  const v = setting(name);
  if (!v) {
    throw new Error(
      [
        `설정 ${name} 이 없습니다. 다음 중 하나로 넣으세요:`,
        `  1) 사용자 설정 (권장, 한 번만): ${USER_CONFIG_PATH}`,
        `     { "${name}": "..." }`,
        `  2) 프로젝트 .env: ${name}=...`,
        `  3) 환경변수`,
      ].join('\n'),
    );
  }
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
 * ("Session key has expired") 로 보여준다, 실제 원인은 만료가 아니라 시계 오차다.
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
    console.log('  (시계 확인 실패, 건너뜀)');
    return;
  }
  const sec = (skew / 1000).toFixed(1);
  if (skew > 0) {
    console.log(`  시계: PC가 서버보다 ${sec}초 빠름 → 세션 키 생성 시 보정함`);
  } else {
    console.log(`  시계: PC가 서버보다 ${Math.abs(Number(sec))}초 느림, 문제없음`);
  }
  if (Math.abs(skew) > 120_000) {
    throw new Error(
      `시계 오차가 ${sec}초로 너무 큽니다. 관리자 PowerShell 에서 맞추세요:\n` +
        `  net start w32time; w32tm /resync /force`,
    );
  }
}
