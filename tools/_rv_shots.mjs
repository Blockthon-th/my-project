import { chromium } from 'playwright';
import { serve } from './_rv_serve.mjs';
const OUT = 'C:/Users/pc/Desktop/해커톤/my-project/site/.review';
const BASE = 'http://127.0.0.1:8099/index.html';
const srv = await serve(8099);
const b = await chromium.launch();

async function shot(page, sel, name, pad = 0) {
  const el = await page.$(sel);
  if (!el) { console.log('missing', sel); return; }
  const box = await el.boundingBox();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y + (await page.evaluate(() => window.pageYOffset)) - pad), width: Math.min(box.width + pad * 2, await page.evaluate(() => document.documentElement.clientWidth)), height: Math.min(box.height + pad * 2, 2600) } });
}

{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(600);
  await shot(p, '#sec-chat', 'sec-chat-1440');
  await shot(p, '#sec-proof', 'sec-proof-1440');
  await shot(p, '#sec-packs', 'sec-packs-1440');
  await shot(p, '.bottom', 'sec-bottom-1440');
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/m-hero.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('#sec-chat').scrollIntoView());
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/m-chat1.png` });
  await p.evaluate(() => window.scrollBy(0, 812));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/m-chat2.png` });
  await p.evaluate(() => document.querySelector('#sec-packs').scrollIntoView());
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/m-packs.png` });
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/d-top.png` });
  await p.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/d-2.png` });
  await p.evaluate(() => window.scrollTo(0, 1800));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/d-3.png` });
  await p.evaluate(() => window.scrollTo(0, 2700));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/d-4.png` });
  await ctx.close();
}
await b.close(); srv.close();
console.log('ok');
