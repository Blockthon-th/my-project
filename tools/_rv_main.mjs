import { chromium } from 'playwright';
import { serve } from './_rv_serve.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.review';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8099/index.html';
const log = [];
const P = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

const BANNED = /Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/;

function attachErrors(page, bag) {
  page.on('console', (m) => { if (m.type() === 'error') bag.push('console: ' + m.text()); });
  page.on('pageerror', (e) => bag.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => bag.push('reqfail: ' + r.url().slice(0, 80) + ' ' + (r.failure()?.errorText || '')));
}

const srv = await serve(8099);
const browser = await chromium.launch();

/* ---------- 1. per-viewport list + detail ---------- */
for (const [w, h, tag] of [[1440, 900, '1440'], [768, 1024, '768'], [375, 812, '375']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  attachErrors(page, errs);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ov = await page.evaluate(() => {
    const d = document.documentElement;
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > d.clientWidth + 1 || r.left < -1) {
        bad.push(el.tagName + '.' + (el.className || '').toString().slice(0, 40) + ' L' + Math.round(r.left) + ' R' + Math.round(r.right));
      }
    });
    return { sw: d.scrollWidth, cw: d.clientWidth, bad: bad.slice(0, 8) };
  });
  P(`[${tag}] list scrollWidth=${ov.sw} clientWidth=${ov.cw} overflow=${JSON.stringify(ov.bad)}`);

  // full-page screenshot
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/list-${tag}.png`, fullPage: true });

  // cards content
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#cards .card')).map((c) => ({ sk: c.classList.contains('sk'), t: c.innerText.replace(/\n/g, ' | ') })));
  P(`[${tag}] cards=${JSON.stringify(cards)}`);

  // images
  const imgs = await page.evaluate(() => Array.from(document.images).map((i) => ({ nw: i.naturalWidth, nh: i.naturalHeight, alt: i.alt })));
  P(`[${tag}] list images=${JSON.stringify(imgs)}`);

  // detail
  const href = await page.evaluate(() => { const a = document.querySelector('#cards .card'); return a ? a.getAttribute('href') : null; });
  if (href) {
    await page.click('#cards .card');
    await page.waitForTimeout(2200);
    const dov = await page.evaluate(() => {
      const d = document.documentElement;
      const bad = [];
      document.querySelectorAll('#view-detail *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.right > d.clientWidth + 1 || r.left < -1) bad.push(el.tagName + '.' + (el.className || '').toString().slice(0, 40) + ' R' + Math.round(r.right));
      });
      return { sw: d.scrollWidth, cw: d.clientWidth, bad: bad.slice(0, 8), hash: location.hash };
    });
    P(`[${tag}] detail scrollWidth=${dov.sw} cw=${dov.cw} hash=${dov.hash} overflow=${JSON.stringify(dov.bad)}`);
    await page.screenshot({ path: `${OUT}/detail-${tag}.png`, fullPage: true });
    const dimgs = await page.evaluate(() => Array.from(document.images).map((i) => i.naturalWidth + 'x' + i.naturalHeight));
    P(`[${tag}] detail images=${JSON.stringify(dimgs)}`);
    await page.goBack();
    await page.waitForTimeout(800);
    const back = await page.evaluate(() => ({ hash: location.hash, listVisible: !document.getElementById('view-list').hidden, detailHidden: document.getElementById('view-detail').hidden, y: Math.round(window.pageYOffset) }));
    P(`[${tag}] goBack -> ${JSON.stringify(back)}`);
  }
  P(`[${tag}] errors=${JSON.stringify(errs)}`);
  await ctx.close();
}

/* ---------- 2. first screen banned words ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const res = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= 900 || r.width === 0) continue;
      out.push(t);
    }
    return out;
  });
  const joined = res.join('\n');
  const hit = joined.match(/Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/g);
  P('[first] visible text:\n' + joined);
  P('[first] banned hits=' + JSON.stringify(hit));
  await page.screenshot({ path: `${OUT}/first-1440.png` });
  await ctx.close();
}

/* ---------- 3. reveal: top hidden, slow scroll, fast jump ---------- */
for (const [w, h, tag] of [[1440, 900, '1440'], [375, 812, '375']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => {
    const b = document.querySelectorAll('#sec-chat .bubble');
    let hidden = 0;
    b.forEach((x) => { if (parseFloat(getComputedStyle(x.closest('.reveal') || x).opacity) < 0.99) hidden++; });
    return { total: b.length, hidden };
  });
  P(`[reveal ${tag}] at top bubbles hidden ${top.hidden}/${top.total}`);

  // slow scroll
  const H = await page.evaluate(() => document.body.scrollHeight);
  const drift = [];
  for (let y = 0; y < H; y += 200) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(90);
    const actual = await page.evaluate(() => Math.round(window.pageYOffset));
    const want = Math.min(y, await page.evaluate(() => document.body.scrollHeight - window.innerHeight));
    if (Math.abs(actual - want) > 5) drift.push(`want ${want} got ${actual}`);
  }
  await page.waitForTimeout(900);
  const left1 = await page.evaluate(() => Array.from(document.querySelectorAll('.reveal:not(.in)')).map((e) => e.className));
  P(`[reveal ${tag}] slow scroll -> not-in=${JSON.stringify(left1)} drift=${JSON.stringify(drift.slice(0, 5))}`);

  // fast jump from top
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  const left2 = await page.evaluate(() => Array.from(document.querySelectorAll('.reveal:not(.in)')).map((e) => e.className + '|' + getComputedStyle(e).opacity));
  P(`[reveal ${tag}] fast jump -> not-in=${JSON.stringify(left2)}`);

  // reload at mid scroll (browser restores scroll)
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const mid = await page.evaluate(() => {
    const y = Math.round(window.pageYOffset);
    const vh = window.innerHeight;
    const bad = [];
    document.querySelectorAll('.reveal').forEach((e) => {
      const r = e.getBoundingClientRect();
      const vis = r.top < vh && r.bottom > 0;
      if (vis && parseFloat(getComputedStyle(e).opacity) < 0.99) bad.push(e.className + ' top' + Math.round(r.top));
    });
    return { y, bad };
  });
  P(`[reveal ${tag}] mid-reload y=${mid.y} invisible-in-viewport=${JSON.stringify(mid.bad)}`);
  await ctx.close();
}

/* ---------- 4. reduced motion ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const all = document.querySelectorAll('.reveal');
    let dim = 0;
    all.forEach((e) => { if (parseFloat(getComputedStyle(e).opacity) < 0.99) dim++; });
    return { total: all.length, dim, sb: getComputedStyle(document.documentElement).scrollBehavior };
  });
  P(`[reduced] reveal ${r.dim} dim of ${r.total}, scroll-behavior=${r.sb}`);
  await page.screenshot({ path: `${OUT}/reduced-1440.png`, fullPage: true });
  await ctx.close();
}

/* ---------- 5. direct hash open ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  attachErrors(page, errs);
  await page.goto(BASE + '#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const early = await page.evaluate(() => ({ skel: document.querySelectorAll('#view-detail .skel').length, txt: document.getElementById('view-detail').innerText.slice(0, 80) }));
  P('[direct] early=' + JSON.stringify(early));
  await page.waitForTimeout(3000);
  const late = await page.evaluate(() => ({
    title: document.querySelector('.dtitle')?.innerText,
    chips: Array.from(document.querySelectorAll('.chip')).map((c) => c.innerText),
    steps: Array.from(document.querySelectorAll('.step .ls')).map((s) => s.innerText),
    checks: Array.from(document.querySelectorAll('.chk')).map((c) => c.innerText.replace(/\n/g, ' / ')),
    imgs: Array.from(document.images).map((i) => i.naturalWidth + 'x' + i.naturalHeight),
    links: Array.from(document.querySelectorAll('.linklist a')).map((a) => a.innerText.replace(/\n/g, ' ')),
  }));
  P('[direct] ' + JSON.stringify(late, null, 1));
  P('[direct] errors=' + JSON.stringify(errs));
  await ctx.close();
}

/* ---------- 6. text pack detail ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/pack/0xaa3b7edcbc7281896372c43a3ca8eae75f3b20accba985af9f4622bc36b52a40', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const t = await page.evaluate(() => document.getElementById('view-detail').innerText);
  P('[textpack]\n' + t.slice(0, 1800));
  await page.screenshot({ path: `${OUT}/textpack-1440.png`, fullPage: true });
  await ctx.close();
}

/* ---------- 7. network failure ---------- */
for (const mode of ['gql', 'walrus', 'both']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  if (mode !== 'walrus') await page.route('**/graphql*', (r) => r.abort());
  if (mode !== 'gql') await page.route('**/aggregator.walrus-testnet.walrus.space/**', (r) => r.abort());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => ({
    cardsErr: document.getElementById('cards-err').hidden ? null : document.getElementById('cards-err').innerText.replace(/\n/g, ' '),
    cardsHtml: document.getElementById('cards').innerText.replace(/\n/g, ' | ').slice(0, 200),
    baHidden: document.getElementById('ba').hidden,
    baErr: document.getElementById('ba-err').hidden ? null : document.getElementById('ba-err').innerText.replace(/\n/g, ' '),
    retry: document.querySelectorAll('[data-retry]').length,
    skel: document.querySelectorAll('.skel').length,
  }));
  P(`[fail ${mode}] ` + JSON.stringify(s));
  await page.screenshot({ path: `${OUT}/fail-${mode}.png`, fullPage: true });
  // detail under failure
  await page.evaluate(() => { location.hash = '#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d'; });
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => document.getElementById('view-detail').innerText.replace(/\n/g, ' | ').slice(0, 260));
  P(`[fail ${mode}] detail: ${d}`);
  P(`[fail ${mode}] jsErrors=${JSON.stringify(errs.slice(0, 3))}`);
  await ctx.close();
}

/* ---------- 8. layout shift (CLS) ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = 0; window.__shifts = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(e.value); }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const cls = await page.evaluate(() => ({ cls: window.__cls, n: window.__shifts.length, top: window.__shifts.sort((a, b) => b - a).slice(0, 3) }));
  P('[cls] ' + JSON.stringify(cls));
  await ctx.close();
}

/* ---------- 9. contrast + type ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    function lum(c) {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function parse(s) { const m = s.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
    function bgOf(el) {
      let e = el;
      while (e) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c);
        e = e.parentElement;
      }
      return [250, 250, 249];
    }
    const sel = ['h1', '.hero-body span', '.hero-line', '.cue', '.btn', '.btn.ghost', '.h2', '.sub', '.bubble.me', '.bubble.you', '.gotlabel', '.pairno', '.closing', '.closing.two', '.num .big', '.num .who', '.num .desc', '.num .meta', '.note', '.card .nm', '.card .ds', '.card .mt', '.card .go', '.plain span', '.bottom .t span', '.limits h3', '.limits li', '.flinks', '.shot .cap'];
    const res = [];
    sel.forEach((s) => {
      const el = document.querySelector(s);
      if (!el) { res.push({ s, missing: true }); return; }
      const cs = getComputedStyle(el);
      const fg = parse(cs.color); const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      res.push({ s, fs: cs.fontSize, lh: cs.lineHeight, fw: cs.fontWeight, ratio: Math.round(ratio * 100) / 100 });
    });
    return res;
  });
  out.forEach((r) => P('[type] ' + JSON.stringify(r)));
  await ctx.close();
}

/* ---------- 10. section left edges + hero fit ---------- */
for (const [w, h, tag] of [[1440, 900, '1440'], [768, 1024, '768'], [375, 812, '375']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const g = await page.evaluate(() => {
    const edges = {};
    ['h1', '#sec-chat .h2', '#sec-proof .h2', '#sec-packs .h2', '#sec-sell .h2', '.bottom .t'].forEach((s) => {
      const e = document.querySelector(s); if (e) edges[s] = Math.round(e.getBoundingClientRect().left);
    });
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const cue = document.querySelector('.cue').getBoundingClientRect();
    const btns = document.querySelector('.btns').getBoundingClientRect();
    return { edges, heroH: Math.round(hero.height), vh: window.innerHeight, cueTop: Math.round(cue.top), btnsBottom: Math.round(btns.bottom), overlap: btns.bottom > cue.top };
  });
  P(`[layout ${tag}] ` + JSON.stringify(g));
  await ctx.close();
}

await browser.close();
srv.close();
writeFileSync(`${OUT}/report.txt`, log.join('\n'), 'utf8');
console.log('\nDONE ->', OUT);
