import { chromium } from 'playwright';
import fs from 'node:fs';
const FILE = 'file:///C:/mm/site/index.html';
const OUT = 'C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const browser = await chromium.launch();
const out = {};

// --- realistic scroll: does reveal actually fire, do images load
for (const [name, w, h] of [['1440', 1440, 900], ['375', 375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const hidden = [];
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += h * 0.7) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await page.waitForTimeout(220);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.rv').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.7 && r.bottom > 0) {
          const op = parseFloat(getComputedStyle(el).opacity);
          if (op < 0.9) out.push({ cls: el.className, top: Math.round(r.top), op });
        }
      });
      return out;
    });
    if (bad.length) hidden.push({ y, bad });
  }
  const fin = await page.evaluate(() => ({
    rv: document.querySelectorAll('.rv').length,
    rvin: document.querySelectorAll('.rv.in').length,
    imgs: [...document.images].map(i => i.getAttribute('src').split('/').pop() + ':' + i.naturalWidth + 'x' + i.naturalHeight),
    docH: document.documentElement.scrollHeight,
  }));
  out['scroll' + name] = { hiddenDuringScroll: hidden.length, sample: hidden.slice(0, 4), fin };
  // full page screenshot after all loaded
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/FULL-${name}.png`, fullPage: true });
  await ctx.close();
}

// --- print
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const printState = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 100));
    return null;
  });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => {
    const rv = document.querySelectorAll('.rv');
    let inv = 0;
    rv.forEach(el => { if (parseFloat(getComputedStyle(el).opacity) < 0.9) inv++; });
    const hasPrintCSS = [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.conditionText && /print/.test(r.conditionText)); } catch (e) { return false; } });
    return { rvTotal: rv.length, invisibleInPrint: inv, hasPrintCSS, navPos: getComputedStyle(document.querySelector('.nav')).position };
  });
  out.print = p;
  try { await page.pdf({ path: `${OUT}/print.pdf`, format: 'A4' }); out.print.pdf = 'ok'; } catch (e) { out.print.pdf = String(e).slice(0, 120); }
  await ctx.close();
}

// --- browser zoom 200% (emulate via deviceScaleFactor-less: use 1280/2 width = 640 css px equivalent) + text-only zoom
{
  const ctx = await browser.newContext({ viewport: { width: 640, height: 450 } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  out.zoom200 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await ctx.close();
}
// --- 320px (narrowest common)
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  out.w320 = await page.evaluate(() => {
    const de = document.documentElement;
    const over = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > de.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el.parentElement || document.body).overflowX !== 'auto') over.push(el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''));
    });
    return { sw: de.scrollWidth, cw: de.clientWidth, over: over.slice(0, 10) };
  });
  await page.screenshot({ path: `${OUT}/top-320.png` });
  await ctx.close();
}
// --- text zoom (browser font-size 200%) simulation: set html font-size
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  await page.waitForTimeout(300);
  out.textZoom = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bodyFS: getComputedStyle(document.body).fontSize }));
  await ctx.close();
}

// --- tap target sizes / nav on mobile
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  out.mobileNav = await page.evaluate(() => {
    const nav = document.querySelector('.nav nav');
    return { navDisplay: getComputedStyle(nav).display, anchors: [...document.querySelectorAll('a')].length };
  });
  // check inner scrollers without affordance
  out.innerScrollers = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) {
        res.push({ cls: (typeof el.className === 'string' ? el.className : el.tagName), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    return res;
  });
  await ctx.close();
}

fs.writeFileSync(`${OUT}/report-b.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
