/**
 * check-copy.mjs — 한국어 랜딩 카피 검사 6항목.
 *
 *   node check-copy.mjs <html|url> [--banned a,b,c] [--viewport 1440x900] [--mobile 375x812]
 *
 * 출력: {"passed":[...],"failed":[...],"details":{...}} 를 stdout 으로, 종료코드 0.
 * 파일이 없으면 종료코드 3 과 {"error":"file not found"}.
 *
 * 한계(정직하게): 형태소 분석기를 쓰지 않는다. 정규식과 빈도로 본다.
 * 인용문 안의 말투나 코드 블록 안의 문장은 걸러내지만 완벽하지 않다.
 * 실패로 뜬 항목은 사람이 한 번 보고 판단하라는 신호이지 자동 판정이 아니다.
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const COPY_CHECKS = [
  { id: 'first-screen-jargon', desc: '첫 화면(스크롤 없이 보이는 영역)에 자사 용어·기술명 0건' },
  { id: 'honorific-consistent', desc: '해요체와 합니다체를 섞지 않음' },
  { id: 'no-cleft', desc: '분열문(핵심은 ~다 / 필요한 것은 ~이다) 0건' },
  { id: 'dash-restraint', desc: '대시(—) 부가설명 3회 이하' },
  { id: 'quote-restraint', desc: '따옴표 강조 5회 미만' },
  { id: 'no-hscroll-375', desc: '375px 에서 가로 스크롤 없음' },
];

const DEFAULT_BANNED = [
  'Sui', 'Walrus', 'Seal', 'MCP', '온체인', '블록체인', '구독권', '접근권',
  '복호화', '트랜잭션', '프로토콜', '에이전트', 'SDK', '스마트컨트랙트', '컨트랙트',
];

/** AI 가 쓴 한글 티 — 문장 단위로 본다 */
const CLEFT = /(핵심은|필요한\s*것은|문제는|관건은|중요한\s*것은|답은)[^.!?\n]{0,40}(이다|입니다|이에요|예요|랍니다)/g;

function parseWH(s, fb) {
  const m = /^(\d+)x(\d+)$/.exec(s || '');
  return m ? { width: +m[1], height: +m[2] } : fb;
}

