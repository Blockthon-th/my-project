/**
 * 기록 스키마, 판매자 훅(tools/)이 쓰고, CLI(mm)·MCP 서버·구매자 에이전트가 읽는 공용 규약.
 *
 *  mm.step/1     : 디자인 반복 한 단계(프롬프트·diff·스크린샷·이유·교훈). Seal 로 잠가 Walrus 에 올린다.
 *                  단계 1개 = Seal 암호문 1개 = Walrus 블롭 1개 = publish 1회.
 *  mm.manifest/1 : 팩의 평문 목차. add_preview 로 등록되어 구매 전에 공개된다.
 *
 * 해시 규약 (tools/ 의 포집기와 반드시 같아야 한다):
 *  - canonical JSON = 키를 재귀적으로 정렬(Object.keys().sort(), UTF-16 코드 단위 순), 공백 없음,
 *    undefined 값 키는 버림, 배열은 순서 유지.
 *  - record_hash = sha256( canonical(record without record_hash) ) 의 hex.
 *  - step 1 의 prev_hash = sha256(pack_id + series_id). step N 의 prev_hash = step N-1 의 record_hash.
 *  - Seal identity = pack id 32바이트 ‖ u16 big-endian step (2바이트) → hex.
 */
import { createHash } from 'node:crypto';
import { fromHex, toHex } from '@mysten/sui/utils';

// ───────────────────────── 타입 ─────────────────────────

export type Domain = 'design.web' | 'dev.sui';
export type Intent = 'init' | 'fix' | 'revert' | 'polish';
export type EditMode = 'targeted' | 'rewrite' | null;
export type Verdict = 'accepted' | 'rejected' | 'partial' | null;

export interface Screenshot {
  mime: string;
  w: number;
  h: number;
  sha256: string;
  b64: string;
}
export interface ScreenshotMobile {
  w: number;
  h: number;
  sha256: string;
  b64: string;
}
export interface CheckResult {
  passed: string[];
  failed: string[];
}

export interface StepRecord {
  schema: 'mm.step/1';
  /** 포집 시점에 팩이 없으면 null, mm publish 의 finalizeChain 이 채운다 */
  pack_id: string | null;
  series_id: string;
  step: number;
  /** 기록 시각(ms). publish 의 memory_at_ms 로 쓴다. */
  ts: number;
  domain: Domain;
  tool: { name: string; version: string | null };
  model: string | null;
  prompts: string[];
  intent: Intent;
  edit_mode: EditMode;
  files_touched: string[];
  /** unified diff, ≤ 8KB */
  diff: string;
  /** ≤ 40KB */
  html_full: string | null;
  html_sha256: string | null;
  /** b64 ≤ 120KB */
  screenshot: Screenshot | null;
  screenshot_mobile: ScreenshotMobile | null;
  check: CheckResult | null;
  why: string;
  lesson: string | null;
  verdict: Verdict;
  prev_hash: string;
  record_hash: string;
}

export interface ManifestStep {
  step: number;
  title: string;
  /** 해당 단계 기록의 record_hash */
  record_sha256: string;
}
export interface Manifest {
  schema: 'mm.manifest/1';
  pack_id: string;
  series_id: string;
  brief: string;
  domain: Domain | string;
  tool: { name: string; version: string | null } | null;
  model: string | null;
  steps: ManifestStep[];
  final_html_sha256: string | null;
  checks: { id: string; desc: string }[];
  /** 평문 스크린샷 블롭 (구매 전 공개) */
  previews: { before: string | null; after: string | null };
  /** after 스크린샷 바이트의 sha256, 미리보기가 바꿔치기되지 않았는지 대조 */
  after_sha256: string | null;
}

/** 구매자가 영수증에 첨부하는 증거 파일 (Walrus 평문). mm state --evidence 가 live 칸에 쓴다. */
export interface Evidence {
  schema: 'mm.evidence/1';
  pack_id: string;
  subscription_id?: string;
  ts: number;
  check: { passed: string[]; failed: string[]; details?: Record<string, unknown> };
  applied: { step: number; selector: string }[];
  html_sha256?: string;
  shot_sha256?: string;
  note?: string;
}

// ───────────────────────── 상수 ─────────────────────────

/** check.mjs 의 5개 검사 (id 고정) */
export const CHECKS: { id: string; desc: string }[] = [
  { id: 'cta-contrast', desc: '첫 section 안 가장 큰 CTA 의 전경/배경 대비 ≥ 4.5:1' },
  { id: 'h1-lines', desc: 'h1 이 1280px 에서 2줄 이하' },
  { id: 'no-hscroll', desc: '375px 에서 가로 스크롤 없음' },
  { id: 'card-height', desc: '가격/기능 카드 높이 편차 ≤ 8%' },
  { id: 'nav-overlap', desc: 'fixed/sticky nav 가 첫 텍스트를 가리지 않음' },
];
export const CHECK_IDS = CHECKS.map((c) => c.id);

