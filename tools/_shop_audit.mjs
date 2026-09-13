import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL_BASE = process.argv[2] || 'file:///C:/mm/site/index.html';
const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.preview-shop';
fs.mkdirSync(OUT, { recursive: true });

const errs = [];
const fails = [];
let ok = true;
const say = (pass, msg) => { if (!pass) { ok = false; fails.push(msg); } console.log((pass ? 'PASS ' : 'FAIL ') + msg); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
pg.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
pg.on('pageerror', e => errs.push('[pageerror] ' + e.message));
pg.on('requestfailed', r => errs.push('[reqfail] ' + r.url().slice(0, 90) + ' ' + (r.failure()?.errorText || '')));

await pg.goto(URL_BASE, { waitUntil: 'load' });
await pg.waitForFunction(() => document.querySelectorAll('#grid .card[href]').length >= 2, null, { timeout: 45000 }).catch(() => {});
await pg.waitForLoadState('networkidle').catch(() => {});
await pg.waitForTimeout(2500);

// 1. console errors
say(errs.length === 0, '1. 콘솔/네트워크 에러 0 — 실제 ' + errs.length + (errs.length ? '\n     ' + errs.join('\n     ') : ''));

// 2. cards + counters
const cards = await pg.$$eval('#grid .card[href]', ns => ns.map(n => ({
  href: n.getAttribute('href'),
  name: n.querySelector('.cname')?.textContent,
  price: n.querySelector('.cprice .p')?.textContent,
  tags: [...n.querySelectorAll('.tag')].map(t => t.textContent),
  stat: n.querySelector('.cstat')?.textContent,
})));
say(cards.length >= 2, '2a. 팩 카드 ' + cards.length + '개 렌더');
console.log('     ' + JSON.stringify(cards, null, 1).replace(/\n/g, '\n     '));
const cnt = await pg.$$eval('.cnt', ns => ns.map(n => n.querySelector('.n').textContent.trim() + ' ' + n.querySelector('.l').textContent));
const cntOk = cnt.length === 4 && cnt.every(c => /^\d+ /.test(c));
say(cntOk, '2b. 카운터 실제 숫자: ' + JSON.stringify(cnt));
console.log('     readat: ' + (await pg.$eval('#readat', n => n.textContent)));

// 3. images
const imgs = await pg.$$eval('img', ns => ns.map(n => ({ w: n.naturalWidth, h: n.naturalHeight, src: n.src.slice(-22) })));
say(imgs.length > 0 && imgs.every(i => i.w > 0), '3. 목록 이미지 ' + imgs.length + '장 전수 naturalWidth>0 — ' + JSON.stringify(imgs));

// 5+6. widths on list
for (const [w, h, tag] of [[1440, 900, '1440'], [768, 1024, '768'], [375, 812, '375']]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.waitForTimeout(700);
  const m = await pg.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth, bs: document.body.scrollWidth }));
  say(m.s <= m.c && m.bs <= m.c, '5. ' + tag + 'px 가로 스크롤 없음 (scrollWidth ' + m.s + ' <= clientWidth ' + m.c + ')');
  await pg.screenshot({ path: path.join(OUT, 'list-' + tag + '.png'), fullPage: true });
}

