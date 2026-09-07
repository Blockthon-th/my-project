#!/usr/bin/env node
/**
 * tools/selftest.mjs — 네트워크·Claude 없이 포집 전 과정을 검증한다.
 *
 *   cd tools && node selftest.mjs [--keep]
 *
 * 임시 폴더에 .mm/config.json 과 index.html 을 만들고, Claude Code 훅 stdin JSON 을 흉내 내어
 * capture.mjs 를 prompt → tool → stop 순으로 여러 턴 돌린다. 가짜 transcript JSONL 도 만든다.
 *
 *   시나리오 A  T1 생성(결함 4개) → T2 변경 없음(Edit 이벤트는 있음) → T2b 도구 없음 → T3 수정(step-note 있음)
 *   시나리오 B  entry 가 이미 있는 폴더: prompt 시 step-0 기준선 → 변경 없는 턴 폐기 → 실제 변경 → step-1 diff 는 기준선 대비
 *   시나리오 C  결함 없는 페이지에서 check.mjs 5/5 (오탐 없음), .mm 없는 폴더에서는 아무것도 안 함
 *
 * 모두 통과하면 마지막 줄에 SELFTEST OK.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_IDS, runChecks } from './check.mjs';
import { genesisHash, readJson, recordHash, sha256 } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURE = join(HERE, 'capture.mjs');
const ROOT = process.env.MM_SELFTEST_DIR ? resolve(process.env.MM_SELFTEST_DIR) : tmpdir();
const KEEP = process.argv.includes('--keep');
mkdirSync(ROOT, { recursive: true });

/* ───────────── 픽스처 ───────────── */

