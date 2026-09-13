import { chromium } from 'playwright';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/judge';
const URL='file:///C:/mm/site/index.html';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
const pg=await ctx.newPage();
const reqs=[], errs=[];
pg.on('request',r=>{const u=r.url(); if(!u.startsWith('file:')) reqs.push(r.method()+' '+u.slice(0,90));});
pg.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text().slice(0,200));});
pg.on('pageerror',e=>errs.push('pageerror:'+e.message.slice(0,200)));
pg.on('requestfailed',r=>{if(!r.url().startsWith('file:'))errs.push('reqfail:'+r.url().slice(0,80)+' '+(r.failure()?.errorText));});
const t0=Date.now();
await pg.goto(URL,{waitUntil:'load'});
// capture early states
for(const ms of [300,800,1500]){
  await pg.waitForTimeout(ms===300?300:(ms===800?500:700));
  await pg.screenshot({path:`${OUT}/t${ms}.png`});
}
// wait for cards
let tCards=null;
try{ await pg.waitForSelector('.card',{timeout:20000}); tCards=Date.now()-t0; }catch(e){}
await pg.waitForTimeout(1500);
await pg.screenshot({path:`${OUT}/list-fold.png`});
const listText=await pg.evaluate(()=>document.body.innerText);
console.log('=== TIME TO FIRST CARD ms:', tCards);
console.log('=== NETWORK ==='); console.log([...new Set(reqs)].join('\n'));
console.log('=== ERRORS ==='); console.log(errs.join('\n')||'(none)');
console.log('=== LIST TEXT ===');
console.log(listText);
await b.close();
