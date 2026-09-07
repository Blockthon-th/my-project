# 케어핏 랜딩 (기준선 세션 — 팩 없음)

헬스케어 예약 앱 "케어핏" 의 랜딩 `index.html` 하나가 있다.

## 디자인 요청을 받으면
1. 파일을 읽고 눈에 띄는 품질 문제를 스스로 찾아 고친다.
2. 수정이 끝나면 `node C:/mm/tools/check.mjs index.html > check-result.json` 을 실행하고 `passed` / `failed` 를 한 줄로 보고한다.
   `failed` 가 남아 있으면 고치고 다시 검사한다 (최대 2회).

## 수정 규칙
- 파일을 통째로 다시 쓰지 말고(`Write` 금지), 해당 선택자의 규칙만 `Edit` 한다. 섹션 구성·카피 톤·브랜드색(초록 계열)은 유지한다.
- 외부 폰트·CDN·이미지를 추가하지 않는다. 파일 하나로 열려야 한다.
- 검사 5항목이 곧 이 작업의 완료 기준이다: `cta-contrast` `h1-lines` `no-hscroll` `card-height` `nav-overlap`.

## 하지 말 것
- `check-result.json` 을 고치지 않는다.
