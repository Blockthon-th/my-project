/**
 * tools/lib.mjs — 포집 도구 공용 헬퍼.
 *
 * 다른 에이전트(scripts/)가 record_hash 를 재계산할 때 같은 규칙을 쓰도록
 * sha256 / canonicalJson / recordHash / genesisHash 를 여기서 export 한다.
 *
 *   canonical JSON = 키를 재귀적으로 정렬(JS 기본 sort, UTF-16 code unit 순), 공백 없음,
 *                    값 직렬화는 JSON.stringify 와 동일(비ASCII 는 그대로).
 *   record_hash    = sha256(canonicalJson(record without record_hash))
 *   prev_hash(1)   = sha256((pack_id ?? '') + series_id)
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 기록 크기 상한(바이트). b64 는 원본의 4/3 이므로 스크린샷 원본은 90KB 로 잡아 b64 ≤ 120KB 를 보장한다. */
export const LIMITS = Object.freeze({
  diff: 8 * 1024,
  html: 40 * 1024,
  shotBytes: 90 * 1000, // → b64 120,000 ≤ 122,880
  mobileBytes: 60 * 1000,
  why: 2000,
  lesson: 1000,
  prompt: 4000,
});

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalJson(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(v)
    .filter((k) => v[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}

/** record_hash 필드를 뺀 나머지의 canonical JSON 해시 */
export function recordHash(record) {
  const { record_hash: _omit, ...rest } = record;
  return sha256(canonicalJson(rest));
}

/** step 1 의 prev_hash */
export function genesisHash(packId, seriesId) {
  return sha256(String(packId ?? '') + String(seriesId ?? ''));
}

export function readJson(path, fallback = null) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(path, obj, pretty = 2) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(obj, null, pretty));
  renameSync(tmp, path);
}

export function readStdinJson() {
  try {
    if (process.stdin.isTTY) return {};
    const raw = readFileSync(0, 'utf8');
    return raw && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** cwd 기준 상대 경로(posix 구분자). cwd 밖이면 그대로(절대 경로) 둔다. */
export function relPosix(cwd, p) {
  const abs = isAbsolute(p) ? p : resolve(cwd, p);
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return abs.replace(/\\/g, '/');
  return rel.replace(/\\/g, '/');
}

export function appendLog(logPath, line) {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* 로그 실패는 무시 */
  }
}

/** "1280x800" → [1280, 800]; 배열이면 그대로 */
export function parseWH(v, fallback) {
  if (Array.isArray(v) && v.length === 2) return [Number(v[0]), Number(v[1])];
  if (typeof v === 'string') {
    const m = v.match(/^(\d+)\s*[x×,]\s*(\d+)$/i);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return fallback;
}

/** 문자열을 UTF-8 바이트 상한으로 자른다(멀티바이트 경계 안전, 줄 단위로 정리). */
export function truncateBytes(s, max, marker = '\n… [truncated]') {
  if (Buffer.byteLength(s) <= max) return s;
  let out = s;
  while (Buffer.byteLength(out + marker) > max) out = out.slice(0, Math.floor(out.length * 0.9));
  const nl = out.lastIndexOf('\n');
  if (nl > out.length * 0.5) out = out.slice(0, nl);
  return out + marker;
}

/**
 * 디렉터리 생성 기반의 단순 잠금. 1.5초 안에 못 얻으면 그냥 진행한다(훅은 절대 막지 않는다).
 * 20초 넘은 잠금은 죽은 프로세스의 것으로 보고 제거.
 */
export function withLock(lockPath, fn, { waitMs = 1500, staleMs = 20000 } = {}) {
  const t0 = Date.now();
  let held = false;
  for (;;) {
    try {
      mkdirSync(lockPath);
      held = true;
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') break;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* ignore */
      }
      if (Date.now() - t0 > waitMs) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    if (held) {
      try {
        rmSync(lockPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 이 모듈이 `node file.mjs` 로 직접 실행됐는지.
 * import.meta.url 은 정션(C:\mm → 실제 경로)을 푼 경로가 되고 argv[1] 은 호출한 그대로이므로 양쪽을 realpath 로 맞춘다.
 */
export function isMain(importMetaUrl) {
  try {
    return norm(fileURLToPath(importMetaUrl)) === norm(resolve(process.argv[1] || ''));
  } catch {
    return false;
  }
}
function norm(p) {
  let r = p;
  try {
    r = realpathSync.native(p);
  } catch {
    /* 존재하지 않으면 그대로 비교 */
  }
  return r.replace(/\\/g, '/').toLowerCase();
}
