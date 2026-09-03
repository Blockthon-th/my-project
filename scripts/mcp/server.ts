/**
 * Memory Market MCP 서버 — 구독자 에이전트(Claude Code 등)가 붙어서 쓰는 도구들.
 *
 * 도구:
 *   market_list      : 시장에 올라온 기억 팩 목록 (출처 이력 포함)
 *   market_preview   : 팩의 무료 미리보기 기억
 *   market_subscribe : 팩 구독 (SUI 결제 → 구독권 발급)
 *   market_recall    : 구독한 팩에서 질문과 관련된 기억을 꺼내온다
 *
 * 등록 (Claude Code):
 *   claude mcp add memory-market -- npx tsx <이 파일의 절대경로>
 * 또는 .mcp.json 에:
 *   { "mcpServers": { "memory-market": { "command": "npx", "args": ["tsx", "scripts/mcp/server.ts"] } } }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { explorerObject, keypairFrom, USER_CONFIG_PATH } from '../config.js';
import {
  decryptMemories,
  findSubscription,
  getPack,
  listPackBlobIds,
  listPacks,
  newSealClient,
  readPreviews,
  subscribe,
} from '../market.js';

/**
 * 지갑은 도구를 실제로 쓸 때 만든다.
 * 설정이 없다고 서버가 시작 단계에서 죽으면 클라이언트에는 그냥 "failed" 로만 보여서
 * 사용자가 이유를 알 수 없다. 도구는 뜨게 두고, 호출 시점에 무엇을 해야 하는지 알려준다.
 */
let wallet: { signer: ReturnType<typeof keypairFrom>; address: string } | null = null;
function hasWallet(): boolean {
  try {
    requireWallet();
    return true;
  } catch {
    return false;
  }
}

function requireWallet() {
  if (!wallet) {
    const signer = keypairFrom('BUYER_SUI_PRIVATE_KEY');
    wallet = { signer, address: signer.toSuiAddress() };
  }
  return wallet;
}

const SETUP_HINT = [
  '구독에 쓸 지갑이 설정되지 않았습니다.',
  `사용자 설정 파일을 만드세요 (한 번만 하면 모든 프로젝트에 적용):`,
  `  ${USER_CONFIG_PATH}`,
  '  {',
  '    "BUYER_SUI_PRIVATE_KEY": "suiprivkey1..."',
  '  }',
  '',
  'Sui CLI 로 키를 만들고 꺼내는 법:',
  '  sui client new-address ed25519',
  '  sui client faucet --address <새 주소>          # testnet 무료 가스',
  '  sui keytool export --key-identity <새 주소>    # suiprivkey1... 출력',
].join('\n');

/** 복호화한 기억 캐시 (팩별). 매 recall 마다 전체를 다시 복호화하지 않도록. */
const cache = new Map<string, { at: number; memories: string[] }>();
const CACHE_MS = 60_000;

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const mist = (n: number) => `${(n / 1e9).toFixed(4)} SUI`;
const days = (ms: number) => `${(ms / 86_400_000).toFixed(1)}일`;