const HEAD = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lumen</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:#222}
nav.top{position:fixed;top:0;left:0;right:0;height:64px;background:#fff;display:flex;align-items:center;padding:0 24px;gap:16px;border-bottom:1px solid #eee}
nav.top a{color:#333;text-decoration:none}
section.hero{padding:16px 24px 48px;background:#f3f6fb}
h1{font-size:56px;line-height:1.1;margin:0 0 16px;max-width:900px}
.plan{flex:1;min-width:0;border:1px solid #ddd;border-radius:12px;padding:24px;background:#fff}
.plan h3{margin:0 0 8px}.price{font-size:32px;font-weight:700}
@media (max-width:600px){section.plans{flex-direction:column}}
`;
const BODY = `</style></head><body>
<nav class="top"><a href="#">Lumen</a><a href="#plans">요금</a></nav>
<section class="hero">
  <h1>팀을 위한 빛나는 대시보드</h1>
  <p>한 곳에서 지표를 모으고, 매일 아침 요약을 받으세요.</p>
  <a class="cta" href="#plans">무료로 시작하기</a>
  <div class="banner">고정 폭 600px 배너</div>
</section>
<section class="plans" id="plans">
  <div class="plan"><h3>Starter</h3><div class="price">₩9,900<span>/월</span></div><p>1 workspace</p></div>
  <div class="plan"><h3>Team</h3><div class="price">₩29,000<span>/월</span></div><p>5 workspaces</p><p>SSO</p><p>감사 로그</p><p>우선 지원</p><p>API 접근</p></div>
  <div class="plan"><h3>Business</h3><div class="price">₩99,000<span>/월</span></div><p>무제한</p><p>SLA</p></div>
</section>
</body></html>
`;
/** v1: 대비 낮은 CTA, 375px 넘치는 600px 배너, 높이 제각각인 카드, h1 을 가리는 고정 nav */
const V1 =
  HEAD +
  `.cta{display:inline-block;padding:16px 32px;font-size:20px;background:#9bb8d9;color:#fff;border-radius:8px;text-decoration:none}
.banner{width:600px;height:48px;background:#ffd;border:1px solid #cc9;margin:16px 0}
section.plans{display:flex;gap:16px;align-items:flex-start;padding:32px 24px}
` +
  BODY;
/** v2: CTA 대비와 배너 폭만 고침(nav·카드 결함은 남김) */
const V2 =
  HEAD +
  `.cta{display:inline-block;padding:16px 32px;font-size:20px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none}
.banner{width:600px;max-width:100%;height:48px;background:#ffd;border:1px solid #cc9;margin:16px 0}
section.plans{display:flex;gap:16px;align-items:flex-start;padding:32px 24px}
` +
  BODY;
/** v3: 전부 고침 */
const V3 =
  HEAD +
  `body{padding-top:64px}
.cta{display:inline-block;padding:16px 32px;font-size:20px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none}
.banner{width:600px;max-width:100%;height:48px;background:#ffd;border:1px solid #cc9;margin:16px 0}
section.plans{display:flex;gap:16px;align-items:stretch;padding:32px 24px}
` +
  BODY;

const P1 = '랜딩 페이지 index.html 만들어줘';
const A1 = '랜딩 페이지를 만들었습니다.\n\n히어로 · 가격 카드 · CTA 로 구성했고 배경은 밝은 톤으로 잡았습니다.';
const P2 = '색 어때?';
const P2B = '고마워';
const P3 = 'CTA 대비 올리고 모바일에서 가로 스크롤 생기는 것 고쳐줘';
const NOTE3 = {
  intent: 'fix',
  target: '.cta',
  why: 'CTA 대비 2.05:1 → 6.7:1, 고정 px 폭 배너가 375px 에서 넘쳤다',
  lesson: '고정 px 폭 요소에는 항상 max-width:100% 를 함께 둔다',
  verdict: 'accepted',
};
const A3 =
  'CTA 배경을 진한 파랑으로 바꾸고, 600px 고정 폭 배너에 max-width:100% 를 줬습니다.\n\n' +
  '```step-note\n' +
  JSON.stringify(NOTE3) +
  '\n```\n\n검사 결과를 확인해 주세요.';

/* ───────────── 유틸 ───────────── */

let failures = 0;
let passes = 0;
function assert(cond, msg, extra) {
  if (cond) {
    passes++;
    process.stdout.write(`  ok   ${msg}\n`);
  } else {
    failures++;
    process.stdout.write(`  FAIL ${msg}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : ''}\n`);
  }
}
const section = (t) => process.stdout.write(`\n── ${t}\n`);

function hook(dir, event, input, label) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [CAPTURE, event], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 90000,
    windowsHide: true,
  });
  const ms = Date.now() - t;
  assert(r.status === 0, `${label}: exit 0 (${ms}ms)`, { status: r.status, stderr: (r.stderr || '').slice(0, 300) });
  return { stdout: r.stdout || '', stderr: r.stderr || '', ms };
}

function parseSystemMessage(stdout) {
  const line = stdout.split('\n').find((l) => l.trim());
  if (!line) return null;
  try {
    return JSON.parse(line).systemMessage ?? null;
  } catch {
    return null;
  }
}

class Transcript {
  constructor(path) {
    this.path = path;
    this.n = 0;
    writeFileSync(path, '');
  }
  line(obj) {
    appendFileSync(
      this.path,
      JSON.stringify({ isSidechain: false, version: '2.1.0', timestamp: new Date().toISOString(), uuid: `u${++this.n}`, ...obj }) + '\n',
    );
  }
  human(text) {
    this.line({ type: 'user', message: { role: 'user', content: text } });
  }
  meta(text) {
    this.line({ type: 'user', isMeta: true, message: { role: 'user', content: text } });
  }
  assistant(blocks, model = 'claude-opus-4-1') {
    this.line({ type: 'assistant', message: { role: 'assistant', model, content: blocks } });
  }
  toolResult(id) {
    this.line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
  }
}

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}
function gitInit(dir) {
  try {
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.email', 'selftest@example.com']);
    git(dir, ['config', 'user.name', 'mm selftest']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    return true;
  } catch (e) {
    process.stdout.write(`  (git unavailable: ${String(e.message).slice(0, 80)} — git 검증 생략)\n`);
    return false;
  }
}

function makeProject(tag, { entryHtml = null, seriesId = 'selftest-series' } = {}) {
  const dir = mkdtempSync(join(ROOT, `mm-selftest-${tag}-`));
  mkdirSync(join(dir, '.mm'));
  writeFileSync(
    join(dir, '.mm', 'config.json'),
    JSON.stringify({ entry: 'index.html', viewport: [1280, 800], mobile: [375, 812], series_id: seriesId, checks: CHECK_IDS }, null, 2),
  );
  if (entryHtml != null) writeFileSync(join(dir, 'index.html'), entryHtml);
  return dir;
}

const HEX64 = /^[0-9a-f]{64}$/;
const KEYS = [
  'schema', 'pack_id', 'series_id', 'step', 'ts', 'domain', 'tool', 'model', 'prompts', 'intent', 'edit_mode',
  'files_touched', 'diff', 'html_full', 'html_sha256', 'screenshot', 'screenshot_mobile', 'check', 'why', 'lesson',
  'verdict', 'prev_hash', 'record_hash',
];

function validateRecord(r, label) {
  assert(!!r, `${label}: record exists`);
  if (!r) return;
  assert(JSON.stringify(Object.keys(r).sort()) === JSON.stringify([...KEYS].sort()), `${label}: exact mm.step/1 key set`, Object.keys(r));
  assert(r.schema === 'mm.step/1', `${label}: schema`);
  assert(r.pack_id === null || typeof r.pack_id === 'string', `${label}: pack_id`);
  assert(typeof r.series_id === 'string' && r.series_id.length > 0, `${label}: series_id`);
  assert(Number.isInteger(r.step) && r.step >= 1, `${label}: step int`);
  assert(Number.isInteger(r.ts) && r.ts > 1.6e12, `${label}: ts ms`);
  assert(['design.web', 'dev.sui'].includes(r.domain), `${label}: domain`);
  assert(r.tool && r.tool.name === 'claude-code' && (r.tool.version === null || typeof r.tool.version === 'string'), `${label}: tool`, r.tool);
  assert(r.model === null || typeof r.model === 'string', `${label}: model`);
  assert(Array.isArray(r.prompts) && r.prompts.every((s) => typeof s === 'string'), `${label}: prompts`);
  assert(['init', 'fix', 'revert', 'polish'].includes(r.intent), `${label}: intent enum`, r.intent);
  assert([null, 'targeted', 'rewrite'].includes(r.edit_mode), `${label}: edit_mode enum`, r.edit_mode);
  assert(Array.isArray(r.files_touched) && r.files_touched.every((s) => typeof s === 'string'), `${label}: files_touched`);
  assert(typeof r.diff === 'string' && Buffer.byteLength(r.diff) <= 8192, `${label}: diff ≤ 8KB`, Buffer.byteLength(r.diff));
  assert(r.html_full === null || (typeof r.html_full === 'string' && Buffer.byteLength(r.html_full) <= 40960), `${label}: html_full ≤ 40KB`);
  assert(r.html_sha256 === null || HEX64.test(r.html_sha256), `${label}: html_sha256`);
  if (r.screenshot) {
    const s = r.screenshot;
    assert(JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['b64', 'h', 'mime', 'sha256', 'w']), `${label}: screenshot keys`, Object.keys(s));
    assert(s.mime === 'image/jpeg' && Number.isInteger(s.w) && Number.isInteger(s.h), `${label}: screenshot mime/w/h`);
    assert(typeof s.b64 === 'string' && s.b64.length <= 122880, `${label}: screenshot b64 ≤ 120KB`, s.b64.length);
    assert(sha256(Buffer.from(s.b64, 'base64')) === s.sha256, `${label}: screenshot sha256 matches bytes`);
  }
  if (r.screenshot_mobile) {
    const s = r.screenshot_mobile;
    assert(JSON.stringify(Object.keys(s).sort()) === JSON.stringify(['b64', 'h', 'sha256', 'w']), `${label}: screenshot_mobile keys`, Object.keys(s));
    assert(sha256(Buffer.from(s.b64, 'base64')) === s.sha256, `${label}: screenshot_mobile sha256 matches bytes`);
  }
  assert(
    r.check === null || (Array.isArray(r.check.passed) && Array.isArray(r.check.failed) && Object.keys(r.check).length === 2),
    `${label}: check shape`,
    r.check,
  );
  assert(typeof r.why === 'string', `${label}: why string`);
  assert(r.lesson === null || typeof r.lesson === 'string', `${label}: lesson`);
  assert([null, 'accepted', 'rejected', 'partial'].includes(r.verdict), `${label}: verdict enum`);
  assert(HEX64.test(r.prev_hash), `${label}: prev_hash hex`);
  assert(HEX64.test(r.record_hash) && recordHash(r) === r.record_hash, `${label}: record_hash recomputes from canonical JSON`);
}

const includesAll = (arr, want) => want.every((w) => (arr || []).includes(w));

/* ───────────── 시나리오 A ───────────── */

async function scenarioA() {
  section('A. 생성 → 변경 없음 → 도구 없음 → 수정(step-note)');
  const dir = makeProject('A');
  const hasGit = gitInit(dir);
  const entry = join(dir, 'index.html');
  const tr = new Transcript(join(dir, 'transcript.jsonl'));
  const base = { session_id: 'sess-selftest', cwd: dir, transcript_path: tr.path };
  const step = (n, ext) => join(dir, '.mm', 'steps', `step-${n}${ext}`);
  const state = () => readJson(join(dir, '.mm', 'state.json'), {});
  const pending = () => readJson(join(dir, '.mm', 'pending.json'), {});
  const timings = [];

  // T1 — Write 로 생성
  tr.human(P1);
  tr.meta('<system-reminder>hook context — 사람 프롬프트가 아니다</system-reminder>');
  hook(dir, 'prompt', { ...base, hook_event_name: 'UserPromptSubmit', prompt: P1 }, 'T1 prompt');
  assert(!existsSync(step(0, '.html')), 'T1: entry 가 없으면 step-0 기준선을 만들지 않는다');
  assert(JSON.stringify(pending().prompts) === JSON.stringify([P1]), 'T1: pending.prompts 누적', pending());
  tr.assistant([{ type: 'text', text: '만들겠습니다.' }, { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: entry, content: V1 } }]);
  writeFileSync(entry, V1);
  hook(dir, 'tool', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: entry, content: V1 }, tool_response: { type: 'create', filePath: entry } }, 'T1 tool(Write create)');
  assert(JSON.stringify(pending().touched) === JSON.stringify(['index.html']), 'T1: touched 에 상대 경로', pending());
  assert(pending().edit_mode === null, 'T1: 새 파일 Write 는 edit_mode 를 정하지 않는다', pending());
  tr.toolResult('t1');
  tr.assistant([{ type: 'text', text: A1 }]);
  const s1 = hook(dir, 'stop', { ...base, hook_event_name: 'Stop', stop_hook_active: false }, 'T1 stop');
  timings.push(['T1 stop', s1.ms]);
  const msg1 = parseSystemMessage(s1.stdout);
  assert(/^\[mm\] step 1 captured · init \+\d+\/-\d+ · shot ok · check \d\/5$/.test(msg1 || ''), 'T1: systemMessage 형식', msg1);
  for (const ext of ['.html', '.json', '.jpg', '.m.jpg', '.check.json']) assert(existsSync(step(1, ext)), `T1: step-1${ext} 존재`);
  const r1 = readJson(step(1, '.json'));
  validateRecord(r1, 'step-1');
  if (r1) {
    assert(r1.step === 1 && r1.intent === 'init' && r1.edit_mode === null, 'T1: step/intent/edit_mode', { step: r1.step, intent: r1.intent, edit_mode: r1.edit_mode });
    assert(JSON.stringify(r1.prompts) === JSON.stringify([P1]) && JSON.stringify(r1.files_touched) === JSON.stringify(['index.html']), 'T1: prompts/files_touched');
    assert(r1.why === '히어로 · 가격 카드 · CTA 로 구성했고 배경은 밝은 톤으로 잡았습니다.', 'T1: why = assistant 마지막 문단 (tool_result 메시지는 경계가 아님)', r1.why);
    assert(r1.lesson === null && r1.verdict === null, 'T1: step-note 없으면 lesson/verdict null');
    assert(r1.model === 'claude-opus-4-1' && r1.tool.version === '2.1.0', 'T1: model/tool.version 은 transcript 에서', { model: r1.model, tool: r1.tool });
    assert(r1.prev_hash === genesisHash(undefined, 'selftest-series') && r1.prev_hash === sha256('selftest-series'), 'T1: prev_hash = sha256(pack_id("")+series_id)');
    assert(r1.html_sha256 === sha256(V1) && r1.html_full === V1, 'T1: html_sha256/html_full');
    assert(r1.diff.includes('@@') && /^\+.*9bb8d9/m.test(r1.diff), 'T1: 빈 파일 → v1 unified diff', r1.diff.slice(0, 200));
    assert(r1.screenshot && r1.screenshot.w === 1280 && r1.screenshot.h === 800, 'T1: 데스크톱 스크린샷 1280x800');
    assert(r1.screenshot_mobile && r1.screenshot_mobile.w === 375 && r1.screenshot_mobile.h === 812, 'T1: 모바일 스크린샷 375x812');
    assert(r1.check && includesAll(r1.check.failed, ['cta-contrast', 'no-hscroll', 'card-height', 'nav-overlap']), 'T1: check 가 심어둔 결함 4개를 잡는다', r1.check);
    assert(r1.check && includesAll(r1.check.passed, ['h1-lines']), 'T1: h1-lines 는 통과', r1.check);
    assert(r1.series_id === 'selftest-series' && r1.pack_id === null && r1.domain === 'design.web', 'T1: series/pack/domain');
  }
  assert(state().step === 1 && state().last_hash === sha256(V1) && state().prev_record_hash === r1?.record_hash, 'T1: state 갱신', state());
  assert(pending().prompts.length === 0 && pending().touched.length === 0, 'T1: pending 초기화', pending());

  // T2 — Edit 이벤트는 있지만 내용이 같다 → sha 규칙으로 폐기
  tr.human(P2);
  hook(dir, 'prompt', { ...base, hook_event_name: 'UserPromptSubmit', prompt: P2 }, 'T2 prompt');
  tr.assistant([{ type: 'text', text: '확인합니다.' }, { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: entry, old_string: 'x', new_string: 'x' } }]);
  hook(dir, 'tool', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: entry, old_string: 'x', new_string: 'x' } }, 'T2 tool(Edit no-op)');
  tr.toolResult('t2');
  tr.assistant([{ type: 'text', text: '변경할 것이 없습니다.' }]);
  const s2 = hook(dir, 'stop', { ...base, hook_event_name: 'Stop' }, 'T2 stop');
  timings.push(['T2 stop', s2.ms]);
  assert(!s2.stdout.includes('captured'), 'T2: 파일 내용이 같으면 단계가 늘지 않는다', s2.stdout);
  assert(state().step === 1 && !existsSync(step(2, '.json')), 'T2: state.step 그대로 1');
  assert(pending().prompts.length === 0, 'T2: 폐기 후 pending 비움', pending());

  // T2b — 도구 호출이 전혀 없는 턴
  tr.human(P2B);
  hook(dir, 'prompt', { ...base, hook_event_name: 'UserPromptSubmit', prompt: P2B }, 'T2b prompt');
  tr.assistant([{ type: 'text', text: '천만에요.' }]);
  const s2b = hook(dir, 'stop', { ...base, hook_event_name: 'Stop' }, 'T2b stop');
  timings.push(['T2b stop', s2b.ms]);
  assert(!s2b.stdout.includes('captured') && state().step === 1, 'T2b: touched 비면 단계 없음');

  // T3 — 실제 수정 + step-note
  tr.human(P3);
  hook(dir, 'prompt', { ...base, hook_event_name: 'UserPromptSubmit', prompt: P3 }, 'T3 prompt');
  tr.assistant([{ type: 'text', text: '고치겠습니다.' }, { type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: entry, old_string: '#9bb8d9', new_string: '#1d4ed8' } }]);
  writeFileSync(entry, V2);
  hook(dir, 'tool', { ...base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: entry, old_string: '#9bb8d9', new_string: '#1d4ed8' } }, 'T3 tool(Edit)');
  tr.toolResult('t3');
  tr.assistant([{ type: 'text', text: A3 }]);
  const s3 = hook(dir, 'stop', { ...base, hook_event_name: 'Stop' }, 'T3 stop');
  timings.push(['T3 stop', s3.ms]);
  const msg3 = parseSystemMessage(s3.stdout);
  assert(/^\[mm\] step 2 captured · targeted \+\d+\/-\d+ · shot ok · check 3\/5$/.test(msg3 || ''), 'T3: systemMessage (targeted, check 3/5)', msg3);
  const r2 = readJson(step(2, '.json'));
  validateRecord(r2, 'step-2');
  if (r2 && r1) {
    assert(r2.prev_hash === r1.record_hash, 'T3: prev_hash 체인 = step-1.record_hash');
    assert(r2.intent === 'fix' && r2.why === NOTE3.why && r2.lesson === NOTE3.lesson && r2.verdict === 'accepted', 'T3: step-note 가 why/lesson/verdict/intent 를 우선한다', { intent: r2.intent, why: r2.why, lesson: r2.lesson, verdict: r2.verdict });
    assert(r2.edit_mode === 'targeted', 'T3: Edit → targeted');
    assert(/^-.*9bb8d9/m.test(r2.diff) && /^\+.*1d4ed8/m.test(r2.diff), 'T3: diff 에 -구색 / +신색', r2.diff.slice(0, 300));
    assert(JSON.stringify(r2.prompts) === JSON.stringify([P3]), 'T3: 폐기된 턴의 프롬프트는 섞이지 않는다', r2.prompts);
    assert(r2.check && includesAll(r2.check.passed, ['cta-contrast', 'no-hscroll', 'h1-lines']), 'T3: 고친 결함은 통과로 바뀐다', r2.check);
    assert(r2.check && includesAll(r2.check.failed, ['card-height', 'nav-overlap']), 'T3: 남긴 결함은 계속 실패', r2.check);
    assert(r2.html_sha256 === sha256(V2), 'T3: html_sha256 = v2');
  }
  assert(state().step === 2 && state().last_hash === sha256(V2) && state().prev_record_hash === r2?.record_hash, 'T3: state 갱신', state());
  const files = existsSync(join(dir, '.mm', 'steps')) ? readdirSync(join(dir, '.mm', 'steps')) : [];
  assert(!files.some((f) => /^step-[03-9]/.test(f)), 'A: steps 폴더에 step-1/2 만 있다', files);
  assert(existsSync(join(dir, '.mm', 'capture.log')), 'A: .mm/capture.log 기록');

  if (hasGit) {
    const log = git(dir, ['log', '--format=%s']);
    assert(log.includes('mm step 1') && log.includes('mm step 2'), 'A: git commit "mm step N"', log.trim());
  }
  // 시간은 머신 부하에 좌우되므로 실패 조건이 아니라 참고로만 찍는다(단계가 예산 안에 기록됐는지는 위에서 확인).
  for (const [k, ms] of timings) {
    process.stdout.write(`  time ${k} ${ms}ms${ms > 8000 ? '  (목표 8초 초과 — 머신 부하 확인)' : ''}\n`);
  }
  return dir;
}

