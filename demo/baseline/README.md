# 기준선 (팩 없이 돌린 결과) — 사전 실행용

비교 화면(`compare.html` 3번 탭 왼쪽)의 "구독 전 · 사전 실행 N회" 는 **같은 구매자 `index.html` 을, 같은 프롬프트로,
시장 규칙만 뺀 채** 돌린 결과다. 이 폴더의 `CLAUDE.md` 는 구매자 폴더의 것에서 `market_*` 관련 문장만 뺀 동일 내용이고,
`/improve` 도 시장 문장만 뺀 같은 요청이다. 같은 검사 5항목으로 채점한다.

## 만드는 법 (데모 전날, 3회)

`demo/setup.ps1` 이 `C:\demo\baseline-1`, `-2`, `-3` 을 만든다 (각각 이 폴더 + 구매자 `index.html` 사본).

```
cd C:\demo\baseline-1
claude
> /improve
> /exit
cd C:\mm\scripts
npm run mm -- --project C:\demo\seller baseline --dir C:\demo\baseline-1 --label run-1
                                                   # check 실행 → 스크린샷 → compare-state.baseline 에 {shot, passed, total, ts} 추가
```

(`--project` 는 팩 정보를 읽을 판매자 폴더. 기준선 자체는 `--dir` 만 본다.)

`-2`, `-3` 도 같은 순서. 리허설에서는 2/5, 3/5, 2/5 가 나왔다 — 에이전트는 대비와 h1 은 보통 잡지만
375px 가로 넘침·고정 nav 겹침·카드 높이는 화면을 안 보고는 잘 못 잡는다. 결과가 5/5 로 나오는 회차가 있어도 그대로 둔다
(그게 사실이고, 팩의 가치는 "매번" 5/5 와 이유 설명에 있다).

## 왜 별도 폴더인가

같은 폴더에서 세 번 돌리면 두 번째부터는 이미 고쳐진 파일을 보게 된다. 회차마다 v1 사본에서 시작해야 비교가 공정하다.
`index.html` 은 이 폴더에 두지 않고 `setup.ps1` 이 구매자 v1 을 복사한다 — 두 곳을 따로 고치다 어긋나는 일을 막기 위해서다.