async function loadMemories(packId: string): Promise<string[]> {
  const hit = cache.get(packId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.memories;

  const { signer, address } = requireWallet();
  const sub = await findSubscription(address, packId);
  if (!sub) throw new Error('이 팩을 구독하고 있지 않습니다. market_subscribe 를 먼저 쓰세요.');
  if (sub.expiresAtMs < Date.now()) {
    throw new Error(
      `구독이 만료되었습니다 (${new Date(sub.expiresAtMs).toLocaleString()}). 다시 구독하세요.`,
    );
  }
  const blobIds = await listPackBlobIds(packId);
  const memories = await decryptMemories(signer, address, newSealClient(), packId, sub.id, blobIds);
  cache.set(packId, { at: Date.now(), memories });
  return memories;
}

/** 아주 단순한 키워드 점수 — 임베딩 없이도 데모가 되게 */
function rank(memories: string[], query: string, limit: number): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9가-힣_.]+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return memories.slice(0, limit);
  return memories
    .map((m) => {
      const lower = m.toLowerCase();
      const score = terms.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

const server = new McpServer(
  { name: 'memory-market', version: '0.1.0' },
  {
    instructions: [
      'Memory Market 은 다른 개발자의 에이전트가 실제 작업에서 쌓은 기억(실패한 시도와 그 원인, 문서에 없는 동작)을',
      '기간제로 빌려 쓰는 시장이다. 여기 있는 내용은 공식 문서·검색·모델 학습 데이터 어디에도 없다.',
      '',
      'Sui / Move / Walrus / Seal / MemWal 관련 오류나 설명되지 않는 동작을 만나면,',
      '**로컬 코드를 뒤지기 전에 먼저 market_recall 을 호출하라.** 이전 소유자가 같은 지점에서',
      '이미 막혔고 원인을 밝혀 두었을 가능성이 높다. 특히 다음 경우에 유용하다:',
      '- 에러 메시지가 실제 원인과 다른 것을 가리킬 때',
      '- 공식 예제대로 했는데 동작하지 않을 때',
      '- SDK 버전·API 변경으로 검색 결과가 낡았을 때',
      '',
      '아직 구독 중이 아니면 market_list → market_preview → market_subscribe 순서로 진행하라.',
    ].join('\n'),
  },
);

server.registerTool(
  'market_list',
  {
    description:
      [
        '기억 시장에 올라온 팩 목록.',
        '각 팩은 어떤 에이전트가 어느 기간에 걸쳐 몇 건을 쌓았는지(출처 이력)와 가격·구독 기간을 보여준다.',
        '처음 다루는 기술 스택으로 작업을 시작하거나, market_recall 이 "구독하고 있지 않다"고 답하면 이 도구를 쓴다.',
      ].join(' '),
    inputSchema: {},
  },
  async () => {
    const packs = await listPacks();
    if (packs.length === 0) return text('시장에 올라온 팩이 없습니다.');
    const lines = packs.map((p) => {
      const span =
        p.firstMemoryAtMs && p.lastMemoryAtMs
          ? `${new Date(p.firstMemoryAtMs).toISOString().slice(0, 10)} ~ ${new Date(p.lastMemoryAtMs).toISOString().slice(0, 10)}`
          : '기간 정보 없음';
      return [
        `## ${p.name}`,
        `- pack: ${p.packId}`,
        `- ${p.description}`,
        `- 기억 ${p.memoryCount}건 · 구독자 ${p.subscriberCount}명`,
        `- 출처: ${p.agentLabel} / ${p.sourceNamespace} · ${span}`,
        `- 가격 ${mist(p.feeMist)} / ${days(p.ttlMs)}`,
      ].join('\n');
    });
    return text(lines.join('\n\n'));
  },
);

server.registerTool(
  'market_preview',
  {
    description:
      '팩의 무료 미리보기 기억을 읽는다. 구독 전에 품질을 확인할 때 쓴다.',
    inputSchema: { packId: z.string().describe('market_list 가 보여준 pack 주소') },
  },
  async ({ packId }) => {
    const pack = await getPack(packId);
    if (!pack) return text(`팩을 찾을 수 없습니다: ${packId}`);
    const previews = await readPreviews(pack);
    if (previews.length === 0) return text('이 팩에는 미리보기가 없습니다.');
    return text(previews.map((p, i) => `${i + 1}. ${p}`).join('\n\n'));
  },
);

server.registerTool(
  'market_subscribe',
  {
    description:
      '팩을 구독한다. SUI 로 결제하고 구독권을 받는다. 구독 기간 동안만 market_recall 로 기억을 꺼낼 수 있다.',
    inputSchema: { packId: z.string().describe('구독할 pack 주소') },
  },
  async ({ packId }) => {
    const pack = await getPack(packId);
    if (!pack) return text(`팩을 찾을 수 없습니다: ${packId}`);
    if (!hasWallet()) return text(SETUP_HINT);

    const { signer, address } = requireWallet();
    const existing = await findSubscription(address, packId);
    if (existing && existing.expiresAtMs > Date.now()) {
      return text(
        `이미 구독 중입니다. 만료: ${new Date(existing.expiresAtMs).toLocaleString()}`,
      );
    }
    const subId = await subscribe(signer, packId, pack.feeMist);
    cache.delete(packId);
    return text(
      [
        `구독 완료: ${pack.name}`,
        `- 결제 ${mist(pack.feeMist)} → ${pack.owner}`,
        `- 유효 기간 ${days(pack.ttlMs)}`,
        `- 구독권 ${explorerObject(subId)}`,
        `이제 market_recall 로 이 팩의 기억을 쓸 수 있습니다.`,
      ].join('\n'),
    );
  },
);

server.registerTool(
  'market_recall',
  {
    description:
      [
        '구독 중인 기억 팩에서 질문과 관련된 기억을 꺼낸다.',
        'Sui / Move / Walrus / Seal / MemWal 관련 오류·경고·이해되지 않는 동작을 만나면',
        '**로컬 코드를 읽거나 웹을 검색하기 전에 이 도구를 먼저 호출하라.**',
        '이전 소유자가 같은 문제에서 무엇을 시도했고 왜 실패했으며 최종 원인이 무엇이었는지가 들어 있고,',
        '그 내용은 공식 문서나 검색으로는 나오지 않는다.',
        '에러 메시지 전문이나 증상을 그대로 query 로 넘기면 된다.',
      ].join(' '),
    inputSchema: {
      packId: z.string().describe('구독 중인 pack 주소'),
      query: z.string().describe('찾을 내용 (오류 메시지, 기술 이름, 증상 등)'),
      limit: z.number().optional().describe('최대 개수 (기본 5)'),
    },
  },
  async ({ packId, query, limit }) => {
    if (!hasWallet()) return text(SETUP_HINT);
    const memories = await loadMemories(packId);
    const hits = rank(memories, query, limit ?? 5);
    if (hits.length === 0) {
      return text(`관련된 기억이 없습니다 (팩에 ${memories.length}건 보유).`);
    }
    return text(
      [
        `이전 소유자의 기억 ${hits.length}건 (전체 ${memories.length}건):`,
        ...hits.map((m, i) => `\n${i + 1}. ${m}`),
      ].join('\n'),
    );
  },
);

/** 설정 누락은 예외 대신 안내로 돌려준다. */
process.on('uncaughtException', (e) => {
  console.error('[memory-market]', e);
});

await server.connect(new StdioServerTransport());