/* ───────────── 시나리오 B ───────────── */

async function scenarioB() {
  section('B. entry 가 이미 있는 폴더 — step-0 기준선');
  const dir = makeProject('B', { entryHtml: V1, seriesId: 'baseline-series' });
  const entry = join(dir, 'index.html');
  const tr = new Transcript(join(dir, 'transcript.jsonl'));
  const base = { session_id: 'sess-b', cwd: dir, transcript_path: tr.path };
  const step = (n, ext) => join(dir, '.mm', 'steps', `step-${n}${ext}`);
  const state = () => readJson(join(dir, '.mm', 'state.json'), {});

  tr.human('CTA 색 진하게');
  hook(dir, 'prompt', { ...base, prompt: 'CTA 색 진하게' }, 'B1 prompt');
  assert(existsSync(step(0, '.html')) && state().last_hash === sha256(V1), 'B1: prompt 시 step-0.html 기준선 + last_hash', state());
  hook(dir, 'tool', { ...base, tool_name: 'Edit', tool_input: { file_path: 'index.html', old_string: 'a', new_string: 'a' } }, 'B1 tool(no-op)');
  tr.assistant([{ type: 'text', text: '이미 그렇게 돼 있습니다.' }]);
  const b1 = hook(dir, 'stop', { ...base }, 'B1 stop');
  assert(!b1.stdout.includes('captured') && (state().step || 0) === 0, 'B1: 기준선과 같으면 폐기', b1.stdout);

  tr.human('진짜로 바꿔줘');
  hook(dir, 'prompt', { ...base, prompt: '진짜로 바꿔줘' }, 'B2 prompt');
  writeFileSync(entry, V2);
  hook(dir, 'tool', { ...base, tool_name: 'MultiEdit', tool_input: { file_path: entry, edits: [] } }, 'B2 tool(MultiEdit)');
  tr.assistant([{ type: 'text', text: '바꿨습니다.\n\n대비 6.7:1 입니다.' }]);
  const b2 = hook(dir, 'stop', { ...base }, 'B2 stop');
  const rb = readJson(step(1, '.json'));
  validateRecord(rb, 'B step-1');
  if (rb) {
    assert(rb.intent === 'init' && rb.edit_mode === 'targeted', 'B2: 첫 단계는 init, MultiEdit → targeted', { intent: rb.intent, edit_mode: rb.edit_mode });
    assert(/^-.*9bb8d9/m.test(rb.diff) && !/^\+<!doctype/m.test(rb.diff), 'B2: diff 는 기준선 대비(전체 추가가 아님)', rb.diff.slice(0, 200));
    assert(rb.prev_hash === sha256('baseline-series'), 'B2: prev_hash genesis');
    assert(rb.why === '대비 6.7:1 입니다.', 'B2: why 마지막 문단', rb.why);
  }
  assert(/step 1 captured · targeted/.test(parseSystemMessage(b2.stdout) || ''), 'B2: systemMessage', b2.stdout);
  return dir;
}

