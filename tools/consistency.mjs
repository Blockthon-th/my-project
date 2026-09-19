#!/usr/bin/env node
/**
 * 랜딩 · 저장소 · 체인이 서로 어긋나지 않는지 검사한다.
 *
 *   node tools/consistency.mjs
 *
 * 내는 것은 깃 저장소와 랜딩 페이지 두 개뿐인데, 둘이 서로 다른 말을 하거나
 * 체인에 실제로 없는 것을 있다고 적으면 그대로 거짓말이 된다. 그걸 기계로 잡는다.
 *
 * 검사하는 것
 *   1. 문서와 랜딩에 적힌 기록 주소가 지금도 살아 있나
 *   2. 문서가 가리키는 파일이 실제로 있나
 *   3. 문서가 가리키는 명령어가 실제로 있나
 *   4. 실측 수치가 모든 곳에서 같나 (사실표에 없는 시간·금액이 있으면 잡는다)
 *   5. 랜딩 첫 화면에 우리끼리 쓰는 말이 섞여 있나
 *   6. 사기 전에는 안 보여야 할 글이 화면 코드에 새어나갔나
 *   7. 체인에 올라간 컨트랙트가 저장소 소스와 같나
 *   8. 문서가 근거로 건 거래가 실제로 체인에 있고 성공했나
 *   9. README 의 기록 표(값·산 사람 수)가 체인과 같나
 *   8. 문서가 근거로 건 거래가 실제로 체인에 있고 성공했나
 *
 * 하나라도 어긋나면 종료 코드 1 로 끝난다.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196';
const GQL = 'https://graphql.testnet.sui.io/graphql';

/** 기간이 이보다 짧은 기록은 목록에 안 띄운다. 테스트로 올린 것을 걸러내는 장치다. */
const MIN_TTL_MS = 5 * 60 * 1000;

/** 기록 없이 세 번 한 실험과 기록을 산 한 번. 이 값 말고 다른 시간·금액이 나오면 잡는다. */
const MEASURED = new Set([
  '2분 0초', '3분 30초', '5분 50초', '3분 38초',
  '$0.70', '$1.17', '$1.88', '$1.20',
  '4분 20초', '$1.42',   // 뒤 둘은 기록 없이 한 세 번의 평균
  // 아래는 랜딩 상세 '이 기록을 쓰면' 의 데모용 가상 값 (웹퍼블리셔 외 세 기록). 실측 아님. README 솔직한 한계 참고.
  '6분 10초', '2분 40초', '$2.05', '$0.85',
  '4분 50초', '1분 50초', '$1.48', '$0.55',
  '12분 30초', '4분 10초', '$3.60', '$1.15',
]);

/** 우리 저장소 파일이 아니라 남의 프로젝트를 가리키는 이름 */
const FOREIGN = new Set(['subscription.move', 'error.mjs', 'time.rs', 'server.rs',
  'account.move', 'ownership-and-access.md']);   // 앞 넷은 Seal, 뒤 둘은 MemWal 것

/** 데모를 돌려야 생기는 것. 저장소에 없는 게 정상이다. */
const GENERATED = /(^|\/)(state|pending|evidence|check-result|compare-state)\.json$|^steps\/|settings\.local\.json$/;

let mismatches = 0, unsure = 0;
const bad = (m) => { mismatches++; console.log('  X  ' + m); };
const warn = (m) => { unsure++; console.log('  !  ' + m); };
const ok = (m) => console.log('  .  ' + m);

async function gql(query, variables) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

/** 체인에서 지금 팔리고 있는 기록을 읽어온다. */
async function readChain() {
  const ids = new Set();
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const d = await gql(
      'query($t:String!,$c:String){ events(filter:{type:$t}, first:50, after:$c){' +
      ' pageInfo{ hasNextPage endCursor } nodes{ contents{ json } } } }',
      { t: PKG + '::market::PackCreated', c: cursor });
    for (const n of d.events.nodes) {
      const j = n.contents && n.contents.json;
      if (j && j.pack_id) ids.add(j.pack_id);
    }
    if (!d.events.pageInfo.hasNextPage) break;
    cursor = d.events.pageInfo.endCursor;
  }
  const all = [];
  for (const id of ids) {
    const d = await gql('query($a:SuiAddress!){ object(address:$a){ asMoveObject{ contents{ json } } } }', { a: id });
    const j = d && d.object && d.object.asMoveObject && d.object.asMoveObject.contents.json;
    if (!j) { all.push({ id, gone: true }); continue; }
    all.push({
      id,
      name: j.name,
      count: Number(j.memory_count),
      fee: Number(j.fee) / 1e9,
      ttlMs: Number(j.ttl_ms),
      buyers: Number(j.subscriber_count),
      previews: (j.preview_blob_ids || []).length,
    });
  }
  return { all, listed: all.filter((p) => !p.gone && p.ttlMs >= MIN_TTL_MS) };
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', 'build', 'dist'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const chain = await readChain();
console.log('체인에서 읽었다. 전체 ' + chain.all.length + '개, 목록에 보이는 것 ' + chain.listed.length + '개\n');
for (const p of chain.listed) {
  console.log('  ' + p.name + ' · ' + p.count + '개 · ' + p.fee + ' SUI · '
    + (p.ttlMs / 3600000) + '시간 · 산 사람 ' + p.buyers + ' · 사기 전에 볼 수 있는 것 ' + p.previews);
}

