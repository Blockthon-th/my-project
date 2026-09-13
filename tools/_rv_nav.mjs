import { chromium } from 'playwright';
import { serve } from './_rv_serve.mjs';
const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.review';
const BASE = 'http://127.0.0.1:8099/index.html';
const srv = await serve(8099);
const b = await chromium.launch();
const P = (...a) => console.log(a.join(' '));

/* A. CTA anchor -> card -> back */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const packsTop = await p.evaluate(() => document.getElementById('sec-packs').getBoundingClientRect().top + window.pageYOffset);
  await p.click('a.btn[href="#sec-packs"]');
  await p.waitForTimeout(1400);
  const y1 = await p.evaluate(() => Math.round(window.pageYOffset));
  P(`[anchor] sec-packs offsetTop=${Math.round(packsTop)} landed y=${y1} hash=${await p.evaluate(() => location.hash)}`);
  await p.screenshot({ path: `${OUT}/anchor-land.png` });

  await p.click('#cards .card');
  await p.waitForTimeout(1200);
  P('[anchor] after card: hash=' + await p.evaluate(() => location.hash) + ' y=' + await p.evaluate(() => Math.round(window.pageYOffset)));
  await p.goBack();
  await p.waitForTimeout(1200);
  P('[anchor] back: hash=' + await p.evaluate(() => location.hash) + ' y=' + await p.evaluate(() => Math.round(window.pageYOffset)) + ' listVisible=' + await p.evaluate(() => !document.getElementById('view-list').hidden));
  await p.screenshot({ path: `${OUT}/anchor-back.png` });
  await p.goBack();
  await p.waitForTimeout(900);
  P('[anchor] back x2: hash=' + await p.evaluate(() => location.hash) + ' y=' + await p.evaluate(() => Math.round(window.pageYOffset)));
  // forward
  await p.goForward();
  await p.waitForTimeout(800);
  P('[anchor] forward: hash=' + await p.evaluate(() => location.hash) + ' y=' + await p.evaluate(() => Math.round(window.pageYOffset)));
  P('[anchor] errs=' + JSON.stringify(errs));
  await ctx.close();
}

/* B. short viewport hero fit */
for (const [w, h] of [[1440, 620], [1280, 700], [1920, 1080], [1440, 1100]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const cue = document.querySelector('.cue').getBoundingClientRect();
    const btns = document.querySelector('.btns').getBoundingClientRect();
    const h2 = document.querySelector('#sec-chat .h2').getBoundingClientRect();
    const vh = window.innerHeight;
    // banned words in first screen
    const out = [];
    const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = wk.nextNode())) {
      const t = (n.nodeValue || '').trim(); if (!t) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const rr = el.getBoundingClientRect();
      if (rr.bottom <= 0 || rr.top >= vh || rr.width === 0) continue;
      out.push(t);
    }
    const hit = out.join('\n').match(/Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/g);
    return { heroH: Math.round(hero.height), vh, btnsBottom: Math.round(btns.bottom), cueTop: Math.round(cue.top), overlap: btns.bottom > cue.top - 4, nextSectionVisible: h2.top < vh, banned: hit, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  P(`[vp ${w}x${h}] ` + JSON.stringify(r));
  if (h === 620) await p.screenshot({ path: `${OUT}/hero-1440x620.png` });
  await ctx.close();
}

/* C. flinks DOM + retry recovery */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  let block = true;
  await p.route('**/graphql*', (r) => (block ? r.abort() : r.continue()));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  P('[retry] before click: ' + await p.evaluate(() => document.getElementById('cards-err').innerText.replace(/\n/g, ' ')));
  block = false;
  await p.click('#cards-err [data-retry]');
  await p.waitForTimeout(250);
  const mid = await p.evaluate(() => ({ cardsErrVisible: !document.getElementById('cards-err').hidden, cardsInner: document.getElementById('cards').innerHTML.length, txt: document.getElementById('cards-err').innerText.replace(/\n/g, ' ') }));
  P('[retry] 250ms after click: ' + JSON.stringify(mid));
  await p.waitForTimeout(4000);
  const after = await p.evaluate(() => ({ cards: document.querySelectorAll('#cards .card').length, errHidden: document.getElementById('cards-err').hidden, imgs: Array.from(document.images).map((i) => i.naturalWidth) }));
  P('[retry] recovered: ' + JSON.stringify(after));
  await p.screenshot({ path: `${OUT}/retry-recovered.png`, fullPage: true });

  const fl = await p.evaluate(() => ({ html: document.getElementById('flinks').innerHTML, links: Array.from(document.querySelectorAll('#flinks a')).map((a) => a.textContent + ' -> ' + a.href) }));
  P('[flinks] ' + JSON.stringify(fl, null, 1));
  await ctx.close();
}

/* D. keyboard focus */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Tab');
    seq.push(await p.evaluate(() => { const a = document.activeElement; return a.tagName + ':' + (a.textContent || '').trim().slice(0, 24) + ' outline=' + getComputedStyle(a).outlineStyle; }));
  }
  P('[tab] ' + JSON.stringify(seq, null, 1));
  await ctx.close();
}

/* E. slow network skeleton */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.route('**/graphql*', async (r) => { await new Promise((s) => setTimeout(s, 2500)); r.continue(); });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById('sec-packs').scrollIntoView());
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/skeleton.png` });
  const s = await p.evaluate(() => ({ sk: document.querySelectorAll('.card.sk').length, baSkel: document.querySelectorAll('#ba .skel').length }));
  P('[skeleton] ' + JSON.stringify(s));
  await ctx.close();
}

await b.close(); srv.close();
console.log('done');
