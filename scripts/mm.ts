/**
 * mm — Memory Market CLI (판매자·구매자 공용).
 *
 *   mm init      [--series id] [--domain design.web] [--entry index.html] [--pack id --cap id] [--name ..] [--brief ..]
 *   mm review    [--json] [--step N --lesson ".." --verdict accepted|rejected|partial --why ".."]
 *   mm publish   --pack <id> | --new  [--fee 0.05] [--ttl 7d] [--label claude-code] [--name ..] [--brief ..] [--cap id] [--dry-run]
 *   mm recall    --pack <id> [--sub <id>] [--fresh] [--out dir] [--json]
 *   mm retract   --pack <id> --step N --reason sdk-changed|model-changed|wrong [--blob id] [--cap id]
 *   mm receipt   --pack <id> --outcome resolved|partial|unresolved --evidence <path> [--sub id]
 *   mm baseline  --dir <folder> [--entry index.html] [--label name]
 *   mm state     [--pack id] [--live <dir>] [--applied "1:.hero a;3:nav"] [--evidence <json>]
 *
 * 프로젝트 폴더(.mm/ 가 있는 곳)는 --project, MM_PROJECT, INIT_CWD(npm run 이 호출된 곳), cwd 순으로 정한다.
 * .mm/ 의 형식은 tools/ 의 포집 훅과 공유한다:
 *   config.json  { entry, viewport, mobile, series_id, pack_id?, cap_id?, checks }
 *   pending.json { prompts, touched, edit_mode }
 *   state.json   { step, last_hash, prev_record_hash, published:{step:blobId}, uploads:{step:{blobId,...}} }
 *   steps/step-N.json (mm.step/1) · step-N.html · step-N.jpg · step-N.m.jpg
 *
 * 모든 tx 의 digest 는 demo/state/tx-log.jsonl 에 남고, compare-state.json 이 그걸 읽는다.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { explorerObject, explorerTx, keypairFrom, MARKET_SPEND_CAP_SUI, storeBlob } from './config.js';
import { EvidenceError, readEvidenceFile } from './evidence.js';
import {
  evidenceToLive,
  findExistingShot,
  loadCompareState,
  runCheck,
  saveCompareState,
  screenshotHtml,
  stateAbs,
  stateRel,
  type CompareState,
} from './demo-state.js';
import {
  createPack,
  decryptAll,
  encryptStep,
  findSubscription,
  getPack,
  isNoAccess,
  leaveReceipt,
  listActiveBlobIds,
  listPackBlobIds,
  listReceipts,
  newSealClient,
  normalizeObjectId,
  publishBatch,
  readManifest,
  readSubscription,
  retract as retractBlob,
  subscribeTx,
  uploadPreviewAssets,
} from './market.js';
import {
  CHECKS,
  canonicalJson,
  finalizeChain,
  genesisHash,
  isSafeStep,
  OUTCOME,
  parseStepRecord,
  REASON,
  REASON_NAMES,
  recordHash,
  renderStepPlaybook,
  sha256Hex,
  stepTitle,
  verifyChain,
  type Manifest,
  type StepRecord,
} from './records.js';
import { appendTxLog, DEMO_STATE_DIR, REPO_ROOT } from './txlog.js';

// ───────────────────────── 인자 ─────────────────────────

const USAGE = `mm — Memory Market CLI

판매자
  mm init      [--series id] [--domain design.web] [--entry index.html] [--pack id --cap id] [--name ..] [--brief ..]
  mm review    [--json] [--step N --lesson ".." --verdict accepted|rejected|partial --why ".."]
  mm publish   --pack <id> | --new  [--fee 0.05] [--ttl 7d] [--label claude-code] [--name ..] [--brief ..] [--dry-run]
  mm retract   --pack <id> --step N --reason sdk-changed|model-changed|wrong
구매자
  mm recall    --pack <id> [--sub <id>] [--fresh] [--out dir] [--json]
  mm receipt   --pack <id> --outcome resolved|partial|unresolved --evidence <path> [--sub id]
데모 상태 (demo/state/compare-state.json)
  mm baseline  --dir <folder> [--entry index.html] [--label name]
  mm state     [--pack id] [--live <dir>] [--applied "1:.hero a;3:nav"] [--evidence <json>]

공통  --project <dir>   .mm/ 가 있는 프로젝트 폴더 (기본: MM_PROJECT, INIT_CWD, cwd)
      --fresh           recall 마다 새 SealClient + 새 SessionKey (키 캐시 없음 → 만료 검증용)
환경  SELLER_SUI_PRIVATE_KEY / BUYER_SUI_PRIVATE_KEY / MARKET_PACKAGE_ID (.env 또는 ~/.memory-market/config.json)`;

function parseCli() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: CLI_OPTIONS,
    });
  } catch (e) {
    console.error(`인자 오류: ${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`);
    process.exit(2);
  }
}

const CLI_OPTIONS = {
    help: { type: 'boolean', short: 'h' },
    project: { type: 'string' },
    series: { type: 'string' },
    domain: { type: 'string' },
    entry: { type: 'string' },
    pack: { type: 'string' },
    cap: { type: 'string' },
    new: { type: 'boolean' },
    fee: { type: 'string' },
    ttl: { type: 'string' },
    label: { type: 'string' },
    name: { type: 'string' },
    brief: { type: 'string' },
    sub: { type: 'string' },
    fresh: { type: 'boolean' },
    step: { type: 'string' },
    reason: { type: 'string' },
    outcome: { type: 'string' },
    evidence: { type: 'string' },
    dir: { type: 'string' },
    blob: { type: 'string' },
    lesson: { type: 'string' },
    verdict: { type: 'string' },
    why: { type: 'string' },
    live: { type: 'string' },
    applied: { type: 'string' },
    out: { type: 'string' },
    json: { type: 'boolean' },
    force: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    'no-subscribe': { type: 'boolean' },
} as const;

const { values: opt, positionals } = parseCli();
const cmd = positionals[0];

// ───────────────────────── 프로젝트 상태 ─────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(opt.project ?? process.env.MM_PROJECT ?? process.env.INIT_CWD ?? process.cwd());
const MM = resolve(PROJECT, '.mm');

/** 정션(C:\mm)과 실제 경로가 섞여도 같은 폴더로 보게 realpath 로 비교한다 */
function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync.native(p).toLowerCase();
    } catch {
      return resolve(p).toLowerCase();
    }
  };
  return real(a) === real(b);
}

