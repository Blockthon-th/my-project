import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
await p.goto(pathToFileURL('C:/Users/pc/Desktop/해커톤/my-project/site/index.html').href);
await p.waitForTimeout(9000);
const r = await p.evaluate(()=>({
  cards: document.querySelectorAll('#cards .card:not(.sk)').length,
  cardText: (document.querySelector('#cards .card') || {}).innerText || '',
  imgs: [...document.images].map(i=>i.naturalWidth)
}));
console.log('file:// ->', JSON.stringify(r).slice(0,400));
console.log('console errors:', JSON.stringify(errs).slice(0,400));
await b.close();
