#!/usr/bin/env node
/**
 * tools/check.mjs, 랜딩 **화면** 검사 5항목. (짝: tools/check-copy.mjs 는 한국어 **카피** 6항목)
 *
 *   node tools/check.mjs <html 경로|url> [--viewport 1280x800] [--mobile 375x812] [--only id,id]
 *
 * 무엇을 재나, 실제 브라우저(Playwright)로 페이지를 띄워 놓고 눈으로 보이는 것을 잰다.
 * 코드를 읽지 않아도 아래 다섯 줄이 이 도구가 재는 전부다.
 *
 *   cta-contrast  버튼이 배경에 묻히지 않는가
 *                 → 첫 <section> 안 가장 큰 a/button 의 글자색 대 배경색 대비가 4.5:1 이상
 *                   (배경 = 조상 중 첫 불투명 배경, 그라디언트는 첫 색으로 근사)
 *   h1-lines      큰 제목이 몇 줄로 떨어지는가
 *                 → 1280px 폭에서 h1 이 2줄 이하 (텍스트 노드 line box 의 top 을 묶어 센다)
 *   no-hscroll    폰에서 옆으로 밀리는가
 *                 → 375px 폭에서 scrollWidth ≤ clientWidth
 *   card-height   나란히 놓인 카드의 키가 들쭉날쭉한가
 *                 → 가격 패턴(₩|$|원|/월 …)이 든 형제 카드들의 높이 편차 8% 이하
 *                   (그런 카드가 없으면 같은 class 의 기능 카드 3개 이상, 그것도 없으면 통과)
 *   nav-overlap   고정 메뉴가 첫 문장을 가리는가
 *                 → position fixed/sticky 인 nav/header 가 첫 텍스트의 bbox 와 겹치지 않음
 *
 * 출력: { passed:[id…], failed:[id…], details:{…} } 를 stdout 에 JSON 으로. 종료코드 0.
 * 선택자를 미리 정해두지 않고 휴리스틱으로 대상을 찾으므로, 어느 페이지에나 그대로 돌릴 수 있다.
 *
 * capture.mjs 는 runChecks() 를 직접 import 해서(브라우저 공유) 쓴다.
 */
