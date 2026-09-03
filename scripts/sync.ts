/**
 * 판매자 sync: 기억 수집 → 개인정보 필터 → Seal 암호화 → Walrus 업로드 → 팩에 등록.
 *
 * 주기적으로 돌리면 팩이 "살아 있는" 상품이 된다(새 기억이 구독자에게 바로 보임).
 * 이미 올린 기억은 `.sync-state.json` 의 해시로 건너뛴다.
 *
 * 실행: npm run sync            (팩이 없으면 만들고 .env 에 MARKET_PACK_ID/CAP_ID 기록)
 *      npm run sync -- --dry   (필터 결과만 보고 아무것도 올리지 않음)
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explorerObject, keypairFrom } from './config.js';
import { filterMemories } from './filter.js';
import { collect, type Memory } from './memories.js';
import { createPack, getPack, newSealClient, publishMemory, publishPreview } from './market.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const STATE_FILE = resolve(here, '.sync-state.json');
const ENV_FILE = resolve(ROOT, '.env');

const DRY = process.argv.includes('--dry');

const PACK = {
  name: process.env.PACK_NAME ?? 'Sui 온보딩 실전 기억',
  description:
    process.env.PACK_DESCRIPTION ??
    'Sui / Move / Walrus / Seal 를 처음부터 붙이며 실제로 막혔던 지점과 해결책. 문서에 없는 것 위주.',
  feeMist: Number(process.env.PACK_FEE_MIST ?? 10_000_000), // 0.01 SUI
  ttlMs: Number(process.env.PACK_TTL_MS ?? 24 * 60 * 60 * 1000), // 24시간
  sourceNamespace: process.env.MEMWAL_NAMESPACE ?? 'sui-dev',
  agentLabel: process.env.AGENT_LABEL ?? 'claude-code',
};

const hash = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 16);

async function loadState(): Promise<{ published: string[] }> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { published: [] };
  }
}

async function saveState(state: { published: string[] }) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

/** .env 에 키=값 을 기록(있으면 교체) */
async function writeEnv(entries: Record<string, string>) {
  let lines: string[] = [];
  try {
    lines = (await readFile(ENV_FILE, 'utf8')).split('\n');
  } catch {
    /* 없으면 새로 만든다 */
  }
  for (const [k, v] of Object.entries(entries)) {
    lines = lines.filter((l) => !l.startsWith(`${k}=`));
    lines.push(`${k}=${v}`);
  }
  await writeFile(ENV_FILE, lines.filter((l) => l.trim() !== '').join('\n') + '\n');
}

async function ensurePack(signer: ReturnType<typeof keypairFrom>) {
  const packId = process.env.MARKET_PACK_ID;
  const capId = process.env.MARKET_CAP_ID;
  if (packId && capId) {
    const pack = await getPack(packId);
    if (pack) {
      console.log(`기존 팩 사용: ${pack.name} (${pack.memoryCount}건 등록됨)`);
      return { packId, capId };
    }
    console.log('.env 의 팩을 체인에서 찾지 못함 → 새로 만든다');
  }
  console.log('팩 생성 중...');
  const created = await createPack(signer, PACK);
  await writeEnv({ MARKET_PACK_ID: created.packId, MARKET_CAP_ID: created.capId });
  console.log(`  팩 생성됨: ${created.packId}`);
  console.log(`  .env 에 MARKET_PACK_ID / MARKET_CAP_ID 기록`);
  return created;
}

async function main() {
  const seller = keypairFrom('SELLER_SUI_PRIVATE_KEY');

  console.log('1. 기억 수집...');
  const raw = await collect();
  console.log(`   ${raw.length}건`);

  console.log('2. 개인정보 필터...');
  const { kept, dropped, redactions } = filterMemories(raw);
  console.log(`   통과 ${kept.length}건 / 제외 ${dropped.length}건 / 가림 ${redactions}곳`);
  for (const d of dropped) console.log(`   ✗ [${d.reason}] ${d.text}…`);

  const state = await loadState();
  const fresh = kept.filter((m) => !state.published.includes(hash(m.text)));
  console.log(`3. 새로 올릴 기억: ${fresh.length}건 (이미 올림 ${kept.length - fresh.length}건)`);

  if (DRY) {
    console.log('\n--dry 모드: 여기까지. 올릴 내용 미리보기:');
    fresh.slice(0, 5).forEach((m, i) => console.log(`   ${i + 1}. ${m.text.slice(0, 100)}…`));
    return;
  }
  if (fresh.length === 0) {
    console.log('올릴 것이 없습니다.');
    return;
  }

  const { packId, capId } = await ensurePack(seller);
  const seal = newSealClient();

  console.log('4. 암호화 → 업로드 → 등록...');
  let ok = 0;
  for (const m of fresh) {
    try {
      const blobId = await publishMemory(seller, seal, packId, capId, m);
      state.published.push(hash(m.text));
      await saveState(state);
      ok++;
      console.log(`   ✓ ${ok}/${fresh.length} ${blobId.slice(0, 12)}… ${m.text.slice(0, 50)}…`);
    } catch (e) {
      console.error(`   ✗ 실패: ${m.text.slice(0, 50)}… → ${e}`);
    }
  }

  // 미리보기가 없으면 가장 짧은 기억 2개를 평문으로 공개
  const pack = await getPack(packId);
  if (pack && pack.previewBlobIds.length === 0) {
    console.log('5. 미리보기 등록...');
    const samples = [...kept].sort((a, b) => a.text.length - b.text.length).slice(0, 2);
    for (const s of samples) {
      await publishPreview(seller, packId, capId, s.text);
      console.log(`   ✓ ${s.text.slice(0, 50)}…`);
    }
  }

  console.log(`\n완료. ${explorerObject(packId)}`);
}

main().catch((e) => {
  console.error('\n실패:', e);
  process.exit(1);
});
