/**
 * demo/ 폴더를 http://localhost:8787 로 서빙하는 의존성 없는 정적 서버.
 *
 * compare.html 은 fetch('./state/compare-state.json') 으로 상태를 읽는데, file:// 로 열면
 * 브라우저가 fetch 를 막아 샘플 데이터만 보인다. 데모에서는 이 서버로 연다:
 *
 *   node C:\mm\demo\serve.mjs            → http://localhost:8787/compare.html
 *   node C:\mm\demo\serve.mjs 9000       → 포트 지정
 *
 * 캐시를 끄므로 mm state 가 파일을 갱신하면 compare.html 의 4초 폴링이 바로 반영한다.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/compare.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403); return res.end('forbidden');
    }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      // 상태 파일이 아직 없을 때는 404 대신 JSON null — 브라우저 콘솔에 빨간 줄이 남지 않게. compare.html 은 null 을 "샘플로" 로 읽는다.
      if (path === '/state/compare-state.json') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end('null');
      }
      res.writeHead(404); return res.end('not found: ' + path);
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'content-length': body.length,
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => {
  console.log(`demo server: http://localhost:${port}/compare.html  (root: ${root})`);
});