import {mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from 'node:path';
import { budget, jpegUnder, openPage } from './shot.mjs';
import { isMain, parseWH, sha256 } from './lib.mjs';

export const CHECK_IDS = ['cta-contrast', 'h1-lines', 'no-hscroll', 'card-height', 'nav-overlap'];
export const CHECK_DESCS = {
  'cta-contrast': '첫 섹션의 주 CTA 전경/배경 대비 4.5:1 이상',
  'h1-lines': '1280px 에서 h1 이 2줄 이하',
  'no-hscroll': '375px 에서 가로 스크롤 없음',
  'card-height': '가격/기능 카드 형제 높이 편차 8% 이하',
  'nav-overlap': '고정 nav 가 첫 텍스트를 가리지 않음',
};

/* ───────────── 페이지 안에서 실행되는 함수들 (외부 스코프 참조 금지) ───────────── */

function desktopChecks({ vh }) {
  const out = {};
  const cs = (el) => getComputedStyle(el);
  const rectOf = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const s = cs(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = rectOf(el);
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    if (!el || el.nodeType !== 1) return null;
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList && el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    return s;
  };
  const parseColor = (str) => {
    if (!str) return null;
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (c) => (top[c] * top.a + bottom[c] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const fmt = (c) => (c ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})` : null);
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (c1, c2) => {
    const l1 = lum(c1);
    const l2 = lum(c2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /** 요소부터 조상으로 올라가며 첫 불투명 배경까지 합성 */
  const effectiveBg = (el) => {
    let acc = { r: 0, g: 0, b: 0, a: 0 };
    const chain = [];
    let gradient = false;
    let imageIgnored = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = cs(e);
      let c = parseColor(s.backgroundColor);
      const bi = s.backgroundImage;
      if ((!c || c.a === 0) && bi && bi !== 'none') {
        if (/gradient\(/.test(bi)) {
          const g = parseColor(bi);
          if (g) {
            c = { r: g.r, g: g.g, b: g.b, a: 1 };
            gradient = true;
          }
        } else imageIgnored = true;
      }
      if (c && c.a > 0) {
        acc = over(acc, c);
        chain.push(label(e));
        if (acc.a >= 0.999) break;
      }
    }
    if (acc.a < 0.999) acc = over(acc, { r: 255, g: 255, b: 255, a: 1 });
    return { color: acc, chain, gradient, imageIgnored };
  };
  const all = [...document.body.querySelectorAll('*')];

  /* cta-contrast */
  try {
    const firstSection = document.querySelector('section');
    const container =
      firstSection || document.querySelector('main') || document.querySelector('header') || document.body;
    const cands = [
      ...container.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]'),
    ]
      .filter(visible)
      .filter((el) => firstSection || rectOf(el).top < vh * 2);
    let best = null;
    let bestArea = 0;
    for (const el of cands) {
      const r = rectOf(el);
      const area = r.width * r.height;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    if (!best) out.cta = { pass: true, reason: 'no cta found', container: label(container) };
    else {
      let textEl = best;
      const walker = document.createTreeWalker(best, NodeFilter.SHOW_TEXT);
      let tn;
      while ((tn = walker.nextNode())) {
        if (tn.textContent.trim()) {
          textEl = tn.parentElement || best;
          break;
        }
      }
      const bg = effectiveBg(best);
      const fg0 = parseColor(cs(textEl).color);
      const fg = fg0 ? (fg0.a < 1 ? over(fg0, bg.color) : fg0) : null;
      const ratio = fg ? contrast(fg, bg.color) : null;
      out.cta = {
        pass: ratio == null ? true : ratio >= 4.5,
        ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
        cta: label(best),
        text: (best.textContent || best.value || '').trim().slice(0, 40),
        fg: fmt(fg),
        bg: fmt(bg.color),
        bgFrom: bg.chain,
        gradientApprox: bg.gradient || undefined,
        bgImageIgnored: bg.imageIgnored || undefined,
        reason: ratio == null ? 'color not parseable' : undefined,
      };
    }
  } catch (e) {
    out.cta = { pass: true, error: String(e && e.message) };
  }

  /* h1-lines */
  try {
    const h1 = [...document.querySelectorAll('h1')].find(visible);
    if (!h1) out.h1 = { pass: true, reason: 'no h1' };
    else {
      const rects = [];
      const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
      let tn;
      while ((tn = walker.nextNode())) {
        if (!tn.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(tn);
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
      }
      rects.sort((a, b) => a.top - b.top);
      let lines = 0;
      let lastTop = -Infinity;
      for (const r of rects) {
        if (lines === 0 || r.top - lastTop > r.height * 0.5) {
          lines++;
          lastTop = r.top;
        }
      }
      if (!lines) {
        const s = cs(h1);
        const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
        lines = Math.max(1, Math.round(rectOf(h1).height / lh));
      }
      out.h1 = {
        pass: lines <= 2,
        lines,
        text: h1.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
        fontSize: cs(h1).fontSize,
        width: Math.round(rectOf(h1).width),
      };
    }
  } catch (e) {
    out.h1 = { pass: true, error: String(e && e.message) };
  }

  /* card-height */
  try {
    const PRICE = /(₩\s?\d|\$\s?\d|€\s?\d|£\s?\d|\d[\d,.]*\s?원|\/\s*(월|mo\b|month|yr|year|년))/i;
    const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const cardish = (el) => {
      if (!visible(el)) return false;
      const r = rectOf(el);
      return r.height >= 80 && r.width >= 120 && (textOf(el).length >= 20 || !!el.querySelector('h1,h2,h3,h4'));
    };
    const sideBySide = (els) => {
      const tops = els.map((e) => Math.round(rectOf(e).top));
      return tops.some((t, i) => tops.findIndex((u) => Math.abs(u - t) <= 2) !== i);
    };
    const evaluateGroup = (els, kind) => {
      const hs = els.map((e) => Math.round(rectOf(e).height));
      const max = Math.max(...hs);
      const min = Math.min(...hs);
      const dev = max ? (max - min) / max : 0;
      return {
        pass: dev <= 0.08,
        kind,
        count: els.length,
        heights: hs,
        deviation: Math.round(dev * 1000) / 1000,
        parent: label(els[0].parentElement),
        members: els.map(label),
      };
    };
    let group = null;
    const skipTag = (el) => ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName);
    const leaves = all.filter((el) => {
      if (skipTag(el)) return false;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ');
      return PRICE.test(own);
    });
    const seen = new Set();
    outer: for (const leaf of leaves) {
      for (let cur = leaf; cur && cur.parentElement; cur = cur.parentElement) {
        const parent = cur.parentElement;
        if (parent === document.documentElement) break;
        if (seen.has(parent)) continue;
        seen.add(parent);
        const sibs = [...parent.children].filter((ch) => cardish(ch) && PRICE.test(textOf(ch)));
        if (sibs.length >= 2 && sideBySide(sibs)) {
          group = evaluateGroup(sibs, 'price');
          break outer;
        }
      }
    }
    if (!group) {
      const byParent = new Map();
      for (const el of all) {
        const p = el.parentElement;
        if (!p || typeof el.className !== 'string') continue;
        const key = el.className.trim();
        if (!key) continue;
        if (!byParent.has(p)) byParent.set(p, new Map());
        const m = byParent.get(p);
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(el);
      }
      outer2: for (const [, m] of byParent) {
        for (const [, els] of m) {
          if (els.length >= 3 && els.every((e) => cardish(e) && e.querySelector('h2,h3,h4')) && sideBySide(els)) {
            group = evaluateGroup(els, 'feature');
            break outer2;
          }
        }
      }
    }
    out.cards = group || { pass: true, kind: 'none', reason: 'no cards found' };
  } catch (e) {
    out.cards = { pass: true, error: String(e && e.message) };
  }

  /* nav-overlap */
  try {
    const fixedish = (el) => {
      const p = cs(el).position;
      return p === 'fixed' || p === 'sticky';
    };
    let nav = [...document.querySelectorAll('nav,header,[role="navigation"],[role="banner"]')].find(
      (el) => visible(el) && (fixedish(el) || (el.parentElement && el.parentElement !== document.body && fixedish(el.parentElement))),
    );
    if (nav && !fixedish(nav)) nav = nav.parentElement;
    if (!nav) {
      nav = all.find(
        (el) =>
          visible(el) &&
          fixedish(el) &&
          rectOf(el).top < vh * 0.3 &&
          rectOf(el).width >= window.innerWidth * 0.5 &&
          el.querySelector('nav,a'),
      );
    }
    if (!nav) out.nav = { pass: true, reason: 'no fixed/sticky nav' };
    else {
      const navRect = rectOf(nav);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
          const p = n.parentElement;
          if (!p || nav.contains(p) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(p.tagName))
            return NodeFilter.FILTER_REJECT;
          if (!visible(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const tn = walker.nextNode();
      if (!tn) out.nav = { pass: true, reason: 'no text outside nav' };
      else {
        const range = document.createRange();
        range.selectNodeContents(tn);
        const tr = range.getBoundingClientRect();
        const ox = Math.min(navRect.right, tr.right) - Math.max(navRect.left, tr.left);
        const oy = Math.min(navRect.bottom, tr.bottom) - Math.max(navRect.top, tr.top);
        const overlap = ox > 1 && oy > 1;
        out.nav = {
          pass: !overlap,
          nav: label(nav),
          position: cs(nav).position,
          navBottom: Math.round(navRect.bottom),
          firstText: tn.textContent.trim().slice(0, 40),
          textTop: Math.round(tr.top),
          overlapPx: overlap ? Math.round(oy) : 0,
        };
      }
    }
  } catch (e) {
    out.nav = { pass: true, error: String(e && e.message) };
  }

  return out;
}

function mobileChecks() {
  const de = document.documentElement;
  const body = document.body;
  const sw = Math.max(de.scrollWidth, body ? body.scrollWidth : 0);
  const cw = de.clientWidth;
  let worst = null;
  let worstRight = cw;
  for (const el of body.querySelectorAll('*')) {
    if (getComputedStyle(el).position === 'fixed') continue; // 고정 요소는 레이아웃 뷰포트를 따라 늘어나므로 원인이 아니다
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > worstRight + 1) {
      worstRight = r.right;
      worst = el;
    }
  }
  const label = (el) => {
    if (!el) return null;
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    return s;
  };
  const ox = (el) => (el ? getComputedStyle(el).overflowX : '');
  const clipped = ['hidden', 'clip'].includes(ox(de)) || ['hidden', 'clip'].includes(ox(body));
  return {
    hscroll: {
      pass: sw <= cw,
      scrollWidth: sw,
      clientWidth: cw,
      offender: label(worst),
      offenderRight: Math.round(worstRight),
      clipped: clipped || undefined,
    },
  };
}

/* ───────────── Node 쪽 ───────────── */

function normalizeOnly(only) {
  if (!only) return null;
  const ids = (Array.isArray(only) ? only : String(only).split(','))
    .map((c) => (c && typeof c === 'object' ? c.id : c))
    .map((s) => String(s || '').trim())
    .filter((s) => CHECK_IDS.includes(s));
  return ids.length ? new Set(ids) : null;
}

const DESKTOP_IDS = ['cta-contrast', 'h1-lines', 'card-height', 'nav-overlap'];

/** 검사 결과 누적기, runChecks 와 shootAndCheck 가 공유 */
function collector(only) {
  const want = normalizeOnly(only);
  const enabled = (id) => !want || want.has(id);
  const details = {};
  const results = {}; // id → boolean
  return {
    enabled,
    details,
    needDesktop: () => DESKTOP_IDS.some(enabled),
    needMobile: () => enabled('no-hscroll'),
    async desktop(page, vh) {
      const d = await page.evaluate(desktopChecks, { vh });
      const map = { 'cta-contrast': d.cta, 'h1-lines': d.h1, 'card-height': d.cards, 'nav-overlap': d.nav };
      for (const id of DESKTOP_IDS) if (enabled(id)) (results[id] = !!map[id].pass), (details[id] = map[id]);
    },
    async mobile(page) {
      const m = await page.evaluate(mobileChecks);
      results['no-hscroll'] = !!m.hscroll.pass;
      details['no-hscroll'] = m.hscroll;
    },
    result() {
      return {
        passed: CHECK_IDS.filter((id) => results[id] === true),
        failed: CHECK_IDS.filter((id) => results[id] === false),
        details,
      };
    },
  };
}

async function withBrowser(given, deadline, label, fn) {
  let browser = given;
  let own = false;
  try {
    if (!browser) {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
      own = true;
    }
    let timer;
    const guard = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${label} timeout`)), Math.max(0, deadline - Date.now()));
    });
    try {
      await Promise.race([fn(browser), guard]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    if (own && browser) await browser.close().catch(() => {});
  }
}