/** `cd scripts && npm run mm -- review` 처럼 스크립트 폴더 자체가 프로젝트로 잡히는 실수를 막는다 */
function guardProject() {
  if (samePath(PROJECT, HERE) || samePath(PROJECT, resolve(HERE, '..'))) {
    throw new Error(
      `프로젝트 폴더가 ${PROJECT} 로 잡혔습니다 — 여기는 CLI 가 있는 곳입니다.\n` +
        `  판매자 프로젝트를 --project <dir> 로 주거나 MM_PROJECT 환경변수를 설정하세요. 예:\n` +
        `  npm run mm -- ${cmd} --project C:\\demo\\seller`,
    );
  }
}
const CONFIG_PATH = resolve(MM, 'config.json');
const STATE_PATH = resolve(MM, 'state.json');
const PENDING_PATH = resolve(MM, 'pending.json');
const STEPS_DIR = resolve(MM, 'steps');

interface MmConfig {
  entry: string;
  viewport: [number, number];
  mobile: [number, number];
  series_id: string;
  domain?: string;
  pack_id?: string;
  cap_id?: string;
  /** 검사 id 목록. 데모 템플릿은 {id, desc} 객체로도 쓴다 — 둘 다 받는다. */
  checks: (string | { id: string; desc?: string })[];
  tool?: { name: string; version: string | null };
  name?: string;
  brief?: string;
}

/** config.checks 를 {id, desc} 로 정규화 (desc 가 없으면 records.ts 의 기본 설명) */
function checkList(config: MmConfig | null): { id: string; desc: string }[] {
  const raw = config?.checks?.length ? config.checks : CHECKS;
  return raw.map((c) => {
    const id = typeof c === 'string' ? c : c.id;
    const desc = (typeof c === 'string' ? undefined : c.desc) ?? CHECKS.find((k) => k.id === id)?.desc ?? id;
    return { id, desc };
  });
}
interface Upload {
  blobId: string;
  identity: string;
  record_hash: string;
  cipher_sha256: string;
}
interface MmState {
  step: number;
  last_hash: string | null;
  prev_record_hash: string | null;
  published: Record<string, string>;
  uploads?: Record<string, Upload>;
  manifest?: {
    key: string;
    manifestBlobId: string;
    beforeBlobId: string | null;
    afterBlobId: string | null;
    registered: boolean;
  };
  retracted?: Record<string, { blobId: string; reason: string; digest: string; ts: number }>;
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
  } catch (e) {
    throw new Error(`${path} 를 읽지 못함: ${String(e)}`);
  }
}
const saveJson = (path: string, v: unknown) => writeFileSync(path, `${JSON.stringify(v, null, 2)}\n`);

function requireConfig(): MmConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`${CONFIG_PATH} 가 없습니다. 프로젝트 폴더에서 \`mm init\` 을 먼저 실행하세요 (또는 --project <dir>).`);
  }
  return loadJson<MmConfig>(CONFIG_PATH, null as never);
}
const loadState = (): MmState =>
  loadJson<MmState>(STATE_PATH, { step: 0, last_hash: null, prev_record_hash: null, published: {} });

function loadRecords(): StepRecord[] {
  if (!existsSync(STEPS_DIR)) return [];
  const out: StepRecord[] = [];
  for (const f of readdirSync(STEPS_DIR)) {
    const m = f.match(/^step-(\d+)\.json$/);
    if (!m) continue;
    const r = parseStepRecord(readFileSync(resolve(STEPS_DIR, f), 'utf8'));
    if (!r) {
      console.log(`  ⚠ ${f}: mm.step/1 이 아니라 건너뜀`);
      continue;
    }
    if (r.step !== Number(m[1])) console.log(`  ⚠ ${f}: 파일명과 step(${r.step}) 이 다름`);
    out.push(r);
  }
  return out.sort((a, b) => a.step - b.step);
}

const stepFile = (step: number, ext: string) => resolve(STEPS_DIR, `step-${step}.${ext}`);

/** 단계의 데스크톱 스크린샷 바이트: 기록 안의 b64 → 없으면 step-N.jpg */
function shotBytes(r: StepRecord): Uint8Array | null {
  if (r.screenshot?.b64) return new Uint8Array(Buffer.from(r.screenshot.b64, 'base64'));
  const p = stepFile(r.step, 'jpg');
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
}

function writeRecordsBack(before: StepRecord[], after: StepRecord[]) {
  let changed = 0;
  for (const r of after) {
    const prev = before.find((b) => b.step === r.step);
    if (prev && canonicalJson(prev) === canonicalJson(r)) continue;
    saveJson(stepFile(r.step, 'json'), r);
    changed++;
  }
  return changed;
}

// ───────────────────────── 유틸 ─────────────────────────

const mist = (n: number) => `${(n / 1e9).toFixed(4)} SUI`;
const when = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s).replace(/\s+/g, ' ');
const need = (v: string | undefined, what: string): string => {
  if (!v) throw new Error(`${what} 이(가) 필요합니다. mm --help`);
  return v;
};

function parseDuration(s: string): number {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!m) throw new Error(`기간 형식이 이상함: ${s} (예: 7d, 12h, 30m)`);
  const n = Number(m[1]);
  const unit = (m[2] ?? 'ms').toLowerCase();
  return Math.round(n * ({ ms: 1, s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 } as Record<string, number>)[unit]);
}
const parseFeeMist = (s: string) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error(`수수료 형식이 이상함: ${s} (SUI 단위, 예: 0.05)`);
  return Math.round(n * 1e9);
};
const parseStep = (s: string | undefined) => {
  const n = Number(need(s, '--step'));
  if (!Number.isInteger(n) || n < 1) throw new Error(`--step 은 1 이상의 정수: ${s}`);
  return n;
};