function countHonorific(text) {
  // 합쇼체 어미는 어간 + -(스)ㅂ니다 다. '습니다|입니다' 만 세면 '합니다·걸립니다·드립니다·채워집니다'
  // 를 통째로 놓친다(이름이 합니다체인데 정작 '합니다' 를 못 셌다). '니다' 앞 음절의 받침이
  // ㅂ(종성 17)인지로 센다 — '다니다·지니다' 같은 기본형은 받침이 없어 걸리지 않는다.
  let formal = 0;
  for (const m of text.matchAll(/([\uac00-\ud7a3])니다(?=[.!?\u2026\u300d\u201d"'\s)]|$)/g)) {
    const i = m[1].charCodeAt(0) - 0xac00;
    if (i % 28 === 17) formal++;
  }
  const polite = (text.match(/(해요|예요|이에요|어요|아요|세요|네요|거든요|나요|져요|워요|려요|와요|봐요|지요|죠)(?=[.!?\u2026\u300d\u201d"'\s)]|$)/g) || []).length;
  return { formal, polite };
}

export async function runCopyChecks(target, opts = {}) {
  const banned = opts.banned ?? DEFAULT_BANNED;
  const viewport = opts.viewport ?? { width: 1440, height: 900 };
  const mobile = opts.mobile ?? { width: 375, height: 812 };
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const details = {};
  try {
    const page = await browser.newPage({ viewport });
    const url = /^https?:\/\//.test(target) ? target : pathToFileURL(target).href;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(url, { timeout: 30000 }));
    await page.waitForTimeout(700);

    // 1. 첫 화면 금지어 — 스크롤 없이 보이는 영역의 텍스트만
    const firstScreen = await page.evaluate(() => {
      const vh = window.innerHeight;
      const out = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            const t = (c.textContent || '').trim();
            if (!t) continue;
            const r = c.parentElement?.getBoundingClientRect();
            if (!r || r.height === 0) continue;
            const st = getComputedStyle(c.parentElement);
            if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) continue;
            if (r.top < vh && r.bottom > 0) out.push(t);
          } else if (c.nodeType === 1 && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(c.tagName)) walk(c);
        }
      };
      walk(document.body);
      return out.join(' ');
    });
    const low = firstScreen.toLowerCase();
    const hits = banned.filter((w) => low.includes(w.toLowerCase()));
    details['first-screen-jargon'] = { pass: hits.length === 0, hits, sample: firstScreen.slice(0, 240) };

    // 산문 텍스트 — 코드 블록은 뺀다
    const prose = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script,style,noscript,code,pre,kbd,samp').forEach((e) => e.remove());
      return (clone.textContent || '').replace(/\s+/g, ' ');
    });

    // 2. 말투 일관성
    const { formal, polite } = countHonorific(prose);
    const total = formal + polite;
    const minor = Math.min(formal, polite);
    const ratio = total ? minor / total : 0;
    details['honorific-consistent'] = { pass: total < 6 || ratio <= 0.15, formal, polite, minorityRatio: +ratio.toFixed(3) };

    // 3. 분열문
    const clefts = [...prose.matchAll(CLEFT)].map((m) => m[0].slice(0, 60));
    details['no-cleft'] = { pass: clefts.length === 0, count: clefts.length, samples: clefts.slice(0, 4) };

    // 4. 대시 부가설명
    const dashes = (prose.match(/\s—\s/g) || []).length;
    details['dash-restraint'] = { pass: dashes <= 3, count: dashes };

    // 5. 따옴표 강조
    // 곧은 따옴표(")와 굽은 따옴표(\u201c \u201d)를 함께 본다. 한글 카피의 강조는 대개 굽은 쪽이다.
    // \u 이스케이프로 적는다 — 굽은 따옴표를 글자 그대로 두면 파일이 ASCII 로 정규화될 때
    // 곧은 따옴표로 바뀌어 조용히 [""] 같은 중복 문자 클래스가 된다(실제로 그렇게 깨져 있었다).
    const quotes = (prose.match(/[\u201c\u201d"][^\u201c\u201d"\n]{1,40}[\u201c\u201d"]/g) || []).length + (prose.match(/\u300c[^\u300d\n]{1,40}\u300d/g) || []).length;
    details['quote-restraint'] = { pass: quotes < 5, count: quotes };

    // 6. 375px 가로 스크롤
    await page.setViewportSize(mobile);
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    details['no-hscroll-375'] = { pass: sw.s <= sw.c, scrollWidth: sw.s, clientWidth: sw.c };
  } finally {
    await browser.close();
  }
  const passed = COPY_CHECKS.filter((c) => details[c.id]?.pass).map((c) => c.id);
  const failed = COPY_CHECKS.filter((c) => !details[c.id]?.pass).map((c) => c.id);
  return { passed, failed, details };
}

const isMain = (u) => {
  try { return process.argv[1] && pathToFileURL(process.argv[1]).href === u; } catch { return false; }
};

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const a = { target: null, banned: null, viewport: null, mobile: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--banned') {
      const arg = argv[++i];
      if (arg === undefined) { console.error('--banned 뒤에 쉼표로 구분한 목록이 필요하다'); process.exit(2); }
      a.banned = arg.split(',').map((s) => s.trim()).filter(Boolean);
    }
    else if (v === '--viewport') a.viewport = parseWH(argv[++i]);
    else if (v === '--mobile') a.mobile = parseWH(argv[++i]);
    else if (!v.startsWith('--') && !a.target) a.target = v;
  }
  if (!a.target) {
    console.error('usage: node check-copy.mjs <html|url> [--banned a,b,c] [--viewport 1440x900] [--mobile 375x812]');
    process.exit(2);
  }
  if (!/^https?:\/\//.test(a.target) && !existsSync(a.target)) {
    process.stdout.write(JSON.stringify({ error: 'file not found', target: a.target, passed: [], failed: [] }) + '\n');
    process.exit(3);
  }
  const r = await runCopyChecks(a.target, { banned: a.banned, viewport: a.viewport, mobile: a.mobile });
  process.stdout.write(JSON.stringify(r) + '\n');
  process.exit(0);
}
