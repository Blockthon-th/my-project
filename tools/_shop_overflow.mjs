import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const pg = await ctx.newPage();
for (const w of [1440, 768, 375]) {
  await pg.setViewportSize({ width: w, height: 900 });
  await pg.goto('file:///C:/mm/site/index.html#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d', { waitUntil: 'load' });
  await pg.waitForFunction(() => !document.getElementById('view-detail').hidden, null, { timeout: 40000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  const bad = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('main *').forEach(n => {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') return;
      if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) {
        out.push(n.tagName + '.' + (n.className || '') + ' sw=' + n.scrollWidth + ' cw=' + n.clientWidth + ' :: ' + (n.textContent || '').trim().slice(0, 40));
      }
    });
    return out;
  });
  console.log('--- ' + w + 'px detail: ' + (bad.length ? bad.length + ' overflow' : 'clean'));
  bad.slice(0, 14).forEach(x => console.log('   ' + x));
  // panel kv sanity
  if (w === 375) {
    const kv = await pg.$$eval('.kv', ns => ns.map(n => n.querySelector('.k').textContent + '=' + n.querySelector('.v').textContent + ' w' + Math.round(n.getBoundingClientRect().width)));
    console.log('   kv: ' + JSON.stringify(kv));
  }
  // list page too
  await pg.goto('file:///C:/mm/site/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => document.querySelectorAll('#grid .card[href]').length >= 2, null, { timeout: 40000 }).catch(() => {});
  await pg.waitForTimeout(2000);
  const bad2 = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('main *').forEach(n => {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') return;
      if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) out.push(n.tagName + '.' + (n.className || '') + ' sw=' + n.scrollWidth + ' cw=' + n.clientWidth);
    });
    return out;
  });
  console.log('--- ' + w + 'px list: ' + (bad2.length ? bad2.join(' | ') : 'clean'));
}
await b.close();
