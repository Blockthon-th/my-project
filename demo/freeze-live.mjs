/**
 * 리허설에서 얻은 live 결과를 fallback 으로 얼려 둔다.
 *
 *   node C:\mm\demo\freeze-live.mjs           # compare-state.json 의 live → fallback (live.shot 은 live-fallback.jpg 로 복사)
 *   node C:\mm\demo\freeze-live.mjs --clear   # fallback 제거
 *
 * compare.html 에서 R 키를 누르면 오른쪽 "구독 후" 패널이 이 fallback 으로 바뀌고 "사전 실행" 라벨이 붙는다.
 * live 가 null 이면 (구매자 창이 아직 안 끝났으면) 처음부터 fallback 을 "사전 실행" 으로 보여준다.
 * mm state / market_receipt 는 모르는 키를 보존하므로(loadCompareState 가 spread) fallback 은 다음 갱신에도 살아남는다.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(here, 'state', 'compare-state.json');
if (!existsSync(statePath)) {
  console.error(`없음: ${statePath} — 먼저 mm state 를 실행하세요`);
  process.exit(1);
}
const s = JSON.parse(readFileSync(statePath, 'utf8'));

if (process.argv.includes('--clear')) {
  delete s.fallback;
  writeFileSync(statePath, JSON.stringify(s, null, 2));
  console.log('fallback 제거');
  process.exit(0);
}
if (!s.live) {
  console.error('live 가 null 입니다 — 구매자 실행 뒤 mm state 로 live 를 채운 다음 얼리세요');
  process.exit(1);
}
const fb = structuredClone(s.live);
if (fb.shot && !/^data:/.test(fb.shot)) {
  // live 스크린샷은 다음 실행에서 덮어써지므로 사본을 둔다
  const src = resolve(here, fb.shot.replace(/^\.?\//, ''));
  if (existsSync(src)) {
    const dst = resolve(here, 'state', `live-fallback${extname(src) || '.jpg'}`);
    copyFileSync(src, dst);
    fb.shot = `state/${basename(dst)}`;
  }
}
fb.frozen_at = Date.now();
s.fallback = fb;
writeFileSync(statePath, JSON.stringify(s, null, 2));
console.log(`fallback ← live (${fb.passed}/${fb.total}, ${new Date(fb.ts).toLocaleString('ko-KR')}, shot: ${fb.shot ?? '없음'})`);
