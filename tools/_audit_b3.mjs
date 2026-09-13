import { chromium } from 'playwright';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const URL='file:///C:/mm/site/index-b.html';
const b=await chromium.launch();

// 1. no-JS
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}, javaScriptEnabled:false});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(300);
  const hidden = await p.evaluate?null:null;
  await p.screenshot({path:OUT+'/nojs.png'});
  console.log('no-JS screenshot taken');
  await ctx.close();
}
// 2. reduced motion
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}, reducedMotion:'reduce'});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{
    const els=[...document.querySelectorAll('.rv')];
    const invisible=els.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99).length;
    return {total:els.length, invisible, scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior};
  });
  console.log('reduced-motion:', JSON.stringify(r));
  await ctx.close();
}
// 3. print emulation
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(500);
  await p.emulateMedia({media:'print'});
  await p.pdf({path:OUT+'/print.pdf', printBackground:false, format:'A4'});
  const pr=await p.evaluate(()=>({bodyBg:getComputedStyle(document.body).backgroundColor, bodyColor:getComputedStyle(document.body).color}));
  console.log('print media computed:', JSON.stringify(pr));
  await ctx.close();
}
// 4. 200% zoom simulation (deviceScaleFactor is not zoom; emulate via narrow css width)
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>{document.body.style.zoom='2';});
  await p.waitForTimeout(400);
  const z=await p.evaluate(()=>({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth}));
  console.log('zoom200:', JSON.stringify(z));
  await ctx.close();
}
// 5. contrast audit on real rendered text
{
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(400);
  const bad=await p.evaluate(()=>{
    function lum(c){const[r,g,bb]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*r+0.7152*g+0.0722*bb}
    function parse(s){const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(Number);return {rgb:[p[0],p[1],p[2]],a:p.length>3?p[3]:1}}
    function bgOf(el){let e=el;while(e){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0.5)return c.rgb;e=e.parentElement}return [9,11,15]}
    const out=[];
    document.querySelectorAll('p,span,div,td,th,li,a,h1,h2,h3,h4,code').forEach(el=>{
      const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join('');
      if(!t) return;
      const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden') return;
      const fg=parse(cs.color); if(!fg) return;
      const bg=bgOf(el);
      const L1=lum(fg.rgb), L2=lum(bg);
      const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      const fs=parseFloat(cs.fontSize); const bold=parseInt(cs.fontWeight)>=700;
      const large = fs>=24 || (fs>=18.66 && bold);
      const need = large?3:4.5;
      if(ratio<need) out.push({t:t.slice(0,42), cls:(el.className||'').toString().slice(0,34), fs:cs.fontSize, color:cs.color, bg:'rgb('+bg.join(',')+')', ratio:+ratio.toFixed(2), need});
    });
    // dedupe
    const seen=new Set(); return out.filter(o=>{const k=o.cls+o.color+o.fs; if(seen.has(k))return false; seen.add(k); return true;});
  });
  console.log('CONTRAST FAILURES:', JSON.stringify(bad,null,1));
  // smallest font sizes in use
  const sizes=await p.evaluate(()=>{
    const m={};document.querySelectorAll('*').forEach(el=>{const t=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).length;if(!t)return;const cs=getComputedStyle(el);if(cs.display==='none')return;const s=cs.fontSize;m[s]=(m[s]||0)+1});return m;
  });
  console.log('font sizes:', JSON.stringify(sizes));
  await ctx.close();
}
await b.close();
