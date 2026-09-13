import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const SITE = 'C:/Users/pc/Desktop/해커톤/my-project/site/index.html';
const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.preview-chat';
mkdirSync(OUT, { recursive: true });

// serve over http so fetch/CORS behaves like a real deploy
const html = readFileSync(SITE);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const URL_HTTP = `http://127.0.0.1:${PORT}/`;

const BANNED = /Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/g;

const results = [];
const ok = (n, pass, info = '') => { results.push({ n, pass, info }); console.log((pass ? 'PASS' : 'FAIL') + ' | ' + n + (info ? ' | ' + info : '')); };

const browser = await chromium.launch();

// ---------- main context ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(URL_HTTP, { waitUntil: 'load' });

// wait for chain data to land in the cards
await page.waitForFunction(() => {
  const c = document.querySelectorAll('#cards .card:not(.sk)');
  return c.length > 0;
}, null, { timeout: 45000 }).catch(() => {});

await page.waitForTimeout(2500);

// ---- 6. first screen banned words (must run before scrolling) ----
const firstScreen = await page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= 900 || r.right <= 0 || r.left >= 1440) continue;
    if (r.width === 0 || r.height === 0) continue;
    out.push(t);
  }
  return out.join('\n');
});
const hits = firstScreen.match(BANNED) || [];
ok('6. 첫 화면 금지어 0건', hits.length === 0, hits.length ? 'HITS: ' + hits.join(',') : 'clean');
console.log('--- FIRST SCREEN TEXT ---\n' + firstScreen + '\n--- END ---');

// ---- 2. live chain numbers on screen ----
const cardsInfo = await page.evaluate(() => {
  return [...document.querySelectorAll('#cards .card')].map(a => ({
    href: a.getAttribute('href'),
    sk: a.classList.contains('sk'),
    text: a.innerText.replace(/\s+/g, ' ').trim()
  }));
});
console.log('CARDS:', JSON.stringify(cardsInfo, null, 1));
const liveOk = cardsInfo.length >= 2
  && cardsInfo.every(c => !c.sk)
  && cardsInfo.some(c => /0\.05 SUI/.test(c.text) && /5개/.test(c.text) && /1명이 샀어요/.test(c.text))
  && cardsInfo.some(c => /0\.01 SUI/.test(c.text) && /30개/.test(c.text));
ok('2. 체인 실측 숫자 화면 반영', liveOk, cardsInfo.length + ' cards');

// ---- 7a. reveal hidden at top ----
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
const hiddenAtTop = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#sec-chat .bubble')];
  const notIn = els.filter(e => !e.closest('.reveal').classList.contains('in')).length;
  return { total: els.length, hidden: notIn };
});
ok('7a. 맨 위에서 말풍선 숨김', hiddenAtTop.hidden === hiddenAtTop.total && hiddenAtTop.total === 10, JSON.stringify(hiddenAtTop));

await page.screenshot({ path: OUT + '/01-hero-1440.png' });

// ---- 7b. no scroll hijack: scroll step by step, position must stick ----
let hijack = null;
for (let y = 400; y <= 3200; y += 400) {
  await page.evaluate(v => window.scrollTo(0, v), y);
  await page.waitForTimeout(320);
  const at = await page.evaluate(() => Math.round(window.pageYOffset));
  if (Math.abs(at - y) > 4) { hijack = `asked ${y}, got ${at}`; break; }
}
ok('7b. 스크롤 가로채기 없음', hijack === null, hijack || 'scroll position respected');

// mid-conversation screenshot
await page.evaluate(() => {
  const p = document.querySelectorAll('#sec-chat .pair')[2];
  window.scrollTo(0, p.getBoundingClientRect().top + window.pageYOffset - 200);
});
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + '/02-chat-1440.png' });

