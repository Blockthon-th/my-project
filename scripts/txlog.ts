/**
 * 데모 상태 파일 위치와 트랜잭션 로그.
 *
 * CLI(mm)와 MCP 서버가 실행한 모든 tx 의 digest 를 `demo/state/tx-log.jsonl` 에 덧붙인다.
 * compare.html 이 읽는 `compare-state.json` 의 tx_log 는 여기서 만들어진다.
 *
 * 저장소 루트는 이 파일 위치에서 위로 올라가며 `scripts/` 와 `contracts/` 가 함께 있는 폴더로 찾는다 ·
 * 번들된 플러그인(plugin/server/index.mjs)에서 실행돼도 같은 곳을 가리키게. MM_DEMO_STATE_DIR 로 덮어쓸 수 있다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'scripts')) && existsSync(resolve(dir, 'contracts'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(from, '..');
}

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = findRepoRoot(here);
export const DEMO_STATE_DIR = process.env.MM_DEMO_STATE_DIR ?? resolve(REPO_ROOT, 'demo', 'state');
export const TX_LOG_PATH = resolve(DEMO_STATE_DIR, 'tx-log.jsonl');
export const COMPARE_STATE_PATH = resolve(DEMO_STATE_DIR, 'compare-state.json');

export type TxKind =
  | 'create_pack'
  | 'publish'
  | 'subscribe'
  | 'leave_receipt'
  | 'retract'
  | 'set_terms';

export interface TxLogEntry {
  kind: TxKind;
  digest: string;
  ts: number;
  /** 누가 보냈는지 (seller / buyer / mcp), compare.html 이 색을 다르게 칠 수 있게 */
  actor?: string;
  pack_id?: string;
  [k: string]: unknown;
}

/** 실패해도 호출자를 막지 않는다 (로그는 부가 기능). */
export function appendTxLog(entry: Omit<TxLogEntry, 'ts'> & { ts?: number }): void {
  try {
    mkdirSync(DEMO_STATE_DIR, { recursive: true });
    appendFileSync(TX_LOG_PATH, `${JSON.stringify({ ts: Date.now(), ...entry })}\n`);
  } catch (e) {
    console.error(`[tx-log] 기록 실패: ${String(e)}`);
  }
}

export function readTxLog(): TxLogEntry[] {
  try {
    if (!existsSync(TX_LOG_PATH)) return [];
    return readFileSync(TX_LOG_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as TxLogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is TxLogEntry => e !== null);
  } catch {
    return [];
  }
}
