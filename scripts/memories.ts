/**
 * 판매할 기억을 모으는 소스.
 *
 * 두 가지 경로:
 *  - `memwal`  : MemWal 릴레이어에서 읽는다 (.env 에 MEMWAL_* 필요).
 *  - `file`    : `docs/dev-memories.md` 의 불릿을 읽는다. MemWal 인증 없이도 데모가 되도록.
 * `.env` 의 MEMORY_SOURCE 로 선택. 기본은 memwal 이 설정돼 있으면 memwal, 없으면 file.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEV_MEMORIES = resolve(here, '..', 'docs', 'dev-memories.md');

export interface Memory {
  /** 기억 원문 */
  text: string;
  /** 원본 생성 시각(ms). 출처 이력에 쓰인다. */
  at: number;
  /** MemWal 블롭 ID (있으면 원본 검증에 쓸 수 있다) */
  sourceBlobId?: string;
}

/** `- [2026-09-03] 내용` 형태의 불릿을 기억 하나로 읽는다. 들여쓴 하위 불릿은 이어붙인다. */
export async function fromFile(path = DEV_MEMORIES): Promise<Memory[]> {
  const raw = await readFile(path, 'utf8');
  const out: Memory[] = [];
  let cur: { date: string; parts: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    const text = cur.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) out.push({ text, at: Date.parse(cur.date) });
    cur = null;
  };

  for (const line of raw.split('\n')) {
    const top = line.match(/^- \[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/);
    if (top) {
      flush();
      cur = { date: top[1], parts: [top[2]] };
      continue;
    }
    // 들여쓴 하위 불릿 / 이어지는 줄
    if (cur && /^\s+\S/.test(line)) {
      cur.parts.push(line.replace(/^\s*-?\s*/, ''));
      continue;
    }
    if (line.trim() === '' || line.startsWith('#')) flush();
  }
  flush();
  return out;
}

/**
 * MemWal 에서 한 네임스페이스의 기억을 모은다.
 * 릴레이어의 recall 은 질의 기반이라 "전량 덤프"가 없다. 여러 질의로 긁어 blob_id 로 중복 제거한다.
 * (전량이 꼭 필요하면 `GET /v1/owners/:owner/memories` 를 직접 호출해야 한다.)
 */
export async function fromMemWal(queries: string[], limitPerQuery = 50): Promise<Memory[]> {
  const { MemWal } = await import('@mysten-incubation/memwal');
  const memwal = MemWal.create({
    key: process.env.MEMWAL_PRIVATE_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: process.env.MEMWAL_SERVER_URL ?? 'https://relayer-staging.memory.walrus.xyz',
    namespace: process.env.MEMWAL_NAMESPACE ?? 'sui-dev',
  });

  const byBlob = new Map<string, Memory>();
  for (const query of queries) {
    const res = await memwal.recall({ query, limit: limitPerQuery });
    for (const hit of res.results) {
      if (byBlob.has(hit.blob_id)) continue;
      // created_at 은 신형 릴레이어에만 있다(설치된 SDK 타입에는 없을 수 있음)
      const createdAt = (hit as { created_at?: string }).created_at;
      byBlob.set(hit.blob_id, {
        text: hit.text,
        at: createdAt ? Date.parse(createdAt) : Date.now(),
        sourceBlobId: hit.blob_id,
      });
    }
  }
  return [...byBlob.values()];
}

/** MemWal 에서 긁을 때 쓸 기본 질의들 (도메인: Sui 개발) */
export const DEFAULT_QUERIES = [
  'Sui CLI 설치 오류',
  'Move 컨트랙트 컴파일 경고',
  'Seal 암호화 복호화 실패',
  'Walrus 업로드',
  'TypeScript SDK gRPC JSON-RPC',
  'MemWal 릴레이어 인증',
  '트랜잭션 실행 실패 원인',
  '테스트넷 배포 가스',
];

export async function collect(): Promise<Memory[]> {
  const source =
    process.env.MEMORY_SOURCE ??
    (process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID ? 'memwal' : 'file');
  if (source === 'memwal') return fromMemWal(DEFAULT_QUERIES);
  return fromFile();
}
