import { chromium } from 'playwright';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const URL='file:///C:/mm/site/index-b.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
await p.goto(URL,{waitUntil:'load'});
await p.waitForTimeout(300);
// scroll-margin check
const sm = await p.evaluate(()=>{
  const out={};
  ['evidence','problem','product','chain','limits','install','spec','how'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return out[id]='MISSING';
    out[id]=getComputedStyle(el).scrollMarginTop;
  });
  out.headerH = Math.round(document.querySelector('.top').getBoundingClientRect().height);
  return out;
});
console.log('scroll-margin-top:', JSON.stringify(sm));
// click anchor, see where title lands
await p.click('.top nav a[href="#evidence"]');
await p.waitForTimeout(1200);
const land = await p.evaluate(()=>{
  const h2=document.querySelector('#evidence h2');
  const eyebrow=document.querySelector('#evidence .eyebrow');
  const hdr=document.querySelector('.top').getBoundingClientRect();
  return {eyebrowTop:Math.round(eyebrow.getBoundingClientRect().top), h2Top:Math.round(h2.getBoundingClientRect().top), headerBottom:Math.round(hdr.bottom), covered: eyebrow.getBoundingClientRect().top < hdr.bottom};
});
console.log('anchor landing:', JSON.stringify(land));
await p.screenshot({path:OUT+'/anchor-evidence.png'});

// zoom on the 3-up baseline thumbs
await p.evaluate(()=>document.querySelector('#evidence .rv:last-of-type').scrollIntoView({block:'center',behavior:'instant'}));
await p.waitForTimeout(400);
const el = await p.$('#evidence .rv:last-of-type');
await el.screenshot({path:OUT+'/threeup.png'});

// column shot element only
const col = await p.$('.cols .col.win');
await col.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
await col.screenshot({path:OUT+'/col-win.png'});
await b.close();
