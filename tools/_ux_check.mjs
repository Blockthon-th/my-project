import { chromium } from 'playwright';
const URL='http://localhost:8899/index.html';
const out={};
const b=await chromium.launch();

// A) reduced motion
{
  const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const p=await c.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);
  out.rm_hidden = await p.evaluate(()=>[...document.querySelectorAll('.reveal')].filter(e=>parseFloat(getComputedStyle(e).opacity)<0.99).length);
  out.rm_total = await p.evaluate(()=>document.querySelectorAll('.reveal').length);
  out.rm_errs=errs;
  await c.close();
}
// B) top of page hidden + banned words first screen
{
  const c=await b.newContext({viewport:{width:1440,height:900}});
  const p=await c.newPage();
  const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.waitForTimeout(2500);
  out.top_bubbleHidden = await p.evaluate(()=>{const b=[...document.querySelectorAll('#sec-chat .bubble')];return {total:b.length,hidden:b.filter(e=>parseFloat(getComputedStyle(e).opacity)<0.5).length}});
  out.firstScreen = await p.evaluate(()=>{
    const bad=/Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/g;
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const hits=[];let t;
    while(t=w.nextNode()){
      const s=t.nodeValue.trim(); if(!s) continue;
      const el=t.parentElement; const cs=getComputedStyle(el);
      if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0) continue;
      const r=el.getBoundingClientRect();
      if(r.bottom<=0||r.top>=900||r.height===0) continue;
      const m=s.match(bad); if(m) hits.push({s:s.slice(0,60),m});
    }
    return hits;
  });
  // padding check on detail at various widths
  const widths=[375,600,768,900,1024,1200,1440];
  out.detailPadding=[];
  for(const w of widths){
    await p.setViewportSize({width:w,height:900});
    await p.evaluate(()=>{location.hash='#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d'});
    await p.waitForTimeout(600);
    const v=await p.evaluate(()=>{const el=document.querySelector('#view-detail .wrap');if(!el)return null;const r=el.getBoundingClientRect();const h=document.querySelector('#view-detail h1')||document.querySelector('#view-detail h2');return {left:Math.round(r.left),right:Math.round(document.documentElement.clientWidth-r.right),pl:getComputedStyle(el).paddingLeft,h1Left:h?Math.round(h.getBoundingClientRect().left):null}});
    out.detailPadding.push({w,...v});
  }
  out.errs=errs;
  await c.close();
}
await b.close();
console.log(JSON.stringify(out,null,2));
