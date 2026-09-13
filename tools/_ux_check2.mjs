import { chromium } from 'playwright';
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1440,height:900}});
const p=await c.newPage();
await p.goto('http://localhost:8899/index.html');
const snap=async(label)=>{
  const v=await p.evaluate(()=>({
    y:window.pageYOffset,
    rm:matchMedia('(prefers-reduced-motion: reduce)').matches,
    docH:document.documentElement.scrollHeight,
    bubbles:[...document.querySelectorAll('#sec-chat .bubble')].slice(0,4).map(e=>({op:getComputedStyle(e).opacity,cls:e.className,top:Math.round(e.getBoundingClientRect().top)})),
    revealNotIn:document.querySelectorAll('.reveal:not(.in)').length,
    revealTotal:document.querySelectorAll('.reveal').length
  }));
  console.log(label, JSON.stringify(v));
};
await p.waitForTimeout(100); await snap('t=100ms');
await p.waitForTimeout(900); await snap('t=1s');
await p.waitForTimeout(2000); await snap('t=3s');
await b.close();
