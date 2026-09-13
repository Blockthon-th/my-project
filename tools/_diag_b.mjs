import { chromium } from 'playwright';
const URL = 'file:///C:/mm/site/index-b.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 375, height: 800 } });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelectorAll('.card[data-go]').length >= 2, { timeout: 20000 });
await p.waitForTimeout(1500);

const diag = async (label) => {
  const r = await p.evaluate(() => {
    const out = [];
    const W = document.documentElement.clientWidth;
    document.querySelectorAll('*').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.right > W + 1 || b.width > W + 1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '',
          w: Math.round(b.width), right: Math.round(b.right),
          sw: el.scrollWidth,
          txt: (el.textContent || '').trim().slice(0, 45)
        });
      }
    });
    return { W, sw: document.documentElement.scrollWidth, out: out.slice(0, 25) };
  });
  console.log('=== ' + label, 'clientW', r.W, 'scrollW', r.sw);
  r.out.forEach(o => console.log('  ', o.tag, '.' + o.cls, 'w=' + o.w, 'right=' + o.right, 'sw=' + o.sw, '|', o.txt));
};
await diag('LIST@375');
await p.evaluate(() => { document.querySelector('.card[data-go]').click(); });
await p.waitForFunction(() => !!document.querySelector('.dtitle'), { timeout: 10000 });
await p.waitForTimeout(1500);
await diag('DETAIL@375');
await b.close();
