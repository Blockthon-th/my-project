import { chromium } from 'playwright';
const FILE = 'file:///C:/mm/site/index.html';
const OUT = 'C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const browser = await chromium.launch();
for (const [tag, w, h] of [['A1440', 1440, 900], ['A768', 768, 1024], ['A375', 375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += h * 0.75) { await page.evaluate(yy => window.scrollTo(0, yy), y); await page.waitForTimeout(150); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  // fold shot
  await page.screenshot({ path: `${OUT}/${tag}-fold.png` });
  const ids = ['problem', 'pack', 'how', 'proof', 'chain', 'try'];
  for (const id of ids) {
    await page.evaluate(i => { const e = document.getElementById(i); window.scrollTo(0, e.offsetTop); }, id);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${tag}-${id}.png` });
  }
  // the 5-step timeline middle
  await page.evaluate(() => { const e = document.getElementById('pack'); window.scrollTo(0, e.offsetTop + e.getBoundingClientRect().height * 0.35); });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${tag}-step.png` });
  await ctx.close();
}
await browser.close();
console.log('done');
