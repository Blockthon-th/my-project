#!/usr/bin/env node
/**
 * tools/capture.mjs <prompt|tool|stop>
 *
 * Claude Code 훅. stdin 으로 훅 JSON 을 받아 판매자의 디자인 세션을 mm.step/1 단계로 기록한다.
 *
 *   prompt  UserPromptSubmit {session_id, prompt, cwd, transcript_path}
 *           → .mm/pending.json 의 prompts 에 누적. (첫 턴이고 entry 가 이미 있으면 step-0.html 기준선 스냅샷)
 *   tool    PostToolUse {tool_name, tool_input, tool_response?, cwd}
 *           → Edit|MultiEdit = targeted, 기존 파일에 Write = rewrite. touched 에 파일 추가.
 *   stop    Stop {session_id, transcript_path, cwd}
 *           → 분절 규칙(entry sha256 == last_hash 이거나 touched 비면 폐기) 통과 시 step-N 기록:
 *             step-N.html 복사 · 이전 단계와 unified diff(8KB) · transcript 에서 why/lesson/step-note ·
 *             shot.mjs 스크린샷 2장 · check.mjs 5항목 · step-N.json(record_hash/prev_hash 체인) · state 갱신 ·
 *             git commit "mm step N" · stdout 에 {"systemMessage": "[mm] step N captured · …"} 한 줄.
 *
 * 규칙: cwd 에 .mm/config.json 이 없으면 아무것도 안 한다. 절대 세션을 막지 않는다(모든 예외 → exit 0, 로그는 .mm/capture.log).
 * 훅 안에서 LLM 호출 없음. 목표 8초 이내.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  LIMITS,
  appendLog,
  genesisHash,
  parseWH,
  readJson,
  readStdinJson,
  recordHash,
  relPosix,
  sha256,
  truncateBytes,
  withLock,
  writeJsonAtomic,
} from './lib.mjs';

const T0 = Date.now();
const EVENT = String(process.argv[2] || '').toLowerCase();
const INTENTS = new Set(['init', 'fix', 'revert', 'polish']);
const VERDICTS = new Set(['accepted', 'rejected', 'partial']);

/**
 * 훅 전체 예산(ms). Claude Code 의 Stop 훅 timeout(권장 120초)보다 짧게 잡는다.
 * 브라우저 작업(스크린샷+검사)에는 남은 예산에서 10초를 뺀 만큼(10~60초)만 준다.
 */
const HOOK_BUDGET_MS = Math.max(20000, Number(process.env.MM_HOOK_BUDGET_MS) || 110000);

