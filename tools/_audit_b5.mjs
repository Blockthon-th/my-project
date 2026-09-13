import { chromium } from 'playwright';
const URL='file:///C:/mm/site/index-b.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(300);
const a=await p.evaluate(()=>{
  const heads=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>h.tagName+': '+h.textContent.trim().slice(0,40));
  // heading order jumps
  const lv=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>+h.tagName[1]);
  const jumps=[]; for(let i=1;i<lv.length;i++) if(lv[i]-lv[i-1]>1) jumps.push(lv[i-1]+'->'+lv[i]+' @ '+heads[i]);
  // focus outline
  const a1=document.querySelector('.top nav a');
  // images without alt
  const noalt=[...document.images].filter(i=>!i.getAttribute('alt')).map(i=>i.getAttribute('src'));
  // link text
  const emptyLinks=[...document.querySelectorAll('a')].filter(a=>!a.textContent.trim()).length;
  // main landmark
  return {headCount:heads.length, jumps, noalt, emptyLinks, hasMain:!!document.querySelector('main'), hasSkip:!!document.querySelector('a[href="#main"],.skip'), lang:document.documentElement.lang, heads};
});
console.log(JSON.stringify(a,null,1));
// focus-visible test
await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
const f=await p.evaluate(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return {tag:e.tagName,txt:e.textContent.trim().slice(0,20),outline:cs.outlineStyle+' '+cs.outlineWidth+' '+cs.outlineColor, boxShadow:cs.boxShadow}});
console.log('focus:',JSON.stringify(f));
await b.close();