/* ───────────── 시나리오 C ───────────── */

async function scenarioC() {
  section('C. 오탐 없음 · .mm 없는 폴더');
  const dir = mkdtempSync(join(ROOT, 'mm-selftest-C-'));
  const clean = join(dir, 'clean.html');
  writeFileSync(clean, V3);
  const t = Date.now();
  const c = await runChecks(clean);
  assert(c.passed.length === 5 && c.failed.length === 0, `C: 결함 없는 페이지는 5/5 (${Date.now() - t}ms)`, c);
  assert(JSON.stringify(c.passed) === JSON.stringify(CHECK_IDS), 'C: passed 는 고정 id 순서', c.passed);

  const only = await runChecks(join(dir, 'clean.html'), { only: ['no-hscroll', { id: 'h1-lines', desc: 'x' }] });
  assert(JSON.stringify(only.passed) === JSON.stringify(['h1-lines', 'no-hscroll']), 'C: only 로 항목 제한(문자열/객체 혼용)', only.passed);

  const plain = mkdtempSync(join(ROOT, 'mm-selftest-plain-'));
  const r = spawnSync(process.execPath, [CAPTURE, 'stop'], { cwd: plain, input: JSON.stringify({ cwd: plain }), encoding: 'utf8', windowsHide: true });
  assert(r.status === 0 && !r.stdout.trim() && !existsSync(join(plain, '.mm')), 'C: .mm/config.json 없으면 아무것도 안 하고 exit 0', { status: r.status, out: r.stdout });

  const bad = spawnSync(process.execPath, [CAPTURE, 'stop'], { cwd: plain, input: '{not json', encoding: 'utf8', windowsHide: true });
  assert(bad.status === 0, 'C: 깨진 stdin 이어도 exit 0');
  return [dir, plain];
}

/* ───────────── 실행 ───────────── */

const t0 = Date.now();
const made = [];
try {
  made.push(await scenarioA());
  made.push(await scenarioB());
  made.push(...(await scenarioC()));
} catch (e) {
  failures++;
  process.stdout.write(`  FAIL uncaught: ${e?.stack || e}\n`);
}

process.stdout.write(`\n${passes} passed, ${failures} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
if (failures === 0 && !KEEP) for (const d of made) rmSync(d, { recursive: true, force: true });
else process.stdout.write(`temp dirs kept:\n${made.map((d) => '  ' + d).join('\n')}\n`);
process.stdout.write(failures === 0 ? 'SELFTEST OK\n' : `SELFTEST FAILED (${failures})\n`);
process.exit(failures === 0 ? 0 : 1);