/* 어떤 일이 있어도 세션을 막지 않는다 */
process.on('uncaughtException', (e) => bail('uncaughtException', e));
process.on('unhandledRejection', (e) => bail('unhandledRejection', e));
setTimeout(() => bail('watchdog', new Error(`${HOOK_BUDGET_MS}ms elapsed`)), HOOK_BUDGET_MS).unref();
let CTX = null;
function bail(kind, e) {
  try {
    if (CTX) log(CTX, `${kind}: ${e?.stack || e}`);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

function log(ctx, line) {
  appendLog(ctx.logPath, `[${EVENT}] ${line}`);
}

/* ───────────── 컨텍스트 / 상태 파일 ───────────── */

function loadCtx(cwd) {
  const mmDir = join(cwd, '.mm');
  const config = readJson(join(mmDir, 'config.json'), null);
  if (!config) return null;
  const entry = String(config.entry || 'index.html');
  return {
    cwd,
    mmDir,
    config,
    entry,
    entryPath: resolve(cwd, entry),
    entryRel: relPosix(cwd, resolve(cwd, entry)),
    stepsDir: join(mmDir, 'steps'),
    statePath: join(mmDir, 'state.json'),
    pendingPath: join(mmDir, 'pending.json'),
    lockPath: join(mmDir, '.lock'),
    logPath: join(mmDir, 'capture.log'),
    viewport: parseWH(config.viewport, [1280, 800]),
    mobile: parseWH(config.mobile, [375, 812]),
  };
}

const emptyPending = () => ({ prompts: [], touched: [], edit_mode: null });

function loadPending(ctx) {
  const p = readJson(ctx.pendingPath, null) || {};
  return {
    prompts: Array.isArray(p.prompts) ? p.prompts : [],
    touched: Array.isArray(p.touched) ? p.touched : [],
    edit_mode: p.edit_mode === 'targeted' || p.edit_mode === 'rewrite' ? p.edit_mode : null,
  };
}
const savePending = (ctx, p) => writeJsonAtomic(ctx.pendingPath, p);

function loadState(ctx) {
  const s = readJson(ctx.statePath, null) || {};
  return {
    step: Number.isInteger(s.step) && s.step >= 0 ? s.step : 0,
    last_hash: typeof s.last_hash === 'string' ? s.last_hash : null,
    prev_record_hash: typeof s.prev_record_hash === 'string' ? s.prev_record_hash : null,
    published: s.published && typeof s.published === 'object' ? s.published : {},
    ...Object.fromEntries(Object.entries(s).filter(([k]) => !['step', 'last_hash', 'prev_record_hash', 'published'].includes(k))),
  };
}
const saveState = (ctx, s) => writeJsonAtomic(ctx.statePath, s);

const stepFile = (ctx, n, ext) => join(ctx.stepsDir, `step-${n}${ext}`);

/* ───────────── prompt ───────────── */

function onPrompt(ctx, input) {
  const prompt = String(input.prompt ?? '').trim();
  withLock(ctx.lockPath, () => {
    const pending = loadPending(ctx);
    if (prompt) pending.prompts.push(prompt.slice(0, LIMITS.prompt));
    savePending(ctx, pending);
    ensureBaseline(ctx);
  });
  log(ctx, `prompt +1 (${prompt.length} chars)`);
}

/**
 * 첫 단계 전에 entry 가 이미 있으면 step-0.html 로 스냅샷해 두고 last_hash 를 잡는다.
 * → step 1 의 diff 가 "빈 파일 → 전체" 가 아니라 실제 변경이 되고, 변경 없는 첫 턴은 폐기된다.
 */
function ensureBaseline(ctx) {
  try {
    const state = loadState(ctx);
    if (state.step !== 0) return;
    if (!existsSync(ctx.entryPath)) return;
    const base = stepFile(ctx, 0, '.html');
    if (existsSync(base)) return;
    mkdirSync(ctx.stepsDir, { recursive: true });
    const buf = readFileSync(ctx.entryPath);
    writeFileSync(base, buf);
    if (!state.last_hash) {
      state.last_hash = sha256(buf);
      saveState(ctx, state);
    }
    log(ctx, `baseline step-0.html (${buf.length} bytes)`);
  } catch (e) {
    log(ctx, `baseline skipped: ${e?.message || e}`);
  }
}

/* ───────────── tool ───────────── */

function onTool(ctx, input) {
  const name = String(input.tool_name || '');
  const ti = input.tool_input || {};
  const fp = ti.file_path || ti.path || ti.notebook_path || null;
  let touched = null;
  let mode = null;

  if (/^(Edit|MultiEdit)$/.test(name) && fp) {
    touched = fp;
    mode = 'targeted';
  } else if (name === 'Write' && fp) {
    touched = fp;
    const resp = input.tool_response;
    const respType = resp && typeof resp === 'object' ? resp.type : null;
    let created;
    if (respType === 'create' || respType === 'update') created = respType === 'create';
    else created = isFirstTouchOfEntry(ctx, fp); // 응답에 정보가 없으면 entry 첫 생성일 때만 create 로 본다
    mode = created ? null : 'rewrite';
  } else if (name === 'Bash') {
    // 셸 리다이렉트로 entry 를 고친 경우(best effort). 편집 모드는 알 수 없으므로 두지 않는다.
    const cmd = String(ti.command || '');
    if (cmd.includes(basename(ctx.entry)) && /(>|\btee\b|sed\s+-i|\bcp\b|\bmv\b)/.test(cmd)) touched = ctx.entryPath;
  }
  if (!touched) return;

  withLock(ctx.lockPath, () => {
    const pending = loadPending(ctx);
    const rel = relPosix(ctx.cwd, touched);
    if (!pending.touched.includes(rel)) pending.touched.push(rel);
    if (mode === 'rewrite' || (mode === 'targeted' && pending.edit_mode !== 'rewrite')) pending.edit_mode = mode;
    savePending(ctx, pending);
  });
  log(ctx, `tool ${name} ${relPosix(ctx.cwd, touched)} mode=${mode ?? '-'}`);
}

function isFirstTouchOfEntry(ctx, fp) {
  const state = loadState(ctx);
  return resolve(ctx.cwd, fp) === ctx.entryPath && state.step === 0 && !state.last_hash;
}

/* ───────────── stop ───────────── */

async function onStop(ctx, input) {
  const state = loadState(ctx);
  const pending = loadPending(ctx);
  const html = existsSync(ctx.entryPath) ? readFileSync(ctx.entryPath) : null;
  const curHash = html ? sha256(html) : null;

  if (!html || pending.touched.length === 0 || curHash === state.last_hash) {
    log(
      ctx,
      `no step (entry=${!!html} touched=${pending.touched.length} changed=${curHash !== state.last_hash}) pending discarded`,
    );
    savePending(ctx, emptyPending());
    return;
  }

  const N = state.step + 1;
  mkdirSync(ctx.stepsDir, { recursive: true });
  writeFileSync(stepFile(ctx, N, '.html'), html);
  const htmlStr = html.toString('utf8');

  // diff: 이전 단계(또는 step-0 기준선)와 비교
  const prevPath = stepFile(ctx, N - 1, '.html');
  const prevStr = existsSync(prevPath) ? readFileSync(prevPath, 'utf8') : '';
  const { diff, added, removed } = await makeDiff(ctx, prevStr, htmlStr, N);

  // transcript → why / lesson / verdict / intent / model / version
  const tr = parseTranscript(input.transcript_path);
  const note = tr.note || {};
  const intent = INTENTS.has(note.intent) ? note.intent : N === 1 ? 'init' : classifyIntent(pending.prompts);
  const why = clip(
    (typeof note.why === 'string' && note.why.trim()) || tr.lastParagraph || pending.prompts.at(-1) || '',
    LIMITS.why,
  );
  const lesson = typeof note.lesson === 'string' && note.lesson.trim() ? clip(note.lesson.trim(), LIMITS.lesson) : null;
  const verdict = VERDICTS.has(note.verdict) ? note.verdict : null;

  // 스크린샷 + 검사 (실패해도 null 로 계속)
  const vis = await captureVisuals(ctx, N);

  const record = {
    schema: 'mm.step/1',
    pack_id: ctx.config.pack_id ?? null,
    series_id: ctx.config.series_id ?? basename(ctx.cwd),
    step: N,
    ts: Date.now(),
    domain: ctx.config.domain ?? 'design.web',
    tool: { name: 'claude-code', version: tr.version ?? null },
    model: tr.model ?? null,
    prompts: pending.prompts,
    intent,
    edit_mode: pending.edit_mode,
    files_touched: pending.touched,
    diff,
    html_full: Buffer.byteLength(htmlStr) <= LIMITS.html ? htmlStr : null,
    html_sha256: curHash,
    screenshot: vis.screenshot,
    screenshot_mobile: vis.screenshot_mobile,
    check: vis.check,
    why,
    lesson,
    verdict,
    prev_hash: prevHashFor(ctx, N, state, record0Seed(ctx)),
    record_hash: '',
  };
  record.record_hash = recordHash(record);

  writeJsonAtomic(stepFile(ctx, N, '.json'), record);
  if (vis.checkDetails) writeJsonAtomic(stepFile(ctx, N, '.check.json'), vis.checkDetails);

  saveState(ctx, { ...state, step: N, last_hash: curHash, prev_record_hash: record.record_hash });
  savePending(ctx, emptyPending());

  const git = gitCommit(ctx, N);

  const modeStr = record.edit_mode ?? (N === 1 ? 'init' : 'edit');
  const msg = `[mm] step ${N} captured · ${modeStr} +${added}/-${removed} · shot ${vis.shotStatus} · check ${vis.checkStr}`;
  process.stdout.write(JSON.stringify({ systemMessage: msg }) + '\n');
  log(ctx, `${msg} · git ${git} · ${((Date.now() - T0) / 1000).toFixed(1)}s · hash ${record.record_hash.slice(0, 12)}`);
}

const record0Seed = (ctx) => genesisHash(ctx.config.pack_id, ctx.config.series_id ?? basename(ctx.cwd));

function prevHashFor(ctx, N, state, genesis) {
  if (N === 1) return genesis;
  if (state.prev_record_hash) return state.prev_record_hash;
  const prev = readJson(stepFile(ctx, N - 1, '.json'), null);
  if (prev && typeof prev.record_hash === 'string') return prev.record_hash;
  log(ctx, `prev record hash missing for step ${N - 1}; falling back to genesis`);
  return genesis;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function classifyIntent(prompts) {
  const t = prompts.join(' ');
  if (/되돌|원래대로|revert|undo|롤백|roll\s?back|이전으로/i.test(t)) return 'revert';
  if (/다듬|정리|polish|tidy|clean\s?up|refine|깔끔/i.test(t)) return 'polish';
  return 'fix';
}

async function makeDiff(ctx, prevStr, curStr, N) {
  let diff = '';
  try {
    const { createTwoFilesPatch } = await import('diff');
    const name = ctx.entryRel;
    diff = createTwoFilesPatch(`${name}@step-${N - 1}`, `${name}@step-${N}`, prevStr, curStr, undefined, undefined, { context: 2 })
      .replace(/^=+\r?\n/, ''); // jsdiff 의 index 줄은 뺀다
  } catch (e) {
    log(ctx, `diff failed: ${e?.message || e}`);
    diff = `(diff unavailable: ${e?.message || e})`;
  }
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { diff: truncateBytes(diff, LIMITS.diff), added, removed };
}

/* ───────────── transcript ───────────── */

const NOTE_RE = /```step-note[^\n]*\n([\s\S]*?)```/g;

function isHumanPrompt(message) {
  const c = message?.content;
  if (typeof c === 'string') return c.trim().length > 0;
  if (Array.isArray(c)) return !c.some((b) => b?.type === 'tool_result') && c.some((b) => b?.type === 'text' && b.text);
  return false;
}

/** 마지막 사람 프롬프트 이후의 assistant 텍스트에서 why 후보·step-note·모델·버전을 뽑는다 */
function parseTranscript(path) {
  const res = { lastParagraph: '', note: null, model: null, version: null };
  try {
    if (!path || !existsSync(path)) return res;
    const entries = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        /* 깨진 줄은 건너뜀 */
      }
    }
    let lastHuman = -1;
    entries.forEach((e, i) => {
      if (!e || e.isSidechain) return;
      if (e.version) res.version = String(e.version);
      if (e.type === 'user' && !e.isMeta && isHumanPrompt(e.message)) lastHuman = i;
    });
    const texts = [];
    for (let i = lastHuman + 1; i < entries.length; i++) {
      const e = entries[i];
      if (!e || e.isSidechain || e.type !== 'assistant') continue;
      const m = e.message || {};
      if (m.model) res.model = String(m.model);
      const c = m.content;
      if (typeof c === 'string') texts.push(c);
      else if (Array.isArray(c)) for (const b of c) if (b?.type === 'text' && b.text) texts.push(b.text);
    }
    const joined = texts.join('\n\n');
    let m;
    NOTE_RE.lastIndex = 0;
    while ((m = NOTE_RE.exec(joined))) {
      try {
        const parsed = JSON.parse(m[1]);
        if (parsed && typeof parsed === 'object') res.note = parsed; // 마지막 유효 블록이 이긴다
      } catch {
        /* ignore */
      }
    }
    const cleaned = joined.replace(NOTE_RE, '').trim();
    const paras = cleaned
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    res.lastParagraph = paras.length ? paras[paras.length - 1] : '';
  } catch {
    /* transcript 는 선택 사항 */
  }
  return res;
}

/* ───────────── 스크린샷 · 검사 ───────────── */

/** 스크린샷 2장 + 검사 5항목. 브라우저 1회 기동, 페이지 로드 2회. 무엇이 실패하든 null 로 계속한다. */
async function captureVisuals(ctx, N) {
  const out = { screenshot: null, screenshot_mobile: null, check: null, checkDetails: null, shotStatus: 'fail', checkStr: 'n/a' };
  const t = Date.now();
  const timeoutMs = Math.min(60000, Math.max(10000, HOOK_BUDGET_MS - (Date.now() - T0) - 10000));
  try {
    const { shootAndCheck } = await import('./check.mjs');
    const { shot: r, check: c } = await shootAndCheck(ctx.entryPath, {
      outPrefix: join(ctx.stepsDir, `step-${N}`),
      viewport: ctx.viewport,
      mobile: ctx.mobile,
      maxBytes: LIMITS.shotBytes,
      mobileMaxBytes: LIMITS.mobileBytes,
      only: Array.isArray(ctx.config.checks) && ctx.config.checks.length ? ctx.config.checks : null,
      timeoutMs,
    });
    if (r.error) log(ctx, `shot: ${r.error}`);
    if (r.desktop && !r.desktop.oversize) {
      out.screenshot = { mime: 'image/jpeg', w: r.desktop.w, h: r.desktop.h, sha256: r.desktop.sha256, b64: r.desktop.buffer.toString('base64') };
    } else if (r.desktop) log(ctx, `shot: desktop jpeg ${r.desktop.bytes}B still over ${LIMITS.shotBytes}B at q${r.desktop.quality}; not embedded`);
    if (r.mobile && !r.mobile.oversize) {
      out.screenshot_mobile = { w: r.mobile.w, h: r.mobile.h, sha256: r.mobile.sha256, b64: r.mobile.buffer.toString('base64') };
    }
    out.shotStatus = out.screenshot ? 'ok' : 'fail';
    if (c.details?.error) log(ctx, `check: ${c.details.error}`);
    const total = c.passed.length + c.failed.length;
    if (total > 0) {
      out.check = { passed: c.passed, failed: c.failed };
      out.checkDetails = c.details;
      out.checkStr = `${c.passed.length}/${total}`;
    }
  } catch (e) {
    log(ctx, `visuals failed (playwright missing?): ${e?.message || e}`);
  }
  log(ctx, `visuals ${((Date.now() - t) / 1000).toFixed(1)}s (budget ${(timeoutMs / 1000).toFixed(0)}s)`);
  return out;
}

/* ───────────── git ───────────── */

function gitCommit(ctx, N) {
  if (ctx.config.git === false || process.env.MM_NO_GIT) return 'off';
  const opts = { cwd: ctx.cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, windowsHide: true };
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], opts);
  } catch {
    return 'no-repo';
  }
  try {
    execFileSync('git', ['add', '-A', '--', '.'], opts);
    execFileSync('git', ['commit', '-q', '-m', `mm step ${N}`, '--', '.'], opts);
    return 'ok';
  } catch (e) {
    log(ctx, `git commit failed: ${String(e?.stderr || e?.message || e).trim().slice(0, 300)}`);
    return 'fail';
  }
}

/* ───────────── main ───────────── */

async function main() {
  const input = readStdinJson();
  const cwd = resolve(String(input.cwd || process.cwd()));
  const ctx = loadCtx(cwd);
  if (!ctx) return; // mm 세션이 아닌 폴더 — 조용히 종료
  CTX = ctx;
  try {
    if (EVENT === 'prompt') onPrompt(ctx, input);
    else if (EVENT === 'tool') onTool(ctx, input);
    else if (EVENT === 'stop') await onStop(ctx, input);
    else log(ctx, `unknown event '${EVENT}' (expected prompt|tool|stop)`);
  } catch (e) {
    log(ctx, `error: ${e?.stack || e}`);
  }
}

await main();
process.exit(0);
