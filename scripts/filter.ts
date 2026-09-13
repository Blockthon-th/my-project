/**
 * 판매 전 개인정보 필터.
 *
 * 해커톤 범위: **개인정보 제거만** 한다. 기밀·규제(미공개 정보 등) 판단은 향후 과제.
 * 판단 근거를 남기기 위해 "제거"가 아니라 "가림(redact)" 과 "제외(drop)" 를 구분한다.
 *  - redact: 값만 가리고 문장은 판다 (경로, 이메일, 주소 등)
 *  - drop  : 문장 전체를 팔지 않는다 (비밀키, 복구 문구 등, 가려도 위험)
 */
import type { Memory } from './memories.js';

export interface FilterResult {
  kept: Memory[];
  dropped: { text: string; reason: string }[];
  redactions: number;
}

/** 가려도 팔면 안 되는 것, 문장째 제외 */
const DROP_RULES: { re: RegExp; reason: string }[] = [
  { re: /suiprivkey1[a-z0-9]{10,}/i, reason: 'Sui 비밀키' },
  // 라벨 뒤에 값이 오는 형태
  {
    re: /(?:private[_ -]?key|secret[_ -]?key|mnemonic|recovery\s*phrase|복구\s*문구|비밀키|시드\s*구문)\s*[:=]\s*\S/i,
    reason: '비밀키/시드 표기',
  },
  // 12~24개의 짧은 영단어만 연달아 = 니모닉 형태 (문장부호가 없어야 함)
  { re: /^[a-z]{3,8}(?: [a-z]{3,8}){11,23}$/i, reason: '니모닉 형태' },
  { re: /\b(?:sk|pk)-[A-Za-z0-9_-]{20,}\b/, reason: 'API 키 형태' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, reason: 'GitHub 토큰' },
];

/**
 * 0x… 객체 ID·주소는 가리지 않는다.
 * 온체인 공개 데이터이고, "이 키 서버 객체 ID를 쓰라" 같은 기억은 그 값이 있어야 쓸모가 있다.
 * 지갑 주소도 공개 원장에 이미 있으므로 개인정보로 보지 않는다.
 */

/** 값만 가리면 되는 것 */
const REDACT_RULES: { re: RegExp; to: string }[] = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/g, to: '<email>' },
  { re: /\b(?:\+?\d{1,3}[- ]?)?\d{2,4}[- ]\d{3,4}[- ]\d{4}\b/g, to: '<phone>' },
  // Windows/유닉스 사용자 경로 → 사용자명 제거
  { re: /([A-Za-z]:\\Users\\)[^\\\s]+/g, to: '$1<user>' },
  { re: /(\/(?:home|Users)\/)[^/\s]+/g, to: '$1<user>' },
  // URL 의 토큰/키 쿼리
  { re: /([?&](?:token|key|api[_-]?key)=)[^&\s]+/gi, to: '$1<redacted>' },
];

export function filterMemories(memories: Memory[]): FilterResult {
  const kept: Memory[] = [];
  const dropped: { text: string; reason: string }[] = [];
  let redactions = 0;

  for (const m of memories) {
    const hit = DROP_RULES.find((r) => r.re.test(m.text));
    if (hit) {
      dropped.push({ text: m.text.slice(0, 80), reason: hit.reason });
      continue;
    }
    let text = m.text;
    for (const r of REDACT_RULES) {
      // 콜백을 쓰면 `$1` 그룹 복원이 안 되므로, 개수는 따로 세고 치환은 문자열 패턴으로 한다
      const matches = text.match(r.re);
      if (matches) redactions += matches.length;
      text = text.replace(r.re, r.to);
    }
    kept.push({ ...m, text });
  }
  return { kept, dropped, redactions };
}
