import { chromium } from 'playwright';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop----/e4fbf30a-5f0a-49a0-a5be-249ad1f6e9dc/scratchpad/shots';
const b=await chromium.launch();
// 1) fast click on CTA right after load -> what does list look like?
const p=await b.newPage({viewport:{width:1440,height:900}});
const t0=Date.now();
await p.goto('http://127.0.0.1:8899/index-b.html');
await p.waitForTimeout(900);
await p.click('text=지금 팔리는 것 보기');
await p.waitForTimeout(400);
await p.screenshot({path:OUT+'/cta-fast.png'});
console.log('after CTA hash:',p.url(),'scrollY',await p.evaluate(()=>window.scrollY));
// time until first card value present
let ms=null;
for(let i=0;i<200;i++){const ok=await p.evaluate(()=>document.body.innerText.includes('0.05 SUI'));if(ok){ms=Date.now()-t0;break}await p.waitForTimeout(100);}
console.log('cards ready at ms',ms);
await p.screenshot({path:OUT+'/cta-ready.png'});
// 2) direct hash open
const p2=await b.newPage({viewport:{width:1440,height:900}});
await p2.goto('http://127.0.0.1:8899/index-b.html#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d');
await p2.waitForTimeout(1000);
await p2.screenshot({path:OUT+'/direct-early.png'});
await p2.waitForTimeout(8000);
const has=await p2.evaluate(()=>document.body.innerText.includes('이 묶음이 보장하는 것'));
console.log('direct hash renders detail:',has);
// 3) back nav: verify list visible again
const p3=await b.newPage({viewport:{width:1440,height:900}});
await p3.goto('http://127.0.0.1:8899/index-b.html',{waitUntil:'networkidle'});await p3.waitForTimeout(8000);
await p3.evaluate(()=>window.scrollTo(0,3600));await p3.waitForTimeout(400);
await p3.click('text=Paylane 랜딩 5턴 교정 과정');await p3.waitForTimeout(2500);
const inDetail=await p3.evaluate(()=>document.body.innerText.includes('이 묶음이 보장하는 것'));
await p3.goBack();await p3.waitForTimeout(1500);
const backOK=await p3.evaluate(()=>({list:document.body.innerText.includes('지금 올라와 있는 묶음'),hero:document.body.innerText.includes('당신의 시행착오'),y:window.scrollY,hash:location.hash}));
console.log('inDetail',inDetail,'back',JSON.stringify(backOK));
await p3.screenshot({path:OUT+'/back.png'});
await b.close();
