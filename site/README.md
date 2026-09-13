# site/ — 랜딩 페이지

`index.html` 단일 파일 + `img/` 사진 두 장. 외부 CSS/JS/폰트 CDN 없음(system-ui 스택),
인라인 `<style>`/`<script>`만 쓴다. 빌드가 없어서 파일을 그대로 정적 호스팅에 올리면 된다.
**CSS·JS 를 별도 파일로 빼지 마라.** 배포되는 것은 `site/index.html` 과 `site/img/` 뿐이다.

카피 규칙은 `docs/glossary.md`, 수치와 사실은 `docs/ground-truth.md` 가 유일한 기준이다.

## 화면 구성 (목록)
1. 첫 화면 — 파는 쪽에게 말을 건다. 주 버튼도 파는 쪽(`#sec-sell`), 보조가 구경(`#sec-packs`).
   이미지·카드·숫자를 넣지 않는다. `check-copy.mjs` 의 `first-screen-jargon` 이 여기를 본다.
2. `#sec-slop` — `img/slop-before.jpg`(AI 가 뱉은 것) / `img/clean-after.jpg`(열 번 고친 것) 를 맞세운다.
   `0x02524aa2…` 기록을 가리킨다. 760px 아래에서는 위아래로 쌓인다.
3. `#sec-chat` — 말풍선 다섯 쌍(`0x75b2…` 기록), 잘라낸 전후 화면, 맺음 두 줄. 여기서 사는 쪽으로 넘어간다.
4. `#sec-skill` — 산 AI 가 읽는 파일 모양. 앞 두 줄만 선명하고 나머지는 가려져 있다.
5. `#sec-proof` — 실측 숫자 셋. **`0x75b2…` 기록 하나를 두고 잰 값이다.** 그 기록으로 가는 링크가 붙어 있다.
   시간·주고받은 횟수·AI 사용료로 비교한다. 점수(5/5 같은 것)를 쓰지 않는다.
6. `#sec-packs` — 체인에서 읽어온 목록. 개수도 읽어온 값으로 그린다(`#packcount`, 못 읽으면 숨김).
7. `#sec-sell` / 맨 아래 안내.

상세는 `location.hash` 가 `#/pack/0x…` 일 때. 뒤로가기·해시 직접 열기 모두 동작하고,
목록으로 돌아오면 스크롤 위치를 복원한다. 실측 표는 `STORY_ID` 상세에만 붙는다.

## 가려진 자리 (`.mask`)
아직 안 산 내용은 빗금 + 자물쇠로만 그린다. **`.mask` 안에는 글자를 한 자도 넣지 않는다.**
개발자 도구로 열어도 읽히면 안 된다. 확인: `[...document.querySelectorAll('.mask')].map(e=>e.textContent.trim()).join('|')` 가 빈 문자열이어야 한다.

## 데이터 (하드코딩 없음)
부팅할 때 두 번의 GraphQL 왕복으로 전부 읽는다. 이름·값·기간·기록 수·산 사람 수·미리보기는 전부 응답에서 온다.

- Sui GraphQL `https://graphql.testnet.sui.io/graphql` (CORS `*`). 공개 풀노드의 JSON-RPC 는 폐기됐다 — 브라우저에서는 GraphQL 만 쓴다.
  - 이벤트 한 번: `PackCreated` · `ReceiptLeft` · `Retracted` 를 alias 로 묶어 조회
  - 오브젝트 한 번: 위에서 얻은 `pack_id` 들을 alias 로 묶어 `object(address:…){asMoveObject{contents{json}}}`
  - 필드명은 `fee`(mist) · `ttl_ms` · `memory_count` · `subscriber_count` · `preview_blob_ids`. `fee / 1e9` 가 SUI.
  - 패키지: `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196`
- Walrus `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>` (CORS `*`)
  - **미리보기는 종류가 섞여 온다.** `preview_blob_ids[0]` 이 `mm.manifest/1` JSON 이면 manifest(brief·checks·steps·previews),
    아니면 평문 글로 갈라 렌더한다. 사진은 manifest 의 `previews.before/after` 에만 있다.
  - 사진이 없는 기록(`previews` 가 `null`)은 이미지 칸을 아예 만들지 않는다. 못 불러온 사진은 칸째로 지운다(`fillThumbs`).
  - 애그리게이터는 `content-type` 을 안 주고 `x-content-type-options: nosniff` 를 준다.
    2026-09-13 기준 로컬과 배포 주소 양쪽에서 `<img>` 가 정상으로 그려지는 것을 확인했다(`naturalWidth` 1280).
    이게 깨지면 `fetch` → `arrayBuffer` → 앞 바이트로 형식 판별 → `Blob` + `createObjectURL` 로 우회한다.
- `ttl_ms < 300000` 인 e2e 테스트용은 목록에서 숨긴다(`MIN_TTL`).
- 어느 쪽이든 실패하면 그 자리에 안내 문구 + 다시 불러오기 버튼이 뜬다. **가짜 예시 데이터로 채우지 않는다.**

코드 위쪽 상수만 바꾸면 다른 패키지/네트워크로 옮길 수 있다:
`GQL` · `PKG` · `AGG` · `SCAN` · `MIN_TTL` ·
`STORY_ID`(말풍선 다섯 쌍과 실측 표가 붙는 기록) · `SLOP_ID`(첫 화면 아래 전후 사진의 기록) ·
`FIRST`(목록 맨 앞에 세울 순서) · `LESSON_BY_SHA`(기록 지문 → 사람 말 요약) · `CHECK_KO`(검사 id → 사람 말) ·
`SAY`(판 사람이 쓴 말 중 뜻이 같은 쉬운 말로 바꿀 것).

## 경로 규칙 (배포본 기준)
`https://blockthon-th.github.io/my-project/` 로 배포되고 `site/index.html` 이 `/index.html`, `site/img/` 가 `/img/` 로 펼쳐진다.
- 사진은 `img/slop-before.jpg` 처럼 **맨 앞 `/` 없이** 건다. `/img/…` 는 저장소 이름이 경로에 끼어 404 가 난다.
- 비교 화면으로 가는 링크는 `compare.html`(`demo/compare.html` 이 `/compare.html` 로 올라간다). `../demo/…` 는 배포본에서 깨진다.
- 바깥으로 나가는 링크는 전체 주소로 쓴다. 저장소는 `https://github.com/Blockthon-th/my-project`.

## 로컬에서 열기
```powershell
node site/serve.mjs   # http://localhost:8788
```
상세 화면은 `http://localhost:8788/#/pack/0x02524aa2bf2f05a3cbd6a41ad0ba147f4de524956ff074f515e0b76fcd27387e` 처럼 해시를 직접 붙여도 열린다.
그냥 `start site/index.html` 로 파일을 열어도 동작한다(fetch 대상이 전부 외부 https 라 CORS 문제 없음).

`.preview/` 는 Playwright 로 찍은 검증 스크린샷이라 커밋하지 않는다(`.gitignore`).

## 고치고 나면 반드시
```powershell
node tools/check-copy.mjs site/index.html   # 6항목. first-screen-jargon 은 반드시 통과여야 한다
```
1280px 과 375px 두 폭에서 직접 띄워 보고, 콘솔 오류 0건 · 목록에 네 개 · 375px 가로 스크롤 없음 · `.mask` 글자 0자를 확인한다.
