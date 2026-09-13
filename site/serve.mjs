// 랜딩을 로컬에서 보기 위한 정적 서버. node site/serve.mjs → http://localhost:8788
//
// 배포본(깃허브 페이지)과 경로가 같아야 로컬에서 본 것이 그대로 올라간다. 배포는 이렇게 펼쳐진다:
//   /index.html   ← site/index.html
//   /img/...      ← site/img/
//   /compare.html ← demo/compare.html   (폴더가 다르므로 여기서 이어 붙인다)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..');
// 배포본에서 최상위로 올라오는 파일들. 왼쪽이 주소, 오른쪽이 저장소 안 실제 위치.
const MOUNTED = {};   // 발표용 compare.html 은 공개 배포에서 뺐다. 데모 때는 demo/serve.mjs 로 띄운다.
const PORT = Number(process.env.PORT || 8788);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  const mounted = MOUNTED[p];
  const f = mounted ?? join(ROOT, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!mounted && !f.startsWith(ROOT)) { res.writeHead(404); res.end('not found'); return; }
  if (!existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  } catch { res.writeHead(500); res.end('error'); }
}).listen(PORT, () => console.log(`랜딩: http://localhost:${PORT}`));
