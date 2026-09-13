import { chromium } from 'playwright';
const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.review';
const FILE = 'file:///C:/Users/pc/Desktop/해커톤/my-project/site/index.html';
const b = await chromium.launch();
const P = (...a) => console.log(a.join(' '));

{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror:' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await p.goto(FILE);
  await p.waitForTimeout(5000);
  const s = await p.evaluate(() => ({
    cards: Array.from(document.querySelectorAll('#cards .card')).map((c) => c.innerText.split('\n')[0]),
    sk: document.querySelectorAll('.card.sk').length,
    imgs: Array.from(document.images).map((i) => i.naturalWidth),
    cardsErr: document.getElementById('cards-err').hidden ? null : document.getElementById('cards-err').innerText.replace(/\n/g, ' '),
  }));
  P('[file://] ' + JSON.stringify(s));
  P('[file://] errs=' + JSON.stringify(errs.slice(0, 4)));
  await p.screenshot({ path: `${OUT}/fileproto.png` });
  await ctx.close();
}

{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8099/index.html'.replace('http', 'file').replace('//127.0.0.1:8099', '///C:/Users/pc/Desktop/해커톤/my-project/site') + '#/pack/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  await p.waitForTimeout(5000);
  P('[unknown hash] ' + await p.evaluate(() => document.getElementById('view-detail').innerText.replace(/\n/g, ' ')));
  await ctx.close();
}
await b.close();