/** demo/state/compare-state.json 갱신 (실패해도 명령을 막지 않는다) */
async function refreshCompareState(packId?: string, mutate?: (s: CompareState) => void) {
  try {
    const s = loadCompareState();
    const id = packId ?? loadJson<MmConfig | null>(CONFIG_PATH, null)?.pack_id;
    if (id) {
      try {
        const [pack, receipts] = await Promise.all([getPack(id), listReceipts(id)]);
        if (pack) {
          s.pack = {
            id,
            name: pack.name,
            memory_count: pack.memoryCount,
            subscriber_count: pack.subscriberCount,
            receipts: receipts.length,
          };
        }
      } catch (e) {
        console.log(`  (팩 정보 갱신 실패 — 이전 값 유지: ${String(e).slice(0, 80)})`);
      }
    }
    const records = existsSync(STEPS_DIR) ? loadRecords() : [];
    if (records.length) {
      mkdirSync(DEMO_STATE_DIR, { recursive: true });
      s.filmstrip = records.map((r) => {
        let thumb: string | null = null;
        const src = stepFile(r.step, 'jpg');
        const dst = stateAbs(`step-${r.step}.jpg`);
        if (existsSync(src)) {
          copyFileSync(src, dst);
          thumb = stateRel(dst);
        } else if (r.screenshot?.b64) {
          writeFileSync(dst, Buffer.from(r.screenshot.b64, 'base64'));
          thumb = stateRel(dst);
        }
        return {
          step: r.step,
          thumb,
          defect: clip(r.prompts[0] ?? r.why, 140),
          fix: clip(r.lesson ?? r.why, 160),
          edit_mode: r.edit_mode,
          ts: r.ts,
        };
      });
    }
    mutate?.(s);
    const p = saveCompareState(s);
    console.log(`  compare-state: ${p}`);
  } catch (e) {
    console.log(`  (compare-state 갱신 실패: ${String(e).slice(0, 120)})`);
  }
}

// ───────────────────────── 명령 ─────────────────────────

async function cmdInit() {
  guardProject();
  mkdirSync(STEPS_DIR, { recursive: true });
  const existing = loadJson<MmConfig | null>(CONFIG_PATH, null);
  const series = opt.series ?? existing?.series_id ?? `${basename(PROJECT).replace(/[^\w-]+/g, '-')}-${Date.now().toString(36)}`;
  const config: MmConfig = {
    entry: opt.entry ?? existing?.entry ?? 'index.html',
    viewport: existing?.viewport ?? [1280, 800],
    mobile: existing?.mobile ?? [375, 812],
    series_id: series,
    domain: opt.domain ?? existing?.domain ?? 'design.web',
    checks: existing?.checks ?? CHECKS.map((c) => c.id),
    ...(existing ?? {}),
  };
  config.series_id = series;
  if (opt.entry) config.entry = opt.entry;
  if (opt.domain) config.domain = opt.domain;
  if (opt.pack) config.pack_id = opt.pack;
  if (opt.cap) config.cap_id = opt.cap;
  if (opt.name) config.name = opt.name;
  if (opt.brief) config.brief = opt.brief;
  saveJson(CONFIG_PATH, config);

  if (!existsSync(STATE_PATH) || opt.force) {
    saveJson(STATE_PATH, {
      step: 0,
      last_hash: null,
      prev_record_hash: genesisHash(config.pack_id ?? '', config.series_id),
      published: {},
    } satisfies MmState);
  }
  if (!existsSync(PENDING_PATH)) saveJson(PENDING_PATH, { prompts: [], touched: [], edit_mode: null });

  console.log(`${existing ? '갱신' : '생성'}: ${MM}`);
  console.log(`  entry     ${config.entry}  (viewport ${config.viewport.join('x')}, mobile ${config.mobile.join('x')})`);
  console.log(`  series_id ${config.series_id}`);
  console.log(`  domain    ${config.domain}`);
  console.log(`  pack_id   ${config.pack_id ?? '(publish --new 때 생성)'}`);
  console.log(`  checks    ${checkList(config).map((c) => c.id).join(', ')}`);
  console.log('');
  console.log('다음: Claude Code 로 index.html 을 고치면 훅이 턴마다 .mm/steps/step-N.* 을 남긴다.');
  console.log('      mm review 로 확인 → mm publish --new --fee 0.05 --ttl 7d 로 팩에 올린다.');
}