/** leave_receipt 의 outcome */
export const OUTCOME = { unresolved: 0, partial: 1, resolved: 2 } as const;
export type OutcomeName = keyof typeof OUTCOME;
export const OUTCOME_NAMES: Record<number, OutcomeName> = { 0: 'unresolved', 1: 'partial', 2: 'resolved' };

/** retract 의 reason */
export const REASON = { 'model-changed': 1, wrong: 2, 'sdk-changed': 3 } as const;
export type ReasonName = keyof typeof REASON;
export const REASON_NAMES: Record<number, ReasonName> = { 1: 'model-changed', 2: 'wrong', 3: 'sdk-changed' };

export const LIMITS = { diff: 8 * 1024, html: 40 * 1024, shotB64: 120 * 1024 } as const;

// ───────────────────────── 해시 ─────────────────────────

/** 키 정렬 + 공백 없음. undefined 값은 JSON.stringify 처럼 버린다. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** record_hash 를 뺀 나머지의 canonical JSON 해시 */
export function recordHash(record: Omit<StepRecord, 'record_hash'> & { record_hash?: string }): string {
  const { record_hash: _omit, ...rest } = record;
  void _omit;
  return sha256Hex(canonicalJson(rest));
}

/** step 1 의 prev_hash */
export function genesisHash(packId: string, seriesId: string): string {
  return sha256Hex(`${packId}${seriesId}`);
}

/** Seal identity: pack id bytes ‖ u16 BE step → hex (0x 없음) */
export function stepIdentity(packId: string, step: number): string {
  if (!Number.isInteger(step) || step < 0 || step > 0xffff) throw new Error(`step 범위 초과: ${step}`);
  const pack = fromHex(packId);
  if (pack.length !== 32) throw new Error(`pack id 가 32바이트가 아님: ${packId}`);
  return toHex(new Uint8Array([...pack, (step >> 8) & 0xff, step & 0xff]));
}

/** identity 가 이 팩의 단계 identity 이면 step 번호, 아니면 null (랜덤 nonce 기억은 null) */
export function stepFromIdentity(packId: string, id: string): number | null {
  const bytes = fromHex(id);
  const pack = fromHex(packId);
  if (bytes.length !== 34) return null;
  for (let i = 0; i < 32; i++) if (bytes[i] !== pack[i]) return null;
  return (bytes[32] << 8) | bytes[33];
}

// ───────────────────────── 검증 ─────────────────────────

const INTENTS = new Set(['init', 'fix', 'revert', 'polish']);
const EDIT_MODES = new Set(['targeted', 'rewrite', null]);
const VERDICTS = new Set(['accepted', 'rejected', 'partial', null]);
const DOMAINS = new Set(['design.web', 'dev.sui']);

export interface Verification {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** 스키마 모양 + record_hash 를 확인한다. prev_hash 연결은 verifyChain 이 본다. */
export function verifyRecord(r: unknown): Verification {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['객체가 아님'], warnings };
  const x = r as Record<string, unknown>;
  if (x.schema !== 'mm.step/1') errors.push(`schema 가 mm.step/1 이 아님: ${String(x.schema)}`);
  if (typeof x.pack_id !== 'string' && x.pack_id !== null) errors.push('pack_id 는 문자열 또는 null');
  if (typeof x.series_id !== 'string') errors.push('series_id 없음');
  if (!Number.isInteger(x.step) || (x.step as number) < 1) errors.push('step 은 1 이상 정수');
  if (typeof x.ts !== 'number') errors.push('ts 없음');
  if (!DOMAINS.has(x.domain as string)) errors.push(`domain 이상: ${String(x.domain)}`);
  if (!INTENTS.has(x.intent as string)) errors.push(`intent 이상: ${String(x.intent)}`);
  if (!EDIT_MODES.has(x.edit_mode as never)) errors.push(`edit_mode 이상: ${String(x.edit_mode)}`);
  if (!VERDICTS.has(x.verdict as never)) errors.push(`verdict 이상: ${String(x.verdict)}`);
  if (!Array.isArray(x.prompts)) errors.push('prompts 배열 아님');
  if (typeof x.diff !== 'string') errors.push('diff 문자열 아님');
  if (typeof x.why !== 'string') errors.push('why 없음');
  if (typeof x.prev_hash !== 'string') errors.push('prev_hash 없음');
  if (typeof x.record_hash !== 'string') errors.push('record_hash 없음');

