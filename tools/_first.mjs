import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL('C:/Users/pc/Desktop/해커톤/my-project/site/index.html').href);
await p.waitForTimeout(7000);
const t = await p.evaluate(()=>{
  const out=[]; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
  while((n=w.nextNode())){ const s=(n.nodeValue||'').trim(); if(!s) continue;
    const el=n.parentElement; if(!el) continue; const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0) continue;
    const r=el.getBoundingClientRect();
    if(r.bottom<=0||r.top>=900||r.right<=0||r.left>=1440||r.width===0||r.height===0) continue;
    out.push(s); }
  return out.join('\n');
});
console.log(t);
console.log('---BANNED---', JSON.stringify(t.match(/Sui|Walrus|Seal|MCP|온체인|블록체인|구독권|접근권|팩|복호화|트랜잭션|프로토콜|에이전트/g)));
await b.close();