async function cmdReview() {
  guardProject();
  const config = requireConfig();
  const state = loadState();
  let records = loadRecords();
  if (records.length === 0) {
    console.log(`기록이 없습니다 (${STEPS_DIR}).`);
    return;
  }
  const packId = config.pack_id ?? records[0].pack_id ?? '';
  const publishedMax = Math.max(0, ...Object.keys(state.published).map(Number));

  // 주석 편집 (미발행 단계만)
  if (opt.step && (opt.lesson !== undefined || opt.verdict !== undefined || opt.why !== undefined)) {
    const n = parseStep(opt.step);
    const r = records.find((x) => x.step === n);
    if (!r) throw new Error(`step ${n} 기록이 없습니다`);
    if (n <= publishedMax) throw new Error(`step ${n} 은 이미 발행돼 수정할 수 없습니다 (mm retract 로 폐기하세요)`);
    if (opt.lesson !== undefined) r.lesson = opt.lesson || null;
    if (opt.why !== undefined) r.why = opt.why;
    if (opt.verdict !== undefined) {
      if (!['accepted', 'rejected', 'partial', ''].includes(opt.verdict)) throw new Error('--verdict 는 accepted|rejected|partial');
      r.verdict = (opt.verdict || null) as StepRecord['verdict'];
    }
    const before = records.map((x) => ({ ...x }));
    records = finalizeChain(records, packId, config.series_id, publishedMax);
    const changed = writeRecordsBack(before, records);
    state.prev_record_hash = records[records.length - 1].record_hash;
    saveJson(STATE_PATH, state);
    console.log(`step ${n} 수정 → ${changed}개 파일 갱신 (해시 사슬 재계산)\n`);
  }

  if (opt.json) {
    console.log(
      JSON.stringify(
        records.map((r) => ({
          ...r,
          html_full: r.html_full ? `<${r.html_full.length}B>` : null,
          screenshot: r.screenshot ? { ...r.screenshot, b64: `<${r.screenshot.b64.length}B>` } : null,
          screenshot_mobile: r.screenshot_mobile ? { ...r.screenshot_mobile, b64: `<${r.screenshot_mobile.b64.length}B>` } : null,
          published: state.published[String(r.step)] ?? null,
        })),
        null,
        2,
      ),
    );
    return;
  }

  console.log(`${PROJECT}  ·  series ${config.series_id}  ·  pack ${packId || '(없음)'}`);
  console.log(`단계 ${records.length}개 (발행 ${Object.keys(state.published).length}개)\n`);
  let prev: StepRecord | null = null;
  for (const r of records) {
    const check = r.check ? `${r.check.passed.length}/${r.check.passed.length + r.check.failed.length}` : '-';
    const pub = state.published[String(r.step)] ? '발행' : '미발행';
    const ret = state.retracted?.[String(r.step)] ? ` 폐기(${state.retracted[String(r.step)].reason})` : '';
    const shots = [r.screenshot || existsSync(stepFile(r.step, 'jpg')) ? '🖥' : '', r.screenshot_mobile || existsSync(stepFile(r.step, 'm.jpg')) ? '📱' : '']
      .filter(Boolean)
      .join('');
    console.log(`step ${r.step}  ${r.intent.padEnd(6)} ${(r.edit_mode ?? '-').padEnd(8)} 검사 ${check.padEnd(4)} ${(r.verdict ?? '-').padEnd(8)} ${pub}${ret} ${shots}  ${when(r.ts)}`);
    if (r.prompts.length) console.log(`   요청: ${clip(r.prompts.join(' / '), 110)}`);
    console.log(`   이유: ${clip(r.why, 110)}`);
    if (r.lesson) console.log(`   교훈: ${clip(r.lesson, 110)}`);
    if (r.check?.failed.length) console.log(`   실패: ${r.check.failed.join(', ')}`);
    if (prev && r.check && prev.check) {
      const gained = r.check.passed.filter((id) => !prev!.check!.passed.includes(id));
      if (gained.length) console.log(`   새로 통과: ${gained.join(', ')}`);
    }
    prev = r;
  }

  const v = verifyChain(records, packId, config.series_id);
  console.log('');
  if (v.ok) console.log(`✅ 해시 사슬 정상 (마지막 ${records[records.length - 1].record_hash.slice(0, 16)}…)`);
  else {
    console.log('⚠ 해시 사슬 문제 — publish 때 pack_id 를 채우며 다시 계산한다 (발행된 단계는 제외):');
    v.errors.slice(0, 12).forEach((e) => console.log(`   - ${e}`));
  }
  v.warnings.forEach((w) => console.log(`   ! ${w}`));
  if (!packId) console.log('   (pack_id 가 아직 없어 사슬은 publish 때 확정된다)');
}