const listed = new Set(chain.listed.map((p) => p.id.toLowerCase()));
const delisted = new Set(chain.all.map((p) => p.id.toLowerCase()).filter((id) => !listed.has(id)));
const allFiles = walk(ROOT).map((p) => relative(ROOT, p).split(String.fromCharCode(92)).join('/'));
const targets = walk(ROOT)
  .filter((p) => /\.(md|html|ts|mjs|json|move)$/.test(p))
  .filter((p) => !p.includes('ground-truth'))
  .filter((p) => !(p.includes('plugin') && p.endsWith('index.mjs')));   // esbuild 로 묶은 결과물

console.log('\n=== 1. 적혀 있는 기록 주소가 지금도 살아 있나 ===');
const seen = new Map();
for (const f of targets) {
  const txt = readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/0x[0-9a-f]{64}/gi)) {
    const id = m[0].toLowerCase();
    if (!seen.has(id)) seen.set(id, new Set());
    seen.get(id).add(relative(ROOT, f));
  }
}
let deadRefs = 0;
for (const [id, files] of seen) {
  if (id === PKG || listed.has(id)) continue;
  if (delisted.has(id)) {
    bad('내려간 기록을 아직 가리킨다 ' + id.slice(0, 12) + '… → ' + [...files].join(', '));
    deadRefs++;
  }
}
if (!deadRefs) ok('내려간 기록을 가리키는 곳 없음');

console.log('\n=== 2. 문서가 가리키는 파일이 실제로 있나 ===');
let missingFiles = 0;
const existsSomewhere = (c) => {
  const n = c.replace(/^[.]?[/]/, '');
  return allFiles.some((f) => f === n || f.endsWith('/' + n));
};
for (const f of targets.filter((p) => p.endsWith('.md'))) {
  const txt = readFileSync(f, 'utf8');
  const cands = new Set();
  for (const m of txt.matchAll(/`([a-zA-Z0-9_./-]+\.(?:ts|mjs|move|json|md|html|ps1))`/g)) cands.add(m[1]);
  for (const m of txt.matchAll(/\]\(((?!https?:|#)[^)]+?\.(?:ts|mjs|move|json|md|html))\)/g)) cands.add(m[1]);
  for (const c of cands) {
    if (c.startsWith('.') || FOREIGN.has(c) || GENERATED.test(c)) continue;
    if (/[<>*{]|step-N/.test(c) || /^(package|tsconfig)\.json$/.test(c)) continue;
    if (![join(dirname(f), c), join(ROOT, c)].some(existsSync) && !existsSomewhere(c)) {
      bad('없는 파일 `' + c + '` → ' + relative(ROOT, f));
      missingFiles++;
    }
  }
}
if (!missingFiles) ok('전부 있음');

console.log('\n=== 3. 문서가 가리키는 명령어가 실제로 있나 ===');
const commands = new Set();
for (const rel of ['scripts/package.json', 'tools/package.json']) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  for (const k of Object.keys(JSON.parse(readFileSync(p, 'utf8')).scripts || {})) commands.add(k);
}
let missingCmds = 0;
for (const f of targets.filter((p) => p.endsWith('.md'))) {
  const txt = readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/npm run ([a-z0-9:-]+)/g)) {
    if (!commands.has(m[1])) { bad('없는 명령 `npm run ' + m[1] + '` → ' + relative(ROOT, f)); missingCmds++; }
  }
}
if (!missingCmds) ok('전부 있음 (' + commands.size + '개 중에서)');

console.log('\n=== 4. 실측 수치가 모든 곳에서 같나 ===');
let odd = 0;
for (const f of targets.filter((p) => /(README|DEMO|landing-copy)\.md$|(compare|index)\.html$/.test(p))) {
  const txt = readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/\$\d+\.\d\d/g)) {
    if (!MEASURED.has(m[0])) { bad('실측표에 없는 금액 ' + m[0] + ' → ' + relative(ROOT, f)); odd++; }
  }
  for (const m of txt.matchAll(/\d+분 \d+초/g)) {
    if (!MEASURED.has(m[0])) { bad('실측표에 없는 시간 ' + m[0] + ' → ' + relative(ROOT, f)); odd++; }
  }
}
if (!odd) ok('지어낸 시간·금액 없음');

console.log('\n=== 5. 랜딩 첫 화면에 우리끼리 쓰는 말이 있나 ===');
const BANNED = ['팩', '온체인', '블롭', 'manifest', '구독권', '영수증', '지문', '해시', '네임스페이스', '메타데이터'];
const landing = readFileSync(join(ROOT, 'site', 'index.html'), 'utf8');
const bodyAt = landing.indexOf('<body');
const firstScreen = landing.slice(bodyAt, bodyAt + 6000).replace(/<script[\s\S]*?<\/script>/g, '');
let banned = 0;
for (const w of BANNED) if (firstScreen.includes(w)) { bad('첫 화면에 "' + w + '"'); banned++; }
if (!banned) ok('0건');