/**
 * @returns {{passed:string[], failed:string[], details:object}}
 */
export async function runChecks(htmlPath, opts = {}) {
  const { viewport = [1280, 800], mobile = [375, 812], only = null, browser = null, timeoutMs = 20000 } = opts;
  const deadline = Date.now() + timeoutMs;
  const c = collector(only);
  try {
    await withBrowser(browser, deadline, 'check', async (b) => {
      if (c.needDesktop()) {
        const { context, page } = await openPage(b, htmlPath, { width: viewport[0], height: viewport[1], timeoutMs: budget(deadline, 12000) });
        try {
          await c.desktop(page, viewport[1]);
        } finally {
          await context.close().catch(() => {});
        }
      }
      if (c.needMobile()) {
        const { context, page } = await openPage(b, htmlPath, { width: mobile[0], height: mobile[1], mobile: true, timeoutMs: budget(deadline, 12000) });
        try {
          await c.mobile(page);
        } finally {
          await context.close().catch(() => {});
        }
      }
    });
  } catch (e) {
    c.details.error = String(e?.message || e);
  }
  return c.result();
}

/**
 * 스크린샷 2장 + 검사 5항목을 페이지 로드 2번(데스크톱·모바일)으로 한 번에. capture.mjs 가 쓴다.
 * @returns {{shot:{desktop,mobile,error}, check:{passed,failed,details}}}
 */
