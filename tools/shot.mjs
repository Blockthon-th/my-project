#!/usr/bin/env node
/**
 * tools/shot.mjs <html 경로> [--out <경로 접두사>] [--max-kb 120] [--viewport 1280x800] [--mobile 375x812]
 *
 * Playwright chromium 으로 file:// 페이지를 열어
 *   <접두사>.jpg   , 데스크톱 뷰포트(기본 1280x800) JPEG, q80 에서 시작해 상한(기본 120KB)을 넘으면 q 를 낮춘다
 *   <접두사>.m.jpg , 모바일(기본 375x812) 첫 화면 JPEG
 * 을 쓴다. 전체 20초 타임아웃. 결과 요약 JSON 을 stdout 에 출력.
 *
 * capture.mjs 는 shoot() 를 직접 import 해서(브라우저 공유) 쓴다.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain, parseWH, sha256 } from './lib.mjs';

/** 애니메이션·전환을 즉시 끝내고 캐럿을 숨겨 스크린샷/측정을 결정적으로 만든다 */
export const CALM_CSS =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
  'transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;' +
  'scroll-behavior:auto!important}';

const QUALITIES = [80, 70, 60, 50, 40, 30, 20];

export function budget(deadline, cap) {
  return Math.max(500, Math.min(cap, deadline - Date.now()));
}

/**
 * 새 컨텍스트에서 페이지를 연다. 외부 리소스(폰트 등)가 늦어도 로드된 만큼으로 진행한다.
 * 반환된 context 는 호출자가 닫는다.
 */
export async function openPage(browser, htmlPath, { width, height, mobile = false, timeoutMs = 12000 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const url = pathToFileURL(resolve(htmlPath)).href;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  } catch {
    /* 타임아웃이어도 렌더된 만큼으로 진행 */
  }
  try {
    await page.addStyleTag({ content: CALM_CSS });
  } catch {
    /* ignore */
  }
  try {
    await page.evaluate(() =>
      Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 1500))]),
    );
  } catch {
    /* ignore */
  }
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(80);
  return { context, page };
}

/** 뷰포트 JPEG. q80 부터 시작해 maxBytes 를 넘으면 q 를 10씩 낮춘다(최저 20). */
export async function jpegUnder(page, maxBytes) {
  let buf = null;
  let used = QUALITIES[0];
  for (const q of QUALITIES) {
    buf = await page.screenshot({ type: 'jpeg', quality: q, fullPage: false });
    used = q;
    if (buf.length <= maxBytes) break;
  }
  return { buf, quality: used, oversize: buf.length > maxBytes };
}

function stripExt(p) {
  const e = extname(p);
  return e ? p.slice(0, -e.length) : p;
}

/**
 * @returns {{desktop: Shot|null, mobile: Shot|null, error: string|null}}
 *   Shot = { path, w, h, bytes, quality, oversize, sha256, buffer }
 */
export async function shoot(htmlPath, opts = {}) {
  const {
    outPrefix,
    viewport = [1280, 800],
    mobile = [375, 812],
    maxBytes = 120 * 1024,
    mobileMaxBytes = maxBytes,
    timeoutMs = 20000,
    browser: given = null,
  } = opts;
  const deadline = Date.now() + timeoutMs;
  const prefix = outPrefix ?? stripExt(resolve(htmlPath));
  const result = { desktop: null, mobile: null, error: null };

  let browser = given;
  let own = false;
  try {
    if (!browser) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
      own = true;
    }
    mkdirSync(dirname(prefix), { recursive: true });

    const one = async (key, [w, h], isMobile, max, suffix) => {
      const { context, page } = await openPage(browser, htmlPath, {
        width: w,
        height: h,
        mobile: isMobile,
        timeoutMs: budget(deadline, 12000),
      });
      try {
        const { buf, quality, oversize } = await jpegUnder(page, max);
        const path = prefix + suffix;
        writeFileSync(path, buf);
        result[key] = { path, w, h, bytes: buf.length, quality, oversize, sha256: sha256(buf), buffer: buf };
      } finally {
        await context.close().catch(() => {});
      }
    };

    const work = (async () => {
      await one('desktop', viewport, false, maxBytes, '.jpg');
      if (Date.now() < deadline) await one('mobile', mobile, true, mobileMaxBytes, '.m.jpg');
    })();
    let timer;
    const guard = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`shot timeout after ${timeoutMs}ms`)), Math.max(0, deadline - Date.now()));
    });
    try {
      await Promise.race([work, guard]);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    result.error = String(e?.message || e);
  } finally {
    if (own && browser) await browser.close().catch(() => {});
  }
  return result;
}

function parseArgs(argv) {
  const out = { html: null, out: null, maxKb: 120, viewport: [1280, 800], mobile: [375, 812] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--max-kb') out.maxKb = Number(argv[++i]) || 120;
    else if (a === '--viewport') out.viewport = parseWH(argv[++i], out.viewport);
    else if (a === '--mobile') out.mobile = parseWH(argv[++i], out.mobile);
    else if (!a.startsWith('--') && !out.html) out.html = a;
  }
  return out;
}

if (isMain(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.html) {
    console.error('usage: node shot.mjs <html> [--out prefix] [--max-kb 120] [--viewport WxH] [--mobile WxH]');
    process.exit(2);
  }
  const r = await shoot(a.html, {
    outPrefix: a.out ? resolve(a.out) : undefined,
    maxBytes: a.maxKb * 1024,
    mobileMaxBytes: a.maxKb * 1024,
    viewport: a.viewport,
    mobile: a.mobile,
  });
  const strip = (s) => (s ? { ...s, buffer: undefined } : null);
  process.stdout.write(JSON.stringify({ desktop: strip(r.desktop), mobile: strip(r.mobile), error: r.error }) + '\n');
  process.exit(r.desktop || r.mobile ? 0 : 1);
}
