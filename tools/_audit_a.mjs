import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'file:///C:/mm/site/index.html';
const OUT = 'C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '1440', w: 1440, h: 900 },
  { name: '1280', w: 1280, h: 800 },
  { name: '768', w: 768, h: 1024 },
  { name: '375', w: 375, h: 812 },
];

function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum([r, g, b]) { return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); }
function ratio(a, b) { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }

const browser = await chromium.launch();
const report = {};

for (const { name, w, h } of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [], reqfail = [], console_ = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console_.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  page.on('requestfailed', r => reqfail.push(r.url() + ' ' + (r.failure()?.errorText || '')));
  await page.goto(FILE, { waitUntil: 'load' });
  // trigger reveals: scroll through
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  });
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    // find overflowing elements
    const over = [];
    const docW = de.clientWidth;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const right = r.right + window.scrollX;
      if (right > docW + 1) over.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), right: Math.round(right), w: Math.round(r.width) });
    });
    // images
    const imgs = [...document.images].map(i => ({ src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, dw: Math.round(i.getBoundingClientRect().width), alt: i.alt, loading: i.getAttribute('loading'), hasWH: !!(i.getAttribute('width') && i.getAttribute('height')) }));
    // h1 lines
    const h1 = document.querySelector('h1');
    const h1cs = getComputedStyle(h1);
    const h1lines = Math.round(h1.getBoundingClientRect().height / parseFloat(h1cs.lineHeight));
    // nav overlap
    const nav = document.querySelector('.nav');
    const navR = nav ? nav.getBoundingClientRect() : null;
    // first text under hero
    const firstP = document.querySelector('.hero .eyebrow');
    const fpR = firstP ? firstP.getBoundingClientRect() : null;
    // sections
    const secs = [...document.querySelectorAll('section')].map(s => ({ id: s.id || s.className, top: Math.round(s.offsetTop), h: Math.round(s.getBoundingClientRect().height) }));
    // revealed
    const rv = document.querySelectorAll('.rv').length, rvin = document.querySelectorAll('.rv.in').length;
    // font sizes of body text
    const sizes = {};
    document.querySelectorAll('p,li,td,figcaption,.note,.lede,.vs-body,.limit .x,.run .c,.card p').forEach(el => {
      const cs = getComputedStyle(el);
      const k = cs.fontSize;
      sizes[k] = (sizes[k] || 0) + 1;
    });
    return {
      docScrollW: de.scrollWidth, docClientW: de.clientWidth, bodyScrollW: document.body.scrollWidth,
      docH: de.scrollHeight, over: over.slice(0, 25), overCount: over.length,
      imgs, h1lines, h1fs: h1cs.fontSize, h1lh: h1cs.lineHeight,
      navBottom: navR ? Math.round(navR.bottom) : null, firstTextTop: fpR ? Math.round(fpR.top) : null,
      secs, rv, rvin, sizes,
      bodyFS: getComputedStyle(document.body).fontSize, bodyLH: getComputedStyle(document.body).lineHeight,
    };
  });

  // contrast sampling on key text colors
  const contrasts = await page.evaluate(() => {
    function parse(c) { const m = c.match(/\d+(\.\d+)?/g).map(Number); return [m[0], m[1], m[2], m[3] === undefined ? 1 : m[3]]; }
    function bgOf(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c[3] > 0.95) return [c[0], c[1], c[2]];
        n = n.parentElement;
      }
      return [7, 8, 11];
    }
    const picks = [];
    const seen = new Set();
    document.querySelectorAll('p,li,td,th,figcaption,span,a,div,h1,h2,h3,q,b,i,small,code').forEach(el => {
      if (!el.textContent.trim()) return;
      if (el.children.length > 0 && [...el.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) return;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      const bg = bgOf(el);
      const key = cs.color + '|' + bg.join(',') + '|' + cs.fontSize + '|' + cs.fontWeight;
      if (seen.has(key)) return;
      seen.add(key);
      picks.push({ key, cls: (el.className && typeof el.className === 'string' ? el.className : el.tagName), fg, bg, fs: parseFloat(cs.fontSize), fw: cs.fontWeight, sample: el.textContent.trim().slice(0, 30) });
    });
    return picks;
  });
  const withRatio = contrasts.map(c => ({ ...c, r: +ratio(c.fg, c.bg).toFixed(2) })).sort((a, b) => a.r - b.r);
  m.contrastWorst = withRatio.slice(0, 22);

  report[name] = { errs, reqfail, console_, m };
  await page.screenshot({ path: path.join(OUT, `full-${name}.png`), fullPage: name === '375' ? false : false });
  // also viewport-top shot
  await page.screenshot({ path: path.join(OUT, `top-${name}.png`) });
  await ctx.close();
}

// reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ rv: document.querySelectorAll('.rv').length, rvin: document.querySelectorAll('.rv.in').length, firstOpacity: getComputedStyle(document.querySelector('.rv')).opacity }));
  report.reducedMotion = r;
  await ctx.close();
}
// no-js
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'nojs-1280.png') });
  report.nojs = 'shot taken';
  await ctx.close();
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, (k, v) => k === 'contrastWorst' || k === 'imgs' || k === 'secs' || k === 'over' ? v : v, 2).slice(0, 40000));
await browser.close();
