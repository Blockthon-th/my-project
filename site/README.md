# site/: 랜딩 페이지

`index.html` 단일 파일 + `img/` 사진 두 장. 외부 CSS/JS/폰트 CDN 없음(system-ui 스택),
인라인 `<style>`/`<script>`만 쓴다. 빌드가 없어서 파일을 그대로 정적 호스팅에 올리면 된다.
**CSS·JS 를 별도 파일로 빼지 마라.** 배포되는 것은 `site/index.html` 과 `site/img/` 뿐이다.

카피 규칙은 `README 의 말투 기준`, 수치와 사실은 `README 의 기록 표` 가 유일한 기준이다.

## 화면 구성 (칸 넷)
문장 규칙은 `README 의 말투 기준` 를 따른다. 여기는 구조만 적는다.

1. **첫 화면** (`section.hero`), 파는 쪽에게 말을 건다. 라벨 · 돌아가는 제목 · 한 문장 · 버튼 하나.
   상단 바가 이 칸 안에 있고 `position:relative` 라 스크롤을 안 따라온다(`nav-overlap` 이 구조로 통과한다).
   **`min-height:100svh` 라 아래 칸이 접힘선 위로 못 올라온다.** 화면이 아무리 커도 `first-screen-jargon` 이 안 깨진다.
   여기에 숫자·값·사진을 넣지 않는다.
2. `#sec-list`, 체인에서 읽어온 목록. 카드가 아니라 `64px + 1fr` 번호 줄 넷이다.
   이름과 한 줄 설명만 `OURNAME` 에서 오고 개수·값·기간·산 사람 수는 전부 응답에서 온다.
   01 줄 밑에만 `img/slop-before.jpg` / `img/clean-after.jpg` 두 장이 붙는다(`SLOP_ID` 기록의 내용이라서).
   칸 맨 아래에 SUI 를 처음 풀어 쓰는 한 줄이 있다. **이 문장을 위로 올리면 첫 화면 검사가 깨진다.**
3. `#sec-inside` (어두운 칸), `STORY_ID` 기록 안. 지적한 말과 알게 된 것 세 쌍, 가려진 줄 하나,
   실측 두 칸(시간 · 주고받은 횟수 · AI 사용료). 점수를 쓰지 않는다.
   실측 두 칸은 나란한 격자 자식이라 키가 저절로 같아진다. **한 칸만 따로 감싸면 `card-height` 가 깨진다.**
4. `#sec-sell` (회색 칸), 파는 쪽 진입로. 설치 두 줄이 여기뿐이다.
5. 맨 아래 (`div.bottom`), Sui · Walrus · Seal 을 각각 한 번 쓸 수 있는 유일한 칸(`README 의 말투 기준`).

돌아가는 제목은 `.slot` 폭을 제일 긴 말 기준 `10.1em` 으로 못 박고 `clip-path` 로 가로로 닦아 갈아끼운다.
**세로로 밀면 안 된다.** `tools/check.mjs` 의 `h1-lines` 가 그 순간 세 줄로 세어 검사가 깨진다.
960px 아래에서는 "당신의" 가 따로 떨어져 세 줄로 못 박힌다. 돌아가는 말에 `tools/check-copy.mjs` 의
금지어가 하나라도 들어가면 검사를 돌리는 순간에 무슨 말이 떠 있느냐로 통과가 갈려버린다.

상세는 `location.hash` 가 `#/pack/0x…` 일 때. 뒤로가기·해시 직접 열기 모두 동작하고,
목록으로 돌아오면 스크롤 위치를 복원한다. 실측 표는 `STORY_ID` 상세에만 붙는다.
**상세도 목록과 같은 색·같은 글자 크기·같은 번호 줄을 쓴다.** 한쪽만 고치면 이음매가 보인다.
판 사람이 체인에 적어둔 이름과 설명은 상세에서 고치지 않고 그대로 보여준다.

## 가려진 자리 (`.mask`)
아직 안 산 내용은 빗금 + 자물쇠로만 그린다. **`.mask` 안에는 글자를 한 자도 넣지 않는다.**
개발자 도구로 열어도 읽히면 안 된다. 확인: `[...document.querySelectorAll('.mask')].map(e=>e.textContent.trim()).join('|')` 가 빈 문자열이어야 한다.

## 데이터 (하드코딩 없음)
부팅할 때 두 번의 GraphQL 왕복으로 전부 읽는다. 값·기간·기록 수·산 사람 수·미리보기는 전부 응답에서 온다.
목록 화면에 쓰는 이름과 한 줄 설명만 `OURNAME` 에서 오고(사는 사람이 알아보게 우리가 붙인 것),
그 표에 없는 기록이 새로 올라오면 판 사람이 적은 이름·설명을 그대로 쓴다.
판 사람이 체인에 적어둔 이름과 설명은 **상세 화면에 고치지 않고 그대로** 나온다.