async function cmdPublish() {
  guardProject();
  const config = requireConfig();
  const state = loadState();
  state.uploads ??= {};
  const records0 = loadRecords();
  if (records0.length === 0) throw new Error(`올릴 기록이 없습니다 (${STEPS_DIR})`);
  const dry = !!opt['dry-run'];
  // dry-run 은 키·네트워크 없이 계획만 보여준다
  const seller = dry ? null : keypairFrom('SELLER_SUI_PRIVATE_KEY');

  // 1. 팩
  let packId = opt.pack ?? config.pack_id;
  let capId = opt.cap ?? config.cap_id;
  const feeMist = parseFeeMist(opt.fee ?? '0.05');
  const ttlMs = parseDuration(opt.ttl ?? '7d');
  const name = opt.name ?? config.name ?? `${basename(PROJECT)} — 디자인 반복 ${records0.length}단계`;
  const brief =
    opt.brief ??
    config.brief ??
    `Claude Code 로 ${config.entry} 을 ${records0.length}턴에 걸쳐 고친 과정. 각 단계의 프롬프트·diff·스크린샷·이유·교훈.`;
  if (opt.new) {
    if (dry) {
      console.log(`[dry-run] 팩 생성: "${name}" ${mist(feeMist)} / ${ttlMs / 3.6e6}h`);
      packId = packId ?? '0x' + '0'.repeat(64);
      capId = capId ?? '0x' + '0'.repeat(64);
    } else {
      console.log(`1. 팩 생성: "${name}"  ${mist(feeMist)} / ${(ttlMs / 8.64e7).toFixed(1)}일`);
      const created = await createPack(seller!, {
        name,
        description: brief,
        feeMist,
        ttlMs,
        sourceNamespace: config.series_id,
        agentLabel: opt.label ?? 'claude-code',
      });
      packId = created.packId;
      capId = created.capId;
      config.pack_id = packId;
      config.cap_id = capId;
      config.name = name;
      config.brief = brief;
      saveJson(CONFIG_PATH, config);
      appendTxLog({ kind: 'create_pack', digest: created.digest, actor: 'seller', pack_id: packId });
      console.log(`   pack ${packId}\n   cap  ${capId}\n   tx   ${explorerTx(created.digest)}`);
    }
  } else {
    console.log('1. 기존 팩 사용');
  }
  if (!packId) throw new Error('--pack <id> 또는 --new 가 필요합니다');
  if (!capId) throw new Error('PackCap ID 가 없습니다 (--cap <id> 또는 .mm/config.json 의 cap_id)');
  if (!dry) {
    const pack = await getPack(packId);
    if (!pack) throw new Error(`팩을 체인에서 찾지 못함: ${packId}`);
    console.log(`   ${pack.name}  기억 ${pack.memoryCount}건 · 구독자 ${pack.subscriberCount}명 · ${mist(pack.feeMist)}`);
  }

  // 2. 사슬 확정 (pack_id 채움; 발행된 단계는 고정)
  const publishedMax = Math.max(0, ...Object.keys(state.published).map(Number));
  const records = finalizeChain(records0, packId, config.series_id, publishedMax);
  // dry-run 은 파일을 건드리지 않는다 (--new 의 pack_id 자리표시자가 기록에 남으면 안 된다)
  const rewritten = dry ? 0 : writeRecordsBack(records0, records);
  state.prev_record_hash = records[records.length - 1].record_hash;
  if (dry) console.log('2. 해시 사슬 확정 — [dry-run] 계산만 하고 파일에는 쓰지 않음');
  else if (rewritten) console.log(`2. 해시 사슬 확정 — ${rewritten}개 기록에 pack_id/해시 반영`);
  else console.log('2. 해시 사슬 확인 — 변경 없음');
  const v = verifyChain(records, packId, config.series_id);
  if (!v.ok) throw new Error(`기록 검증 실패:\n  ${v.errors.join('\n  ')}`);
  v.warnings.forEach((w) => console.log(`   ! ${w}`));

  // 3. 미발행 단계 암호화 → Walrus (재실행 안전: state.uploads 에 캐시)
  const seal = newSealClient();
  const onChain = dry ? new Set<string>() : new Set(await listPackBlobIds(packId));
  const toPublish: { step: number; blobId: string; memoryAtMs: number }[] = [];
  let plannedPublish = 0;
  console.log('3. 단계 암호화 → Walrus');
  for (const r of records) {
    const key = String(r.step);
    if (state.published[key]) {
      console.log(`   step ${r.step}  이미 발행 ${state.published[key].slice(0, 14)}…`);
      continue;
    }
    let up = state.uploads[key];
    if (up && up.record_hash === r.record_hash) {
      console.log(`   step ${r.step}  업로드 캐시 ${up.blobId.slice(0, 14)}…`);
    } else if (dry) {
      console.log(`   step ${r.step}  [dry-run] 암호화·업로드 예정 (identity …${r.step.toString(16).padStart(4, '0')})`);
      plannedPublish++;
      continue;
    } else {
      const { id, bytes } = await encryptStep(seal, packId, r);
      writeFileSync(stepFile(r.step, 'sealed'), bytes);
      const blobId = await storeBlob(bytes);
      up = { blobId, identity: id, record_hash: r.record_hash, cipher_sha256: sha256Hex(bytes) };
      state.uploads[key] = up;
      saveJson(STATE_PATH, state);
      console.log(`   step ${r.step}  암호화 ${bytes.length}B → ${blobId.slice(0, 14)}…  (identity …${id.slice(-4)})`);
    }
    if (onChain.has(up.blobId)) {
      state.published[key] = up.blobId;
      saveJson(STATE_PATH, state);
      console.log(`   step ${r.step}  체인에 이미 등록됨 → 상태만 갱신`);
      continue;
    }
    toPublish.push({ step: r.step, blobId: up.blobId, memoryAtMs: r.ts });
  }

  // 4. manifest + before/after 미리보기
  console.log('4. manifest / 미리보기');
  const first = records[0];
  const last = records[records.length - 1];
  const before = shotBytes(first);
  const after = shotBytes(last);
  const tool = first.tool?.name
    ? { name: first.tool.name, version: first.tool.version ?? config.tool?.version ?? null }
    : (config.tool ?? null);
  const manifest: Manifest = {
    schema: 'mm.manifest/1',
    pack_id: packId,
    series_id: config.series_id,
    brief,
    domain: config.domain ?? first.domain,
    tool,
    model: last.model ?? first.model ?? null,
    steps: records.map((r) => ({ step: r.step, title: stepTitle(r), record_sha256: r.record_hash })),
    final_html_sha256: last.html_sha256,
    checks: checkList(config),
    previews: { before: null, after: null },
    after_sha256: after ? sha256Hex(after) : null,
  };
  const manifestKey = sha256Hex(
    canonicalJson({ steps: manifest.steps, brief, final: manifest.final_html_sha256, before: before ? sha256Hex(before) : null, after: manifest.after_sha256 }),
  );
  let previewIds: string[] = [];
  if (state.manifest?.key === manifestKey && state.manifest.registered) {
    console.log(`   manifest 변경 없음 (${state.manifest.manifestBlobId.slice(0, 14)}…)`);
  } else if (dry) {
    console.log(`   [dry-run] manifest ${manifest.steps.length}단계, before ${before?.length ?? 0}B, after ${after?.length ?? 0}B 업로드 예정`);
  } else {
    if (state.manifest?.key === manifestKey) {
      previewIds = [state.manifest.manifestBlobId, state.manifest.beforeBlobId, state.manifest.afterBlobId].filter((x): x is string => !!x);
      console.log(`   업로드 캐시 재사용 (등록만 남음)`);
    } else {
      const up = await uploadPreviewAssets(manifest, { before, after });
      state.manifest = { key: manifestKey, manifestBlobId: up.manifestBlobId, beforeBlobId: up.beforeBlobId, afterBlobId: up.afterBlobId, registered: false };
      saveJson(STATE_PATH, state);
      previewIds = [up.manifestBlobId, up.beforeBlobId, up.afterBlobId].filter((x): x is string => !!x);
      console.log(`   manifest ${up.manifestBlobId.slice(0, 14)}…  before ${up.beforeBlobId?.slice(0, 14) ?? '-'}  after ${up.afterBlobId?.slice(0, 14) ?? '-'}`);
    }
    if (!before || !after) console.log('   ! 스크린샷이 없는 단계가 있어 미리보기 일부가 빠짐');
  }

  if (dry) {
    console.log(`\n[dry-run] PTB: publish ×${toPublish.length + plannedPublish} + add_preview ×${previewIds.length || 3}. 실제 실행은 --dry-run 없이.`);
    return;
  }
  if (toPublish.length === 0 && previewIds.length === 0) {
    console.log('\n올릴 것이 없습니다 — 모두 발행돼 있습니다.');
    await refreshCompareState(packId);
    return;
  }

  // 5. PTB 1건: publish ×N + add_preview ×3
  console.log(`5. 트랜잭션: publish ×${toPublish.length} + add_preview ×${previewIds.length}`);
  const res = await publishBatch(seller!, packId, capId, toPublish, previewIds);
  for (const p of toPublish) state.published[String(p.step)] = p.blobId;
  if (state.manifest && previewIds.length) state.manifest.registered = true;
  state.step = Math.max(state.step, last.step);
  saveJson(STATE_PATH, state);
  appendTxLog({
    kind: 'publish',
    digest: res.digest,
    actor: 'seller',
    pack_id: packId,
    steps: toPublish.map((p) => p.step),
    previews: previewIds.length,
  });
  console.log(`   ✓ ${explorerTx(res.digest)}`);
  console.log(`\n완료. 팩: ${explorerObject(packId)}`);
  console.log(`구매자: market_find → market_acquire({packId:"${packId}"})  /  mm recall --pack ${packId}`);
  await refreshCompareState(packId);
}

