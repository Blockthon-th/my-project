import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const URL='file:///C:/mm/site/index-b.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(400);
// dead CSS: every selector in the stylesheet, does it match anything?
const dead = await p.evaluate(()=>{
  const out=[];
  for (const sheet of document.styleSheets){
    let rules; try{rules=sheet.cssRules}catch(e){continue}
    const walk=(rs)=>{for(const r of rs){
      if(r.type===1){ // style rule
        r.selectorText.split(',').map(s=>s.trim()).forEach(sel=>{
          const clean=sel.replace(/::?(before|after|hover|focus|active|first-of-type|last-child|last-of-type|not\([^)]*\))/g,'');
          if(!clean.trim())return;
          try{ if(!document.querySelector(clean)) out.push(sel); }catch(e){}
        });
      } else if(r.cssRules) walk(r.cssRules);
    }};
    walk(rules);
  }
  return [...new Set(out)];
});
console.log('DEAD SELECTORS:', JSON.stringify(dead));
// image display vs natural size (upscaling check)
const imgq = await p.evaluate(()=>[...document.images].map(i=>({f:i.currentSrc.split('/').pop(), nat:i.naturalWidth+'x'+i.naturalHeight, disp:Math.round(i.width)+'x'+Math.round(i.height), ratio:+(i.naturalWidth/i.width).toFixed(2)})));
console.log('IMAGES@1280:', JSON.stringify(imgq,null,1));
// duplicate image srcs
const srcs = await p.evaluate(()=>[...document.images].map(i=>i.getAttribute('src')));
const dup = srcs.filter((s,i)=>srcs.indexOf(s)!==i);
console.log('DUPLICATE IMG SRC:', JSON.stringify([...new Set(dup)]));
await ctx.close();

// 375: steps + terminal
const c2=await b.newContext({viewport:{width:375,height:812}});
const p2=await c2.newPage(); await p2.goto(URL,{waitUntil:'load'}); await p2.waitForTimeout(400);
const step=await p2.$('.steps .step:nth-child(2)'); await step.scrollIntoViewIfNeeded(); await p2.waitForTimeout(500);
await step.screenshot({path:OUT+'/375-step2.png'});
const term=await p2.$('.term'); await term.scrollIntoViewIfNeeded(); await p2.waitForTimeout(500);
await term.screenshot({path:OUT+'/375-term.png'});
// anchor landing at 375
await p2.evaluate(()=>window.scrollTo(0,0)); await p2.waitForTimeout(200);
await p2.evaluate(()=>{location.hash='#install'}); await p2.waitForTimeout(900);
const land2=await p2.evaluate(()=>{const e=document.querySelector('#install .eyebrow');const h=document.querySelector('.top').getBoundingClientRect();return {eyebrowTop:Math.round(e.getBoundingClientRect().top), headerBottom:Math.round(h.bottom), covered:e.getBoundingClientRect().top<h.bottom}});
console.log('375 anchor #install:',JSON.stringify(land2));
await c2.close();
await b.close();
