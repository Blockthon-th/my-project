/**
 * compare.html 이 읽는 `demo/state/compare-state.json` 의 형식과 갱신 도우미.
 * mm CLI 와 MCP 서버가 함께 쓴다. 경로는 txlog.ts 의 DEMO_STATE_DIR.
 *
 * 형식 (공유 계약):
 * { pack:{id,name,memory_count,subscriber_count,receipts},
 *   filmstrip:[{step, thumb, defect, fix, edit_mode, ts}],
 *   baseline:[{shot, passed, total, ts}],
 *   live:{shot, passed, total, ts, applied:[{step, selector}]}|null,
 *   tx_log:[{kind:"subscribe"|"leave_receipt"|"retract", digest, ts}] }
 *
 * 이미지 경로(thumb/shot)는 `demo/` 기준 상대경로("state/step-1.jpg") — compare.html 이 demo/ 에 있다고 본다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Evidence } from './records.js';
import { COMPARE_STATE_PATH, DEMO_STATE_DIR, REPO_ROOT, readTxLog } from './txlog.js';

export interface CompareState {
  pack: { id: string; name: string; memory_count: number; subscriber_count: number; receipts: number };
  filmstrip: { step: number; thumb: string | null; defect: string; fix: string; edit_mode: string | null; ts: number }[];
  baseline: { shot: string | null; passed: number; total: number; ts: number; label?: string; failed?: string[] }[];
  live: {
    shot: string | null;
    passed: number;
    total: number;
    ts: number;
    applied: { step: number; selector: string }[];
    failed?: string[];
  } | null;
  tx_log: { kind: 'subscribe' | 'leave_receipt' | 'retract'; digest: string; ts: number }[];
}

export const EMPTY_STATE: CompareState = {
  pack: { id: '', name: '', memory_count: 0, subscriber_count: 0, receipts: 0 },
  filmstrip: [],
  baseline: [],
  live: null,
  tx_log: [],
};

export function loadCompareState(): CompareState {
  try {
    if (!existsSync(COMPARE_STATE_PATH)) return structuredClone(EMPTY_STATE);
    const j = JSON.parse(readFileSync(COMPARE_STATE_PATH, 'utf8'));
    return { ...structuredClone(EMPTY_STATE), ...j };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export function saveCompareState(s: CompareState): string {
  mkdirSync(DEMO_STATE_DIR, { recursive: true });
  s.tx_log = txLogForCompare();
  writeFileSync(COMPARE_STATE_PATH, JSON.stringify(s, null, 2));
  return COMPARE_STATE_PATH;
}

/** tx-log.jsonl 에서 compare.html 이 보여줄 세 종류만, 오래된 순, 최근 30건 */
export function txLogForCompare(): CompareState['tx_log'] {
  const kinds = new Set(['subscribe', 'leave_receipt', 'retract']);
  return readTxLog()
    .filter((e) => kinds.has(e.kind) && typeof e.digest === 'string')
    .slice(-30)
    .map((e) => ({ kind: e.kind as CompareState['tx_log'][number]['kind'], digest: e.digest, ts: e.ts }));
}

/** demo/state 안의 파일을 compare.html(demo/) 기준 상대경로로 */
export const stateRel = (fileName: string) => `state/${basename(fileName)}`;
export const stateAbs = (fileName: string) => resolve(DEMO_STATE_DIR, basename(fileName));

export interface CheckOutput {
  passed: string[];
  failed: string[];
  details: Record<string, unknown>;
}

/**
 * tools/check.mjs 를 자식 프로세스로 실행한다 (인자: HTML 파일 경로). stdout 의 JSON 을 읽는다.
 * MM_CHECK_CMD 로 명령을 바꿀 수 있다 (예: "node C:/x/check.mjs").
 */