// ---- 7c. everything revealed at the bottom ----
await page.evaluate(async () => {
  const step = () => new Promise(r => setTimeout(r, 120));
  for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await step(); }
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(1500);
const stragglers = await page.evaluate(() => {
  const not = [...document.querySelectorAll('.reveal:not(.in)')];
  return not.map(e => (e.className + '|' + (e.innerText || '').slice(0, 30)));
});
ok('7c. 끝까지 스크롤하면 전부 보임', stragglers.length === 0, stragglers.length ? JSON.stringify(stragglers) : 'all revealed');

// ---- 3. images naturalWidth > 0 ----
await page.waitForTimeout(1500);
const imgs = await page.evaluate(() => [...document.images].map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight })));
console.log('IMGS:', JSON.stringify(imgs, null, 1));
ok('3. 모든 이미지 naturalWidth>0', imgs.length >= 2 && imgs.every(i => i.w > 0), imgs.length + ' imgs');

await page.evaluate(() => document.getElementById('ba').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/03-beforeafter-1440.png' });

await page.evaluate(() => document.getElementById('sec-packs').scrollIntoView({ block: 'start', behavior: 'instant' }));
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/04-packs-1440.png' });

// ---- 4. card click -> detail -> hash -> back ----
const hrefBefore = await page.evaluate(() => location.hash);
await page.click('#cards .card:first-child');
await page.waitForTimeout(1200);
const afterClick = await page.evaluate(() => ({
  hash: location.hash,
  detailVisible: !document.getElementById('view-detail').hidden,
  listHidden: document.getElementById('view-list').hidden,
  title: (document.querySelector('.dtitle') || {}).innerText || '',
  y: Math.round(window.pageYOffset)
}));
console.log('AFTER CLICK:', JSON.stringify(afterClick));
await page.screenshot({ path: OUT + '/05-detail-1440.png', fullPage: false });
const detailFullText = await page.evaluate(() => document.getElementById('view-detail').innerText);

await page.goBack();
await page.waitForTimeout(1000);
const afterBack = await page.evaluate(() => ({
  hash: location.hash,
  detailHidden: document.getElementById('view-detail').hidden,
  listVisible: !document.getElementById('view-list').hidden
}));
console.log('AFTER BACK:', JSON.stringify(afterBack));
ok('4. 카드→상세→해시→뒤로가기',
  /^#\/pack\/0x[0-9a-f]{6,}/.test(afterClick.hash) && afterClick.detailVisible && afterClick.listHidden
  && afterBack.detailHidden && afterBack.listVisible && afterClick.hash !== hrefBefore,
  afterClick.hash + ' -> ' + afterBack.hash);

// ---- direct hash open ----
const directPage = await ctx.newPage();
const derr = [];
directPage.on('console', m => { if (m.type() === 'error') derr.push(m.text()); });
directPage.on('pageerror', e => derr.push('pageerror: ' + e.message));
await directPage.goto(URL_HTTP + afterClick.hash, { waitUntil: 'load' });
await directPage.waitForFunction(() => !!document.querySelector('.dtitle'), null, { timeout: 40000 }).catch(() => {});
await directPage.waitForTimeout(2500);
const direct = await directPage.evaluate(() => ({
  title: (document.querySelector('.dtitle') || {}).innerText || '',
  steps: document.querySelectorAll('.step').length,
  imgs: [...document.images].map(i => i.naturalWidth)
}));
console.log('DIRECT HASH OPEN:', JSON.stringify(direct));
ok('4b. 해시 직접 열기', !!direct.title && direct.imgs.length > 0 && direct.imgs.every(w => w > 0), JSON.stringify(direct));
await directPage.screenshot({ path: OUT + '/06-detail-direct-1440.png' });

// second pack (text-only, no manifest)
const otherHref = cardsInfo[1] ? cardsInfo[1].href : null;
if (otherHref) {
  await directPage.goto(URL_HTTP + otherHref, { waitUntil: 'load' });
  await directPage.waitForFunction(() => !!document.querySelector('.dtitle'), null, { timeout: 40000 }).catch(() => {});
  await directPage.waitForTimeout(2500);
  const t2 = await directPage.evaluate(() => document.getElementById('view-detail').innerText.replace(/\s+/g, ' ').slice(0, 700));
  console.log('PACK B DETAIL:', t2);
  await directPage.screenshot({ path: OUT + '/07-detail-textpack-1440.png' });
}
await directPage.close();

// ---- 1. console errors ----
ok('1. 콘솔 에러 0', errors.length === 0 && derr.length === 0, JSON.stringify([...errors, ...derr]).slice(0, 600));

// ---- 5. responsive, no horizontal scroll ----
for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.setViewportSize({ width: w, height: h });
  await p2.goto(URL_HTTP, { waitUntil: 'load' });
  await p2.waitForFunction(() => document.querySelectorAll('#cards .card:not(.sk)').length > 0, null, { timeout: 40000 }).catch(() => {});
  await p2.evaluate(async () => {
    const step = () => new Promise(r => setTimeout(r, 90));
    for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await step(); }
  });
  await p2.waitForTimeout(1600);
  const m = await p2.evaluate(() => {
    const de = document.documentElement;
    const over = [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > de.clientWidth + 1 && getComputedStyle(el).position !== 'fixed')
      .slice(0, 5).map(el => el.tagName + '.' + el.className);
    return { sw: de.scrollWidth, cw: de.clientWidth, bodySw: document.body.scrollWidth, over };
  });
  ok(`5. ${w}px 가로 스크롤 없음`, m.sw <= m.cw, JSON.stringify(m));
  await p2.evaluate(() => window.scrollTo(0, 0));
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: `${OUT}/10-hero-${w}.png` });
  await p2.evaluate(() => document.querySelectorAll('#sec-chat .pair')[1].scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: `${OUT}/11-chat-${w}.png` });
  await p2.goto(URL_HTTP + '#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d', { waitUntil: 'load' });
  await p2.waitForFunction(() => !!document.querySelector('.dtitle'), null, { timeout: 40000 }).catch(() => {});
  await p2.waitForTimeout(2200);
  const m2 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(`5b. ${w}px 상세 가로 스크롤 없음`, m2.sw <= m2.cw, JSON.stringify(m2));
  await p2.screenshot({ path: `${OUT}/12-detail-${w}.png` });
  await p2.close();
}