async function cmdRecall() {
  const packId = normalizeObjectId(need(opt.pack, '--pack'));
  if (opt.sub) opt.sub = normalizeObjectId(opt.sub, 'subscription id');
  const buyer = keypairFrom('BUYER_SUI_PRIVATE_KEY');
  const address = buyer.toSuiAddress();
  const pack = await getPack(packId);
  if (!pack) throw new Error(`팩을 찾을 수 없음: ${packId}`);

  let sub = opt.sub
    ? await (async () => {
        const s = await readSubscription(opt.sub!);
        if (!s) throw new Error(`구독권을 찾을 수 없음: ${opt.sub}`);
        if (s.packId !== packId) throw new Error(`구독권 ${opt.sub} 은 이 팩의 것이 아님 (${s.packId})`);
        return { id: opt.sub!, ...s };
      })()
    : await findSubscription(address, packId);
  // 유효한 구독이 없으면 구독한다 (market_acquire 와 같은 동작). --sub 를 명시했으면 그대로 시도(만료 시연용).
  if (!opt.sub && (!sub || sub.expiresAtMs < Date.now())) {
    if (opt['no-subscribe']) throw new Error(`이 팩의 유효한 구독권이 없습니다 (${address}). --no-subscribe 를 빼면 구독합니다.`);
    // MCP 의 세션 지출 상한과 같은 기준. 비싼 팩을 실수로 사지 않게 — 정말 사려면 --force.
    if (pack.feeMist > MARKET_SPEND_CAP_SUI * 1e9 && !opt.force) {
      throw new Error(
        `이 팩의 구독료 ${mist(pack.feeMist)} 가 지출 상한 ${MARKET_SPEND_CAP_SUI} SUI 를 넘습니다. 그래도 결제하려면 --force (또는 MARKET_SPEND_CAP_SUI 조정).`,
      );
    }
    console.log(`구독    ${sub ? `만료됨(${when(sub.expiresAtMs)}) → ` : '없음 → '}${mist(pack.feeMist)} 결제하고 새로 구독 (→ ${pack.owner.slice(0, 10)}…)`);
    const r = await subscribeTx(buyer, packId, pack.feeMist);
    appendTxLog({ kind: 'subscribe', digest: r.digest, actor: 'buyer', pack_id: packId, subscription_id: r.subscriptionId, fee_mist: pack.feeMist });
    console.log(`        sub ${r.subscriptionId}\n        tx  ${explorerTx(r.digest)}`);
    sub = (await readSubscription(r.subscriptionId).then((s) => (s ? { id: r.subscriptionId, ...s } : null))) ?? {
      id: r.subscriptionId,
      packId,
      expiresAtMs: Date.now() + pack.ttlMs,
    };
  }
  if (!sub) throw new Error(`이 팩의 구독권이 없습니다 (${address})`);

  const now = Date.now();
  const { active, retracted } = await listActiveBlobIds(packId);
  console.log(`팩      ${pack.name}  (${packId})`);
  console.log(`구독권  ${sub.id}  만료 ${when(sub.expiresAtMs)} ${sub.expiresAtMs < now ? '← 만료됨' : `(${Math.round((sub.expiresAtMs - now) / 6e4)}분 남음)`}`);
  console.log(`블롭    ${active.length}건${retracted.length ? ` (폐기 ${retracted.length}건 제외)` : ''}`);
  if (opt.fresh) console.log('Seal    --fresh: 새 SealClient + 새 SessionKey (파생 키 캐시 없음 → 키 서버가 seal_approve 를 다시 시뮬레이션)');

  let items;
  try {
    items = await decryptAll(buyer, address, newSealClient(), packId, sub.id, active, { log: (s) => console.log(`        ${s}`) });
  } catch (e) {
    if (isNoAccess(e)) {
      if (sub.expiresAtMs < Date.now()) {
        console.log(`\n❌ seal_approve aborted: subscription expired (expires_at_ms ${sub.expiresAtMs} < now ${Date.now()})`);
        console.log(`   키 서버가 ${packId.slice(0, 10)}… 의 seal_approve 를 시뮬레이션했고 ENoAccess 로 abort → 키 발급 거부.`);
        console.log(`   (만료 ${when(sub.expiresAtMs)} · 지금 ${when(Date.now())})`);
      } else {
        console.log(`\n❌ seal_approve aborted: NoAccessError — ${String(e).slice(0, 200)}`);
      }
      process.exit(1);
    }
    throw e;
  }

  // 결과 정리
  const manifest = await readManifest(pack).catch(() => null);
  const outDir = resolve(opt.out ?? resolve(PROJECT, '.mm-cache', packId));
  mkdirSync(outDir, { recursive: true });
  const dec = new TextDecoder();
  const records: StepRecord[] = [];
  const texts: string[] = [];
  for (const it of items) {
    const text = dec.decode(it.plain);
    const r = parseStepRecord(text);
    if (r) records.push(r);
    else texts.push(text);
  }
  records.sort((a, b) => a.step - b.step);

  if (opt.json) {
    console.log(JSON.stringify({ pack: packId, subscription: sub.id, records: records.map(stripImages), memories: texts }, null, 2));
  }

  console.log(`\n복호화 ${items.length}건: 단계 기록 ${records.length} · 텍스트 기억 ${texts.length}`);
  let prev: StepRecord | null = null;
  let ok = 0;
  for (const r of records) {
    const imagePath = saveImages(outDir, r);
    const expect = manifest?.steps.find((s) => s.step === r.step)?.record_sha256;
    const computed = recordHash(r);
    const verified = expect ? expect === computed && computed === r.record_hash : null;
    if (verified) ok++;
    if (!opt.json) console.log(`\n${renderStepPlaybook(r, prev, { imagePath, verified })}`);
    prev = r;
  }
  if (!opt.json) texts.forEach((t, i) => console.log(`\n${i + 1}. ${t}`));
  if (manifest) console.log(`\nmanifest 대조: ${ok}/${records.length} 단계 record_hash 일치${retracted.length ? ` · 폐기 ${retracted.length}건은 받지 않음` : ''}`);
  console.log(`이미지/HTML: ${outDir}`);
}