- Sui GraphQL `https://graphql.testnet.sui.io/graphql` (CORS `*`). 공개 풀노드의 JSON-RPC 는 폐기됐다, 브라우저에서는 GraphQL 만 쓴다.
  - 이벤트 한 번: `PackCreated` · `ReceiptLeft` · `Retracted` 를 alias 로 묶어 조회
  - 오브젝트 한 번: 위에서 얻은 `pack_id` 들을 alias 로 묶어 `object(address:…){asMoveObject{contents{json}}}`
  - 필드명은 `fee`(mist) · `ttl_ms` · `memory_count` · `subscriber_count` · `preview_blob_ids`. `fee / 1e9` 가 SUI.
  - 패키지: `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196`
- Walrus `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>` (CORS `*`)
  - **미리보기는 종류가 섞여 온다.** `preview_blob_ids[0]` 이 `mm.manifest/1` JSON 이면 `preview.kind = 'sheet'`
    (brief·checks·steps·previews), 아니면 평문 글로 갈라 렌더한다. 사진은 그 JSON 의 `previews.before/after` 에만 있다.
  - 사진이 없는 기록(`previews` 가 `null`)은 이미지 칸을 아예 만들지 않는다. 못 불러온 사진은 칸째로 지운다(`fillShots`).
  - 애그리게이터는 `content-type` 을 안 주고 `x-content-type-options: nosniff` 를 준다.
    2026-09-13 기준 로컬과 배포 주소 양쪽에서 `<img>` 가 정상으로 그려지는 것을 확인했다(`naturalWidth` 1280).
    이게 깨지면 `fetch` → `arrayBuffer` → 앞 바이트로 형식 판별 → `Blob` + `createObjectURL` 로 우회한다.
- `ttl_ms < 300000` 인 e2e 테스트용은 목록에서 숨긴다(`MIN_TTL`).
- 어느 쪽이든 실패하면 그 자리에 안내 문구 + 다시 불러오기 버튼이 뜬다. **가짜 예시 데이터로 채우지 않는다.**

코드 위쪽 상수만 바꾸면 다른 패키지/네트워크로 옮길 수 있다:
`GQL` · `PKG` · `AGG` · `SCAN` · `MIN_TTL` ·
`STORY_ID`(지적 세 쌍과 실측 두 칸이 붙는 기록) · `SLOP_ID`(목록 01 줄에 화면 두 장이 붙는 기록) ·
`FIRST`(목록 맨 앞에 세울 순서) · `OURNAME`(기록 주소 → 화면에 쓸 이름과 한 줄 설명) ·
`LESSON_BY_SHA`(기록 지문 → 사람 말 요약) · `CHECK_KO`(검사 id → 사람 말) ·
`SAY`(판 사람이 쓴 말 중 뜻이 같은 쉬운 말로 바꿀 것. 상세 화면의 항목 제목에 쓴다).

## 경로 규칙 (배포본 기준)
`https://blockthon-th.github.io/my-project/` 로 배포되고 `site/index.html` 이 `/index.html`, `site/img/` 가 `/img/` 로 펼쳐진다.
- 사진은 `img/slop-before.jpg` 처럼 **맨 앞 `/` 없이** 건다. `/img/…` 는 저장소 이름이 경로에 끼어 404 가 난다.
- 바깥으로 나가는 링크는 전체 주소로 쓴다. 저장소는 `https://github.com/Blockthon-th/my-project`.

## 로컬에서 열기
```powershell
node site/serve.mjs   # http://localhost:8788
```
상세 화면은 `http://localhost:8788/#/pack/0xef238e432a6f24cd3118088b237ba2122ed39813bec649c39d70e38b9f2a813d` 처럼 해시를 직접 붙여도 열린다.
그냥 `start site/index.html` 로 파일을 열어도 동작한다(fetch 대상이 전부 외부 https 라 CORS 문제 없음).

`.preview/` 는 Playwright 로 찍은 검증 스크린샷이라 커밋하지 않는다(`.gitignore`).

## 고치고 나면 반드시
```powershell
node tools/check-copy.mjs site/index.html   # 6항목. first-screen-jargon 은 반드시 통과여야 한다
node tools/check.mjs site/index.html        # 5항목
node tools/consistency.mjs                  # 어긋남 0건
```
1280px 과 375px 두 폭에서 직접 띄워 보고, 콘솔 오류 0건 · 목록에 네 개 · 375px 가로 스크롤 없음 ·
`.mask` 글자 0자 · 돌아가는 말 열 개가 전부 같은 줄 수인지를 확인한다.
2026-09-13 실측: 1280px 에서 문서 높이 3,680px, 375px 에서 5,473px.