export function runCheck(htmlPath: string): CheckOutput {
  const override = process.env.MM_CHECK_CMD;
  const [cmd, ...pre] = override ? override.split(/\s+/) : [process.execPath, resolve(REPO_ROOT, 'tools', 'check.mjs')];
  if (!override && !existsSync(pre[0])) throw new Error(`검사 스크립트가 없습니다: ${pre[0]}`);
  const r = spawnSync(cmd, [...pre, htmlPath], {
    encoding: 'utf8',
    cwd: resolve(REPO_ROOT, 'tools'),
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  if (r.error) throw r.error;
  const out = (r.stdout ?? '').trim();
  const parsed = parseLastJson(out);
  if (!parsed) {
    throw new Error(`check.mjs 출력에서 JSON 을 찾지 못함 (exit ${r.status}).\nstdout: ${out.slice(0, 400)}\nstderr: ${(r.stderr ?? '').slice(0, 400)}`);
  }
  return {
    passed: Array.isArray(parsed.passed) ? (parsed.passed as string[]) : [],
    failed: Array.isArray(parsed.failed) ? (parsed.failed as string[]) : [],
    details: (parsed.details as Record<string, unknown>) ?? {},
  };
}

function parseLastJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    /* 로그가 섞였을 수 있다 — 마지막 { 부터 시도 */
  }
  for (let i = text.lastIndexOf('\n{'); i >= 0; i = text.lastIndexOf('\n{', i - 1)) {
    try {
      return JSON.parse(text.slice(i + 1));
    } catch {
      /* 계속 */
    }
  }
  const first = text.indexOf('{');
  if (first >= 0) {
    try {
      return JSON.parse(text.slice(first));
    } catch {
      /* 포기 */
    }
  }
  return null;
}

/**
 * tools/ 에 설치된 playwright 로 HTML 을 렌더해 JPEG 로 저장한다. 실패하면 false (데모를 막지 않는다).
 */
export async function screenshotHtml(
  htmlPath: string,
  outPath: string,
  viewport: [number, number] = [1280, 800],
): Promise<boolean> {
  try {
    const pwPath = resolve(REPO_ROOT, 'tools', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(pwPath)) return false;
    // playwright 는 tools/ 의 의존성이라 여기 타입이 없다 — 쓰는 부분만 적어둔다
    interface PwPage {
      goto(url: string, o?: { waitUntil?: string }): Promise<unknown>;
      screenshot(o: { path: string; type: 'jpeg' | 'png'; quality?: number }): Promise<unknown>;
    }
    interface PwBrowser {
      newPage(o?: { viewport?: { width: number; height: number } }): Promise<PwPage>;
      close(): Promise<void>;
    }
    const pw = (await import(pathToFileURL(pwPath).href)) as {
      chromium: { launch(): Promise<PwBrowser> };
    };
    const browser = await pw.chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 70 });
    } finally {
      await browser.close();
    }
    return true;
  } catch (e) {
    console.error(`[screenshot] 실패: ${String(e).slice(0, 200)}`);
    return false;
  }
}

/** 폴더에 이미 있는 스크린샷을 찾는다 (에이전트가 만든 shot.jpg 등) */
export function findExistingShot(dir: string): string | null {
  const candidates = ['shot.jpg', 'screenshot.jpg', 'after.jpg', 'index.jpg', 'shot.png', 'screenshot.png', 'after.png'];
  for (const c of candidates) {
    const p = resolve(dir, c);
    if (existsSync(p)) return p;
  }
  return null;
}

/** 영수증 증거 파일(mm.evidence/1)로 live 칸을 채운다 */
export function liveFromEvidence(
  ev: Evidence,
  shot: string | null,
  prev: CompareState['live'],
): NonNullable<CompareState['live']> {
  return {
    shot: shot ?? prev?.shot ?? null,
    passed: ev.check.passed.length,
    total: ev.check.passed.length + ev.check.failed.length,
    ts: ev.ts ?? Date.now(),
    applied: Array.isArray(ev.applied) ? ev.applied : [],
    failed: ev.check.failed,
  };
}

/**
 * 증거 JSON 을 live 로. 두 형식을 받는다:
 *  - mm.evidence/1 { schema, check:{passed,failed}, applied, ts }
 *  - check.mjs 원본 출력 { passed, failed, details } (구매자 에이전트가 그대로 첨부하는 경우)
 * 둘 다 아니면 null.
 */
export function evidenceToLive(
  json: unknown,
  shot: string | null,
  prev: CompareState['live'],
): NonNullable<CompareState['live']> | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (j.schema === 'mm.evidence/1' && j.check && typeof j.check === 'object') {
    return liveFromEvidence(j as unknown as Evidence, shot, prev);
  }
  if (Array.isArray(j.passed) && Array.isArray(j.failed)) {
    const passed = j.passed as string[];
    const failed = j.failed as string[];
    return {
      shot: shot ?? prev?.shot ?? null,
      passed: passed.length,
      total: passed.length + failed.length,
      ts: Date.now() /* 영수증 시각 — 에이전트가 쓴 evidence.ts 는 신뢰하지 않는다 */,
      applied: Array.isArray(j.applied) ? (j.applied as { step: number; selector: string }[]) : (prev?.applied ?? []),
      failed,
    };
  }
  return null;
}