// ---- 7d. reduced motion: everything visible from the start ----
const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(URL_HTTP, { waitUntil: 'load' });
await rm.waitForTimeout(2000);
const rmState = await rm.evaluate(() => {
  const els = [...document.querySelectorAll('.reveal')];
  const invisible = els.filter(e => parseFloat(getComputedStyle(e).opacity) < 0.99).length;
  return { total: els.length, invisible, y: window.pageYOffset };
});
ok('7d. reduced-motion 이면 처음부터 전부 보임', rmState.invisible === 0 && rmState.total > 0, JSON.stringify(rmState));
await rm.screenshot({ path: OUT + '/13-reducedmotion-1440.png' });
await rmCtx.close();

// ---- full page screenshot ----
const fp = await ctx.newPage();
await fp.setViewportSize({ width: 1440, height: 900 });
await fp.goto(URL_HTTP, { waitUntil: 'load' });
await fp.waitForFunction(() => document.querySelectorAll('#cards .card:not(.sk)').length > 0, null, { timeout: 40000 }).catch(() => {});
await fp.evaluate(async () => {
  const step = () => new Promise(r => setTimeout(r, 110));
  for (let y = 0; y <= document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await step(); }
  window.scrollTo(0, 0);
});
await fp.waitForTimeout(2500);
const docH = await fp.evaluate(() => document.body.scrollHeight);
await fp.screenshot({ path: OUT + '/00-fullpage-1440.png', fullPage: true });
console.log('DOC HEIGHT:', docH);
await fp.close();

await browser.close();
server.close();

console.log('\n=== SUMMARY ===');
const failed = results.filter(r => !r.pass);
results.forEach(r => console.log((r.pass ? 'PASS' : 'FAIL') + '  ' + r.n));
console.log(failed.length === 0 ? '\nALL PASS' : `\n${failed.length} FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