function stripImages(r: StepRecord) {
  return {
    ...r,
    html_full: r.html_full ? `<${r.html_full.length}B>` : null,
    screenshot: r.screenshot ? { ...r.screenshot, b64: `<${r.screenshot.b64.length}B>` } : null,
    screenshot_mobile: r.screenshot_mobile ? { ...r.screenshot_mobile, b64: `<${r.screenshot_mobile.b64.length}B>` } : null,
  };
}

/** 기록의 이미지·HTML 을 파일로 (텍스트에는 b64 를 넣지 않는다) */
function saveImages(dir: string, r: StepRecord): string | null {
  // step 은 판매자 데이터다 — 파일명에 들어가므로 정수 범위를 다시 확인한다
  if (!isSafeStep(r.step)) throw new Error(`step 값이 파일명으로 안전하지 않음: ${String(r.step).slice(0, 40)}`);
  let main: string | null = null;
  if (r.screenshot?.b64) {
    main = resolve(dir, `step-${r.step}.jpg`);
    writeFileSync(main, Buffer.from(r.screenshot.b64, 'base64'));
  }
  if (r.screenshot_mobile?.b64) writeFileSync(resolve(dir, `step-${r.step}.m.jpg`), Buffer.from(r.screenshot_mobile.b64, 'base64'));
  if (r.html_full) writeFileSync(resolve(dir, `step-${r.step}.html`), r.html_full);
  return main;
}

async function cmdRetract() {
  const packId = normalizeObjectId(need(opt.pack, '--pack'));
  const step = parseStep(opt.step);
  const reasonName = need(opt.reason, '--reason') as keyof typeof REASON;
  const reason = REASON[reasonName] ?? (Number.isInteger(Number(reasonName)) ? Number(reasonName) : undefined);
  if (!reason || reason < 1 || reason > 3) throw new Error('--reason 은 model-changed|wrong|sdk-changed');

  const config = loadJson<MmConfig | null>(CONFIG_PATH, null);
  const state = loadState();
  // cap: --cap → 프로젝트 .mm/config.json → (sync.ts 가 만든 Sui 기억 팩이면) .env 의 MARKET_CAP_ID
  const projectCap = config?.pack_id === packId ? config?.cap_id : undefined;
  const envCap = process.env.MARKET_PACK_ID === packId ? process.env.MARKET_CAP_ID : undefined;
  const capId = opt.cap ?? projectCap ?? envCap ?? config?.cap_id;
  if (!capId) throw new Error('PackCap ID 가 없습니다 (--cap <id>, .mm/config.json 의 cap_id, 또는 .env 의 MARKET_PACK_ID/MARKET_CAP_ID)');

  // blob: --blob → .mm/state.json 의 published[step] → (매핑이 없는 텍스트 기억 팩) 체인 등록 순서의 N번째 블롭
  let blobId = opt.blob ?? (config?.pack_id === packId || !config?.pack_id ? state.published[String(step)] : undefined);
  if (!blobId) {
    const all = await listPackBlobIds(packId);
    if (step > all.length) throw new Error(`step ${step}: 팩에 블롭이 ${all.length}건뿐입니다`);
    blobId = all[step - 1];
    console.log(`(.mm 에 step→blob 매핑이 없어 체인 등록 순서 ${step}번째 블롭을 씁니다 — mm recall 의 번호와 같은 순서)`);
  }

  const seller = keypairFrom('SELLER_SUI_PRIVATE_KEY');
  console.log(`폐기: pack ${packId.slice(0, 10)}…  step ${step}  blob ${blobId.slice(0, 14)}…  reason ${REASON_NAMES[reason]}(${reason})`);
  const res = await retractBlob(seller, packId, capId, blobId, reason);
  state.retracted = { ...(state.retracted ?? {}), [String(step)]: { blobId, reason: REASON_NAMES[reason], digest: res.digest, ts: Date.now() } };
  saveJson(STATE_PATH, state);
  appendTxLog({ kind: 'retract', digest: res.digest, actor: 'seller', pack_id: packId, step, blob_id: blobId, reason });
  console.log(`✓ ${explorerTx(res.digest)}`);
  console.log('  이후 recall / market_acquire 는 이 단계를 제외한다 (이미 키를 받아간 클라이언트에는 소급되지 않음).');
  await refreshCompareState(packId);
}

async function cmdReceipt() {
  const packId = normalizeObjectId(need(opt.pack, '--pack'));
  const outcomeName = need(opt.outcome, '--outcome') as keyof typeof OUTCOME;
  const outcome = OUTCOME[outcomeName] ?? (Number.isInteger(Number(outcomeName)) ? Number(outcomeName) : undefined);
  if (outcome === undefined || outcome < 0 || outcome > 2) throw new Error('--outcome 은 resolved|partial|unresolved');
  // 위치 제한은 두지 않는다(사람이 직접 준 경로) — 크기·텍스트·비밀키 패턴만 거른다. Walrus 는 공개 평문 저장소다.
  let ev: ReturnType<typeof readEvidenceFile>;
  try {
    ev = readEvidenceFile(need(opt.evidence, '--evidence'));
  } catch (e) {
    if (e instanceof EvidenceError) throw new Error(`증거 파일 거부: ${e.message}`);
    throw e;
  }
  const evidencePath = ev.path;

  const buyer = keypairFrom('BUYER_SUI_PRIVATE_KEY');
  const address = buyer.toSuiAddress();
  const sub = opt.sub ? { id: normalizeObjectId(opt.sub, 'subscription id') } : await findSubscription(address, packId);
  if (!sub) throw new Error(`이 팩의 구독권이 없습니다 (${address})`);
  // 이미 영수증이 있으면 tx 가 EReceiptExists(abort 5)로 실패한다 — 증거를 공개 저장소에 올리기 전에 확인한다.
  // (MCP market_receipt 는 같은 검사를 이미 하고 있다. CLI 만 빠져 있어 Walrus 업로드를 버렸다.)
  const already = (await listReceipts(packId).catch(() => [])).find((r) => r.subscriptionId === sub.id);
  if (already) {
    throw new Error(
      `이 구독권(${sub.id})으로는 이미 영수증을 남겼습니다 (outcome ${already.outcome}). 구독권 1개당 1회 — 새 구독권으로 다시 사거나 다른 지갑을 쓰세요.`,
    );
  }

  const bytes = ev.bytes;
  console.log(`증거 업로드: ${basename(evidencePath)} (${bytes.length}B) → Walrus 평문`);
  const evidenceBlobId = await storeBlob(bytes);
  console.log(`  blob ${evidenceBlobId}`);
  const res = await leaveReceipt(buyer, packId, sub.id, outcome, evidenceBlobId);
  appendTxLog({ kind: 'leave_receipt', digest: res.digest, actor: 'buyer', pack_id: packId, subscription_id: sub.id, outcome, evidence_blob_id: evidenceBlobId });
  console.log(`✓ 영수증: outcome ${outcomeName}(${outcome}) · sub ${sub.id.slice(0, 10)}… · ${explorerTx(res.digest)}`);

  await refreshCompareState(packId, (s) => {
    const live = evidenceToLive(ev.json, null, s.live);
    if (live) s.live = live;
  });
}

