import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'file:///C:/mm/site/index-b.html';
const OUT = 'C:/mm/site/.preview-terminal';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url().slice(0, 90) + ' ' + (r.failure()?.errorText || '')));

const R = {};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('.card[data-go]').length >= 2, { timeout: 20000 });
await page.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('img[data-blob]')];
  return imgs.length > 0 && imgs.every(i => i.complete);
}, { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);

// 2. cards + counters
R.cards = await page.$$eval('.card[data-go]', els => els.length);
R.counters = await page.$$eval('.stat', els => els.map(e => ({
  n: e.querySelector('.n').textContent.trim(),
  k: e.querySelector('.k').textContent.trim(),
  skeleton: !!e.querySelector('.skel')
})));
R.countersOk = R.counters.length === 4 && R.counters.every(c => !c.skeleton && /^\d+$/.test(c.n));
R.queriedAt = await page.$eval('.counter-head .src', e => e.textContent.trim());
R.cardTitles = await page.$$eval('.card h3', els => els.map(e => e.textContent.trim()));

// 3. images
R.images = await page.$$eval('img', els => els.map(i => ({
  w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(-24)
})));
R.imagesOk = R.images.length > 0 && R.images.every(i => i.w > 0);

// 5a. widths on list
R.widths = {};
for (const w of [1440, 768, 375]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bsw: document.body.scrollWidth
  }));
  R.widths['list@' + w] = { ...m, ok: m.sw <= m.cw && m.bsw <= m.cw };
  await page.screenshot({ path: `${OUT}/b-list-${w}.png`, fullPage: true });
}

// 4. routing
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(250);
const hashBefore = await page.evaluate(() => location.hash);
await page.click('.card[data-go] .shot');
await page.waitForFunction(() => /^#\/pack\/0x/.test(location.hash), { timeout: 5000 });
const hashAfter = await page.evaluate(() => location.hash);
await page.waitForFunction(() => !!document.querySelector('.dtitle'), { timeout: 10000 });
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1200);
R.route = {
  hashBefore, hashAfter,
  detailTitle: await page.$eval('.dtitle', e => e.textContent.trim()),
  steps: await page.$$eval('.steps .step', e => e.length),
  checkRows: await page.$$eval('table tbody tr', e => e.length),
  detailImgs: await page.$$eval('.shots img', els => els.map(i => i.naturalWidth))
};
R.detailImagesOk = R.route.detailImgs.length === 2 && R.route.detailImgs.every(w => w > 0);

// detail widths
for (const w of [1440, 768, 375]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  R.widths['detail@' + w] = { ...m, ok: m.sw <= m.cw };
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/b-detail-1440.png`, fullPage: true });

// direct hash open (fresh load)
const p2 = await ctx.newPage();
p2.on('console', m => { if (m.type() === 'error') errors.push('console(p2): ' + m.text()); });
p2.on('pageerror', e => errors.push('pageerror(p2): ' + e.message));
await p2.goto(URL + hashAfter, { waitUntil: 'networkidle' });
await p2.waitForFunction(() => !!document.querySelector('.dtitle'), { timeout: 20000 });
R.deepLinkTitle = await p2.$eval('.dtitle', e => e.textContent.trim());
await p2.close();

// back button
await page.goBack();
await page.waitForTimeout(600);
R.backHash = await page.evaluate(() => location.hash);
R.backCards = await page.$$eval('.card[data-go]', e => e.length);
R.backOk = R.backCards >= 2 && !/^#\/pack\//.test(R.backHash);

// second pack detail (text pack, no manifest)
const ids = await page.$$eval('.card[data-go]', els => els.map(e => e.getAttribute('data-go')));
if (ids[1]) {
  await page.evaluate(id => { location.hash = '#/pack/' + id; }, ids[1]);
  await page.waitForFunction(() => !!document.querySelector('.dtitle'), { timeout: 10000 });
  await page.waitForTimeout(1500);
  R.textPack = {
    title: await page.$eval('.dtitle', e => e.textContent.trim()),
    previews: await page.$$eval('.steps .step .ttl', els => els.map(e => e.textContent.trim().slice(0, 40))),
    skeletonsLeft: await page.$$eval('.skel', e => e.length)
  };
  await page.screenshot({ path: `${OUT}/b-detail-textpack-1440.png`, fullPage: true });
}

// copy button smoke (no exception)
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForTimeout(500);
await page.click('.copy');
await page.waitForTimeout(300);
R.copyLabel = await page.$eval('.copy', e => e.textContent.trim());

R.consoleErrors = errors;
R.consoleErrorCount = errors.length;
R.files = fs.readdirSync(OUT).filter(f => f.startsWith('b-'));

await browser.close();
console.log(JSON.stringify(R, null, 1));
