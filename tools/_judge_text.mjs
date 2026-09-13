import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto('file:///C:/mm/site/index.html');
await p.evaluate(()=>document.querySelectorAll('.rv').forEach(e=>e.classList.add('in')));
const r=await p.evaluate(()=>{
  const secs=[...document.querySelectorAll('section')].map(s=>{
    const t=s.innerText.replace(/\s+/g,' ').trim();
    return {id:s.id||'hero', chars:t.length, h:Math.round(s.getBoundingClientRect().height)};
  });
  const body=document.body.innerText.replace(/\s+/g,' ').trim();
  // first viewport text
  const inFold=[...document.querySelectorAll('h1,h2,p,q,span,li')].filter(e=>{
    const r=e.getBoundingClientRect(); return r.top>=0&&r.top<900&&r.height>0;
  }).map(e=>e.innerText.trim()).filter(Boolean);
  return {secs, total:body.length, docH:document.body.scrollHeight, fold:[...new Set(inFold)].slice(0,20)};
});
console.log(JSON.stringify(r,null,1));
await b.close();