async function cmdBaseline() {
  const dir = resolve(need(opt.dir, '--dir'));
  const config = loadJson<MmConfig | null>(CONFIG_PATH, null);
  const html = resolve(dir, opt.entry ?? config?.entry ?? 'index.html');
  if (!existsSync(html)) throw new Error(`HTML 이 없음: ${html}`);

  console.log(`검사: ${html}`);
  const check = runCheck(html);
  const total = check.passed.length + check.failed.length;
  console.log(`  ${check.passed.length}/${total} 통과${check.failed.length ? `  실패: ${check.failed.join(', ')}` : ''}`);

  const s = loadCompareState();
  const n = s.baseline.length + 1;
  mkdirSync(DEMO_STATE_DIR, { recursive: true });
  const dst = stateAbs(`baseline-${n}.jpg`);
  let shot: string | null = null;
  const existing = findExistingShot(dir);
  if (existing) {
    copyFileSync(existing, dst);
    shot = stateRel(dst);
  } else if (await screenshotHtml(html, dst, config?.viewport ?? [1280, 800])) {
    shot = stateRel(dst);
  }
  console.log(`  스크린샷: ${shot ?? '(없음)'}`);
  s.baseline.push({ shot, passed: check.passed.length, total, ts: Date.now(), label: opt.label ?? basename(dir), failed: check.failed });
  const p = saveCompareState(s);
  console.log(`baseline #${n} 추가 → ${p}`);
}

async function cmdState() {
  const config = loadJson<MmConfig | null>(CONFIG_PATH, null);
  const packId = opt.pack ?? config?.pack_id;
  let live: CompareState['live'] | undefined;

  if (opt.live) {
    const dir = resolve(opt.live);
    const html = resolve(dir, opt.entry ?? config?.entry ?? 'index.html');
    if (!existsSync(html)) throw new Error(`HTML 이 없음: ${html}`);
    const check = runCheck(html);
    const dst = stateAbs('live.jpg');
    mkdirSync(DEMO_STATE_DIR, { recursive: true });
    let shot: string | null = null;
    const existing = findExistingShot(dir);
    if (existing) {
      copyFileSync(existing, dst);
      shot = stateRel(dst);
    } else if (await screenshotHtml(html, dst, config?.viewport ?? [1280, 800])) shot = stateRel(dst);
    live = {
      shot,
      passed: check.passed.length,
      total: check.passed.length + check.failed.length,
      ts: Date.now(),
      applied: parseApplied(opt.applied),
      failed: check.failed,
    };
    console.log(`live: ${live.passed}/${live.total}${check.failed.length ? ` 실패 ${check.failed.join(', ')}` : ''}`);
  }
  if (opt.evidence) {
    const j: unknown = JSON.parse(readFileSync(resolve(opt.evidence), 'utf8'));
    const fromEv = evidenceToLive(j, live?.shot ?? null, live ?? null);
    if (!fromEv) throw new Error('--evidence 는 mm.evidence/1 JSON 또는 check.mjs 출력({passed,failed}) 이어야 합니다');
    live = fromEv;
    if (opt.applied) live.applied = parseApplied(opt.applied);
  }

  await refreshCompareState(packId, (s) => {
    if (live) s.live = live;
    else if (opt.applied && s.live) s.live.applied = parseApplied(opt.applied);
  });
  const s = loadCompareState();
  console.log(`pack ${s.pack.name || '(없음)'} · 기억 ${s.pack.memory_count} · 구독자 ${s.pack.subscriber_count} · 영수증 ${s.pack.receipts}`);
  console.log(`filmstrip ${s.filmstrip.length} · baseline ${s.baseline.length} · live ${s.live ? `${s.live.passed}/${s.live.total}` : '-'} · tx ${s.tx_log.length}`);
}

/** "1:.hero a;3:nav" 또는 "1:.hero a,3:nav" → [{step, selector}] */
function parseApplied(s: string | undefined): { step: number; selector: string }[] {
  if (!s) return [];
  return s
    .split(/[;,](?=\s*\d+\s*:)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\d+)\s*:\s*(.+)$/);
      if (!m) throw new Error(`--applied 형식: "step:selector;step:selector" (받은 값: ${part})`);
      return { step: Number(m[1]), selector: m[2].trim() };
    });
}

// ───────────────────────── 진입 ─────────────────────────

const COMMANDS: Record<string, () => Promise<void>> = {
  init: cmdInit,
  review: cmdReview,
  publish: cmdPublish,
  recall: cmdRecall,
  retract: cmdRetract,
  receipt: cmdReceipt,
  baseline: cmdBaseline,
  state: cmdState,
};

async function main() {
  if (opt.help || !cmd || cmd === 'help') {
    console.log(USAGE);
    return;
  }
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.error(`알 수 없는 명령: ${cmd}\n\n${USAGE}`);
    process.exit(2);
  }
  await fn();
}

main().catch((e) => {
  console.error(`\n실패: ${e instanceof Error ? e.message : String(e)}`);
  if (process.env.MM_DEBUG) console.error(e);
  process.exit(1);
});