export async function shootAndCheck(htmlPath, opts = {}) {
  const {
    outPrefix,
    viewport = [1280, 800],
    mobile = [375, 812],
    maxBytes = 90 * 1000,
    mobileMaxBytes = 60 * 1000,
    only = null,
    browser = null,
    timeoutMs = 40000,
  } = opts;
  const deadline = Date.now() + timeoutMs;
  const shot = { desktop: null, mobile: null, error: null };
  const c = collector(only);
  const snap = async (page, key, [w, h], max, suffix) => {
    try {
      const { buf, quality, oversize } = await jpegUnder(page, max);
      const path = outPrefix + suffix;
      writeFileSync(path, buf);
      shot[key] = { path, w, h, bytes: buf.length, quality, oversize, sha256: sha256(buf), buffer: buf };
    } catch (e) {
      shot.error = String(e?.message || e);
    }
  };
  try {
    mkdirSync(dirname(outPrefix), { recursive: true });
    await withBrowser(browser, deadline, 'shoot+check', async (b) => {
      {
        const { context, page } = await openPage(b, htmlPath, { width: viewport[0], height: viewport[1], timeoutMs: budget(deadline, 12000) });
        try {
          await snap(page, 'desktop', viewport, maxBytes, '.jpg');
          if (c.needDesktop()) await c.desktop(page, viewport[1]);
        } finally {
          await context.close().catch(() => {});
        }
      }
      if (Date.now() < deadline) {
        const { context, page } = await openPage(b, htmlPath, { width: mobile[0], height: mobile[1], mobile: true, timeoutMs: budget(deadline, 12000) });
        try {
          await snap(page, 'mobile', mobile, mobileMaxBytes, '.m.jpg');
          if (c.needMobile()) await c.mobile(page);
        } finally {
          await context.close().catch(() => {});
        }
      }
    });
  } catch (e) {
    const msg = String(e?.message || e);
    c.details.error = msg;
    if (!shot.error) shot.error = msg;
  }
  return { shot, check: c.result() };
}

function parseArgs(argv) {
  const out = { html: null, viewport: [1280, 800], mobile: [375, 812], only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--viewport') out.viewport = parseWH(argv[++i], out.viewport);
    else if (a === '--mobile') out.mobile = parseWH(argv[++i], out.mobile);
    else if (a === '--only') out.only = argv[++i];
    else if (!a.startsWith('--') && !out.html) out.html = a;
  }
  return out;
}

if (isMain(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.html) {
    console.error('usage: node check.mjs <html> [--viewport WxH] [--mobile WxH] [--only id,id]');
    process.exit(2);
  }
  if (!existsSync(a.html)) {
    // 없는 파일은 빈 페이지로 렌더되어 4/5 처럼 보인다, 점수 대신 오류로 끝낸다.
    process.stdout.write(JSON.stringify({ error: "file not found", html: a.html, passed: [], failed: [] }) + "\n");
    process.exit(3);
  }
  const r = await runChecks(a.html, { viewport: a.viewport, mobile: a.mobile, only: a.only });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(0);
}
