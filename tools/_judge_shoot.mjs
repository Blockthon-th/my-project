import { chromium } from 'playwright';
const OUT='C:/Users/pc/AppData/Local/Temp/claude/judge';
const b=await chromium.launch();
for (const [w,h,tag] of [[1280,900,'d'],[375,812,'m']]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  await p.goto('file:///C:/mm/site/index.html');
  await p.waitForTimeout(600);
  // reveal all
  await p.evaluate(()=>document.querySelectorAll('.rv').forEach(e=>e.classList.add('in')));
  await p.waitForTimeout(300);
  // above the fold
  await p.screenshot({path:`${OUT}/${tag}-fold.png`});
  if(tag==='d'){
    const secs=await p.$$('section');
    for(let i=0;i<secs.length;i++){
      await secs[i].screenshot({path:`${OUT}/${tag}-sec${i+1}.png`}).catch(()=>{});
    }
    const f=await p.$('footer'); if(f) await f.screenshot({path:`${OUT}/${tag}-foot.png`}).catch(()=>{});
  }
  const info=await p.evaluate(()=>({
    sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth,
    h:document.body.scrollHeight,
    h1:document.querySelector('h1')?.textContent.trim(),
    h1rects:document.querySelector('h1')?document.querySelector('h1').getClientRects().length:null,
    title:document.title
  }));
  console.log(tag, JSON.stringify(info));
  await p.close();
}
await b.close();