  if (typeof x.diff === 'string' && x.diff.length > LIMITS.diff) warnings.push(`diff ${x.diff.length}B > 8KB`);
  if (typeof x.html_full === 'string' && x.html_full.length > LIMITS.html)
    warnings.push(`html_full ${x.html_full.length}B > 40KB`);
  const shot = x.screenshot as Screenshot | null | undefined;
  if (shot && typeof shot.b64 === 'string' && shot.b64.length > LIMITS.shotB64)
    warnings.push(`screenshot b64 ${shot.b64.length}B > 120KB`);
  if (x.html_full && x.html_sha256 && sha256Hex(String(x.html_full)) !== x.html_sha256)
    errors.push('html_sha256 가 html_full 과 다름');

  if (errors.length === 0) {
    const expect = recordHash(x as unknown as StepRecord);
    if (expect !== x.record_hash) errors.push(`record_hash 불일치 (기록 ${String(x.record_hash).slice(0, 12)}… ≠ 계산 ${expect.slice(0, 12)}…)`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 단계 배열이 1..N 연속이고 prev_hash 가 이어지는지 */
export function verifyChain(records: StepRecord[], packId: string, seriesId: string): Verification {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sorted = [...records].sort((a, b) => a.step - b.step);
  let prev = genesisHash(packId, seriesId);
  sorted.forEach((r, i) => {
    const v = verifyRecord(r);
    errors.push(...v.errors.map((e) => `step ${r.step}: ${e}`));
    warnings.push(...v.warnings.map((w) => `step ${r.step}: ${w}`));
    if (r.step !== i + 1) errors.push(`step 번호 불연속: ${i + 1} 자리에 ${r.step}`);
    if ((r.pack_id ?? '') !== (packId ?? '')) errors.push(`step ${r.step}: pack_id 가 ${packId || '(없음)'} 가 아님`);
    if (r.series_id !== seriesId) errors.push(`step ${r.step}: series_id 가 ${seriesId} 가 아님`);
    if (r.prev_hash !== prev) errors.push(`step ${r.step}: prev_hash 끊김`);
    prev = r.record_hash;
  });
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * pack_id 를 채우고 prev_hash → record_hash 사슬을 처음부터 다시 계산한다.
 * 팩이 publish 시점에 만들어지므로(mm publish --new) 포집 당시 기록의 pack_id 는 비어 있을 수 있다.
 * 이미 발행된 단계는 바꾸면 안 되므로 호출자가 `frozenUpTo` 로 막는다, 그 단계들의 해시가 계산과 다르면 throw.
 */
export function finalizeChain(
  records: StepRecord[],
  packId: string,
  seriesId: string,
  frozenUpTo = 0,
): StepRecord[] {
  const sorted = [...records].sort((a, b) => a.step - b.step);
  let prev = genesisHash(packId, seriesId);
  return sorted.map((r) => {
    const next: StepRecord = { ...r, pack_id: packId, series_id: seriesId, prev_hash: prev };
    next.record_hash = recordHash(next);
    if (r.step <= frozenUpTo && (next.record_hash !== r.record_hash || next.prev_hash !== r.prev_hash)) {
      throw new Error(
        `step ${r.step} 은 이미 발행됐는데 내용/사슬이 달라졌습니다 (발행 ${r.record_hash.slice(0, 12)}… ≠ 계산 ${next.record_hash.slice(0, 12)}…). 발행된 단계는 수정할 수 없습니다.`,
      );
    }
    prev = next.record_hash;
    return next;
  });
}

/** 단계 번호로 안전한 값인지 (파일명 `step-N.*` 과 Seal identity u16 에 쓰인다) */
export const isSafeStep = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 0xffff;

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isShot = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  (!!v && typeof v === 'object' && typeof (v as Screenshot).b64 === 'string' && /^[A-Za-z0-9+/=\s]*$/.test((v as Screenshot).b64));

/**
 * 복호화한 평문이 mm.step/1 로 **다룰 수 있는 모양**인지 확인하고 파싱한다.
 * 기록은 판매자가 쓴 데이터다, 구매자 쪽에서 `step` 이 파일명·경로에, `prompts`/`diff` 가 그대로 출력에 쓰이므로
 * 모양이 어긋나면 null (건너뜀). 해시·사슬의 진위는 verifyRecord / manifest 대조가 본다.
 */
export function parseStepRecord(text: string): StepRecord | null {
  try {
    const j: unknown = JSON.parse(text);
    if (!j || typeof j !== 'object') return null;
    const x = j as Record<string, unknown>;
    if (x.schema !== 'mm.step/1') return null;
    if (!isSafeStep(x.step)) return null;
    if (typeof x.pack_id !== 'string' && x.pack_id !== null && x.pack_id !== undefined) return null;
    if (!isStrArr(x.prompts) || !isStrArr(x.files_touched)) return null;
    if (typeof x.diff !== 'string' || typeof x.why !== 'string') return null;
    if (typeof x.intent !== 'string' || typeof x.prev_hash !== 'string' || typeof x.record_hash !== 'string') return null;
    if (x.html_full !== null && x.html_full !== undefined && typeof x.html_full !== 'string') return null;
    if (!isShot(x.screenshot) || !isShot(x.screenshot_mobile)) return null;
    if (x.check !== null && x.check !== undefined) {
      const c = x.check as Record<string, unknown>;
      if (!isStrArr(c.passed) || !isStrArr(c.failed)) return null;
    }
    if (x.lesson !== null && x.lesson !== undefined && typeof x.lesson !== 'string') return null;
    return x as unknown as StepRecord;
  } catch {
    return null;
  }
}

export function parseManifest(text: string): Manifest | null {
  try {
    const j = JSON.parse(text);
    return j && j.schema === 'mm.manifest/1' ? (j as Manifest) : null;
  } catch {
    return null;
  }
}

// ───────────────────────── 표현 ─────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** manifest 목차용 한 줄 제목 */
export function stepTitle(r: StepRecord): string {
  const src = r.lesson || r.why || r.prompts[0] || '';
  return clip(`${r.intent}: ${oneLine(src)}`, 80);
}

/** 이전 단계 대비 검사 변화 요약 */
export function checkDelta(prev: StepRecord | null, cur: StepRecord): string {
  if (!cur.check) return '검사 없음';
  const total = cur.check.passed.length + cur.check.failed.length;
  const now = `${cur.check.passed.length}/${total}`;
  if (!prev?.check) return `검사 ${now}`;
  const before = `${prev.check.passed.length}/${prev.check.passed.length + prev.check.failed.length}`;
  const gained = cur.check.passed.filter((id) => !prev.check!.passed.includes(id));
  const lost = cur.check.failed.filter((id) => prev.check!.passed.includes(id));
  const parts = [`검사 ${before} → ${now}`];
  if (gained.length) parts.push(`새로 통과 ${gained.join(', ')}`);
  if (lost.length) parts.push(`다시 실패 ${lost.join(', ')}`);
  return parts.join(' · ');
}

/** diff 에서 의미 있는 첫 n 줄 (헤더 제외) */
export function diffHead(diff: string, n = 3): string[] {
  return diff
    .split('\n')
    .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
    .slice(0, n)
    .map((l) => clip(l, 120));
}

/**
 * 플레이북 한 단계. 형식: "step N · intent · edit_mode · lesson(없으면 why 요약) · 증거(check 변화, diff 첫 3줄)"
 * 이미지 b64 는 넣지 않는다, 호출자가 파일로 저장하고 경로만 넘긴다.
 */
export function renderStepPlaybook(
  r: StepRecord,
  prev: StepRecord | null,
  extra: { imagePath?: string | null; verified?: boolean | null } = {},
): string {
  const lines: string[] = [];
  const mark = extra.verified === true ? ' ✓' : extra.verified === false ? ' ✗(manifest 불일치)' : '';
  lines.push(`### step ${r.step} · ${r.intent} · ${r.edit_mode ?? '-'}${r.verdict ? ` · ${r.verdict}` : ''}${mark}`);
  if (r.prompts.length) lines.push(`- 요청: ${clip(oneLine(r.prompts.join(' / ')), 200)}`);
  lines.push(`- 교훈: ${oneLine(r.lesson ?? clip(r.why, 200))}`);
  if (r.lesson && r.why) lines.push(`- 이유: ${clip(oneLine(r.why), 200)}`);
  const head = diffHead(r.diff);
  lines.push(`- 증거: ${checkDelta(prev, r)}${head.length ? '' : ' · diff 없음'}`);
  for (const h of head) lines.push(`    ${h}`);
  if (r.files_touched.length) lines.push(`- 파일: ${r.files_touched.join(', ')}`);
  if (extra.imagePath) lines.push(`- 스크린샷: ${extra.imagePath}`);
  return lines.join('\n');
}

/** market_recall 의 키워드 검색용 평문 */
export function recordToText(r: StepRecord): string {
  return oneLine(
    [
      `[step ${r.step} ${r.intent}${r.edit_mode ? `/${r.edit_mode}` : ''}]`,
      r.prompts.join(' / '),
      r.why,
      r.lesson ?? '',
      r.check ? `passed: ${r.check.passed.join(',')} failed: ${r.check.failed.join(',')}` : '',
    ].join(', '),
  );
}