console.log('\n=== 6. 사기 전에 안 보여야 할 글이 새어나갔나 ===');
const leaked = [...landing.matchAll(/class="[^"]*\bmask\b[^"]*"[^>]*>([^<]*)</g)]
  .map((m) => m[1].trim()).filter(Boolean);
if (leaked.length) bad('가려진 자리에 글자 ' + leaked.length + '군데: ' + leaked.slice(0, 3).join(' / '));
else ok('없음');

console.log('\n=== 7. 체인의 컨트랙트가 저장소 소스와 같나 ===');
{
  const lines = readFileSync(join(ROOT, 'contracts/memory_market/sources/market.move'), 'utf8').split('\n');
  const srcFns = new Set();
  lines.forEach((ln, i) => {
    const m = /^[ \t]*(public[ \t]+)?(entry[ \t]+)?fun[ \t]+([a-z_0-9]+)/.exec(ln);
    if (!m || !(m[1] || m[2])) return;
    const before = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (before.includes('test_only') || before.includes('#[test]')) return;   // 체인에 안 올라간다
    srcFns.add(m[3]);
  });
  const d = await gql('query{ package(address:"' + PKG + '"){ module(name:"market"){'
    + ' functions(first:50){ nodes{ name visibility isEntry } } } } }');
  const nodes = d && d.package && d.package.module && d.package.module.functions.nodes;
  if (!nodes) warn('체인에서 컨트랙트를 못 읽었다');
  else {
    const chainFns = new Set(nodes.filter((n) => n.visibility === 'PUBLIC' || n.isEntry).map((n) => n.name));
    const onlySrc = [...srcFns].filter((n) => !chainFns.has(n));
    const onlyChain = [...chainFns].filter((n) => !srcFns.has(n));
    if (onlySrc.length) bad('소스에만 있는 함수 (아직 안 올렸다): ' + onlySrc.join(', '));
    if (onlyChain.length) bad('체인에만 있는 함수 (소스가 옛것이다): ' + onlyChain.join(', '));
    if (!onlySrc.length && !onlyChain.length) ok('함수 ' + chainFns.size + '개가 정확히 일치');
  }
}


console.log('\n=== 8. 문서에 적힌 거래가 실제로 체인에 있나 ===');
{
  const digests = new Map();
  for (const f of targets.filter((p) => /\.(md|html)$/.test(p))) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/suiscan\.xyz\/testnet\/tx\/([1-9A-HJ-NP-Za-km-z]{43,44})/g)) {
      if (!digests.has(m[1])) digests.set(m[1], new Set());
      digests.get(m[1]).add(relative(ROOT, f));
    }
  }
  if (!digests.size) ok('문서에 인용된 거래 없음');
  for (const [d, files] of digests) {
    let t = null;
    try {
      const r = await gql('query{ transaction(digest:"' + d + '"){ effects{ status } } }');
      t = r && r.transaction;
    } catch { /* 아래에서 처리 */ }
    if (!t) bad('체인에 없는 거래 ' + d.slice(0, 14) + '... -> ' + [...files].join(', '));
    else if (t.effects.status !== 'SUCCESS') bad('실패한 거래를 근거로 걸었다 ' + d.slice(0, 14));
    else ok(d.slice(0, 14) + '... 성공한 거래 (' + [...files].join(', ') + ')');
  }
}


console.log('\n=== 9. README 의 기록 표가 체인과 같나 ===');
{
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  let checked = 0;
  for (const p of chain.listed) {
    // 이름으로 시작하는 표 줄을 찾는다
    const row = md.split('\n').find((ln) => ln.startsWith('| ' + p.name + ' |'));
    if (!row) { warn('README 표에 없는 기록: ' + p.name); continue; }
    const cells = row.split('|').map((c) => c.trim());
    const feeCell = cells.find((c) => /SUI$/.test(c));
    const buyerCell = cells.find((c, i) => i > 0 && /^\d+$/.test(c) && cells[i - 1] && /시간$|일$/.test(cells[i - 1]));
    if (feeCell && parseFloat(feeCell) !== p.fee) bad(p.name + ' 값이 다르다. README ' + feeCell + ' vs 체인 ' + p.fee + ' SUI');
    if (buyerCell !== undefined && Number(buyerCell) !== p.buyers)
      bad(p.name + ' 산 사람 수가 다르다. README ' + buyerCell + ' vs 체인 ' + p.buyers);
    checked++;
  }
  if (checked === chain.listed.length) ok('기록 ' + checked + '개의 값과 산 사람 수가 표와 일치');
}

console.log('\n어긋남 ' + mismatches + '건 · 확인 필요 ' + unsure + '건');
process.exit(mismatches ? 1 : 0);
