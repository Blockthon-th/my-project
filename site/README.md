# site/ — 랜딩 페이지

`index.html` 단일 파일. 외부 CSS/JS/폰트 CDN 없음(system-ui 스택), 인라인 `<style>`/`<script>`만 쓴다.
빌드 단계가 없어서 파일 하나를 그대로 정적 호스팅에 올리면 된다.

## 화면 구성
- 목록(기본) — 첫 화면 / 스크롤 대화 다섯 쌍 / 실측 숫자 / 지금 올라와 있는 묶음 / 파는 쪽 / 맨 아래 안내
- 상세 — `location.hash` 가 `#/pack/0x…` 일 때. 뒤로가기·해시 직접 열기 모두 동작하고, 목록으로 돌아오면 스크롤 위치를 복원한다.

## 데이터 (하드코딩 없음)
부팅할 때 두 번의 GraphQL 왕복으로 전부 읽는다. 화면에 보이는 이름·값·기간·기록 수·구매자 수·미리보기는 전부 응답에서 온다.

- Sui GraphQL `https://graphql.testnet.sui.io/graphql` (CORS `*`)
  - 이벤트 한 번: `PackCreated` · `ReceiptLeft` · `Retracted` 를 alias 로 묶어 조회
  - 오브젝트 한 번: 위에서 얻은 `pack_id` 들을 alias 로 묶어 `object(address:…){asMoveObject{contents{json}}}`
  - 패키지: `0x50cd511c24786aa091e26a46d5c66ec32308ceb6379902eaf1045d99548f5196`
- Walrus `https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blobId>` (CORS `*`)
  - `preview_blob_ids[0]` 이 `mm.manifest/1` JSON 이면 manifest(brief·checks·steps·previews)로, 아니면 평문 묶음으로 갈라 렌더한다.
  - 이미지 blob 에는 content-type 헤더가 없지만 브라우저가 스니핑해서 렌더한다.
- `ttl_ms < 300000` 인 e2e 테스트 팩은 목록에서 숨긴다(`MIN_TTL`).
- 두 소스 중 하나라도 실패하면 해당 블록에 안내 문구 + 다시 불러오기 버튼이 뜬다.

코드 위쪽 상수만 바꾸면 다른 패키지/네트워크로 옮길 수 있다: `GQL` · `PKG` · `AGG` · `SCAN` · `MIN_TTL` · `STORY_PACK`(2번 섹션 대화와 3번 실측 표가 붙는 묶음) · `LESSON_BY_SHA`(체인 기록 지문 → 사람 말 요약) · `CHECK_KO`(검사 항목 id → 사람 말).

## 로컬에서 열기
```powershell
# 그냥 파일로 열어도 동작한다 (fetch 대상이 전부 외부 https 라 CORS 문제 없음)
start site/index.html

# 정적 서버로 보고 싶으면
npx --yes serve site
# 또는
python -m http.server 4599 --directory site
```
상세 화면은 `http://localhost:4599/#/pack/0x75b25d24377a92fd976d7690ed73b7b31496c5c4d3b13c96720cf00222cfcb1d` 처럼 해시를 직접 붙여도 열린다.

`.preview/` 는 Playwright 로 찍은 검증 스크린샷이라 커밋하지 않는다(`.gitignore`).

## Walrus Sites 배포 (이 PC 에는 site-builder 가 없다 — 설치부터 필요)
1. site-builder 설치 (testnet 바이너리)
   ```powershell
   # https://docs.wal.app/walrus-sites/tutorial-install.html 의 최신 링크를 확인하고 받는다
   curl -L -o site-builder.exe https://storage.googleapis.com/mysten-walrus-binaries/site-builder-testnet-latest-windows-x86_64.exe
   curl -L -o sites-config.yaml https://raw.githubusercontent.com/MystenLabs/walrus-sites/refs/heads/main/sites-config.yaml
   ```
2. 지갑 준비 — `sui client active-address` 가 testnet 주소를 가리키고, 가스(SUI)와 저장 비용(WAL)이 들어 있어야 한다.
3. 게시
   ```powershell
   ./site-builder.exe --config sites-config.yaml publish ./site --epochs 5
   ```
   출력에 나오는 오브젝트 ID 가 이 사이트다. 이후 수정은 같은 ID 에 `update` 로 올린다.
   ```powershell
   ./site-builder.exe --config sites-config.yaml update ./site <SITE_OBJECT_ID> --epochs 5
   ```
4. 주소 — 출력된 Base36 서브도메인을 `https://<base36>.wal.app` 로 연다. 사람이 읽는 이름을 붙이려면 SuiNS 이름을 사서 이 오브젝트에 연결한다.

배포는 아직 하지 않았다. 위 절차는 실행 전 기록이다.