// 4. click -> detail, hash, back
await pg.setViewportSize({ width: 1440, height: 900 });
await pg.waitForTimeout(400);
const beforeHash = await pg.evaluate(() => location.hash);
await pg.click('#grid .card:first-child');
await pg.waitForTimeout(1200);
const afterHash = await pg.evaluate(() => location.hash);
const detShown = await pg.evaluate(() => !document.getElementById('view-detail').hidden && document.getElementById('view-list').hidden);
say(detShown && /^#\/pack\/0x/.test(afterHash), '4a. 카드 클릭 → 상세 전환, 해시 "' + beforeHash + '" → "' + afterHash + '"');
const det = await pg.evaluate(() => ({
  title: document.querySelector('.dhead h2')?.textContent,
  price: document.querySelector('.panel .price')?.textContent,
  steps: document.querySelectorAll('.step').length,
  checks: document.querySelectorAll('.checks li').length,
  lessons: [...document.querySelectorAll('.step .lesson')].slice(0, 2).map(n => n.textContent.slice(0, 40)),
  table: !!document.querySelector('.tbl table'),
  howto: !!document.getElementById('howto'),
  docTitle: document.title,
}));
console.log('     detail: ' + JSON.stringify(det));
say(det.steps >= 5 && det.checks === 5 && det.table && det.howto, '4b. 상세에 단계 ' + det.steps + ' · 검사 ' + det.checks + ' · 실측표 ' + det.table + ' · 사는 법 ' + det.howto);
await pg.waitForLoadState('networkidle').catch(() => {});
await pg.waitForTimeout(1500);
const dimgs = await pg.$$eval('img', ns => ns.map(n => n.naturalWidth));
say(dimgs.length >= 2 && dimgs.every(w => w > 0), '3b. 상세 이미지 ' + dimgs.length + '장 전수 naturalWidth>0 — ' + JSON.stringify(dimgs));
for (const [w, h, tag] of [[1440, 900, 'detail-1440'], [375, 812, 'detail-375']]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.waitForTimeout(600);
  const m = await pg.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  say(m.s <= m.c, '5b. 상세 ' + tag + ' 가로 스크롤 없음 (' + m.s + ' <= ' + m.c + ')');
  await pg.screenshot({ path: path.join(OUT, tag + '.png'), fullPage: true });
}
await pg.setViewportSize({ width: 1440, height: 900 });
await pg.evaluate(() => window.scrollTo(0, 0));
await pg.waitForTimeout(400);
await pg.screenshot({ path: path.join(OUT, 'detail-1440-fold.png'), fullPage: false });

await pg.goBack();
await pg.waitForTimeout(1200);
const backHash = await pg.evaluate(() => location.hash);
const listShown = await pg.evaluate(() => !document.getElementById('view-list').hidden && document.getElementById('view-detail').hidden);
say(listShown, '4c. 뒤로가기 → 목록 복귀 (hash "' + backHash + '")');

// deep link
const pg2 = await ctx.newPage();
const derrs = [];
pg2.on('console', m => { if (m.type() === 'error') derrs.push(m.text()); });
pg2.on('pageerror', e => derrs.push('pageerror ' + e.message));
await pg2.goto(URL_BASE + '#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d', { waitUntil: 'load' });
await pg2.waitForFunction(() => !document.getElementById('view-detail').hidden, null, { timeout: 40000 }).catch(() => {});
await pg2.waitForTimeout(2000);
const dl = await pg2.evaluate(() => ({ t: document.querySelector('.dhead h2')?.textContent, hidden: document.getElementById('view-detail').hidden }));
say(!dl.hidden && !!dl.t, '4d. 해시 직접 열기 → "' + dl.t + '"');
say(derrs.length === 0, '4e. 딥링크 콘솔 에러 0 — ' + derrs.length + (derrs.length ? ' ' + derrs.join(' | ') : ''));

// 첫 화면(1280x800)에 카드가 걸치는지
const pg3 = await ctx.newPage();
await pg3.setViewportSize({ width: 1280, height: 800 });
await pg3.goto(URL_BASE, { waitUntil: 'load' });
await pg3.waitForFunction(() => document.querySelectorAll('#grid .card[href]').length >= 2, null, { timeout: 40000 }).catch(() => {});
await pg3.waitForTimeout(2000);
const fold = await pg3.evaluate(() => {
  const c = document.querySelector('#grid .card');
  const r = c.getBoundingClientRect();
  return { top: Math.round(r.top), visible: Math.round(Math.min(800, r.bottom) - r.top) };
});
say(fold.top < 800 && fold.visible > 120, '접힌 선 위 카드 노출: 첫 카드 top=' + fold.top + 'px, 보이는 높이=' + fold.visible + 'px');
await pg3.screenshot({ path: path.join(OUT, 'list-1280x800-fold.png') });

await b.close();
console.log('\n=== ' + (ok ? 'ALL PASS' : 'FAILED: ' + fails.length) + ' ===');
if (!ok) console.log(fails.join('\n'));
process.exit(ok ? 0 : 1);
