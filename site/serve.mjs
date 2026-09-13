// 랜딩을 로컬에서 보기 위한 정적 서버. node site/serve.mjs → http://localhost:8788
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0]);
  const f = join(ROOT, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  } catch { res.writeHead(500); res.end('error'); }
}).listen(PORT, () => console.log(`랜딩: http://localhost:${PORT}`));
