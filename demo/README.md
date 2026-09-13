# demo/ — 디자인 과정 팩 3분 데모

시나리오·타임라인·대체 절차는 [docs/DEMO.md](../docs/DEMO.md). 여기는 폴더 지도만.

```
demo/
  seller/            판매자 템플릿 — Paylane(핀테크 송금) 랜딩 v1, 결함 5개. CLAUDE.md(step-note 규칙) + capture 훅 + .mm/config.json + SESSION-SCRIPT.md(5턴 대본)
  buyer/             구매자 템플릿 — 케어핏(헬스케어 예약) 랜딩 v1, 같은 결함 유형 5개. CLAUDE.md(market_find→acquire→적용→check→receipt) + .mcp.json + /improve
  baseline/          팩 없이 돌릴 때의 CLAUDE.md·/improve (시장 문장만 뺀 동일 내용). index.html 은 setup.ps1 이 buyer 것을 복사
  compare.html       심사용 근거 화면. 탭 3개(실측 / 판 사람이 남긴 것 / 사기 전·산 뒤).
                     탭 1 은 docs/ground-truth.md 의 실측 표를 박아넣은 고정 화면(걸린 시간·주고받은 횟수·AI 사용료).
                     탭 2·3 은 state/compare-state.json 을 읽고, 없으면 지어내지 않고 "없음" 을 그대로 보여준다
  state/             mm CLI 가 쓰는 compare-state.json + 스크린샷 (전부 실행 산출물 — 커밋 안 하고, 없으면 만들어진다). 형식은 scripts/demo-state.ts 의 CompareState
  serve.mjs          demo/ 를 http://localhost:8787 로 서빙 (file:// 로 열면 fetch 가 막혀 탭 2·3 이 "못 읽었어요" 로 뜬다)
  setup.ps1          템플릿을 C:\demo\{seller,buyer,baseline-1..3} 로 복사 (리허설마다 초기화)
  freeze-live.mjs    리허설의 live 결과를 fallback 으로 얼림 → 본 데모에서 R 키 대체 화면
```

## 30초 요약

```powershell
powershell -ExecutionPolicy Bypass -File C:\mm\demo\setup.ps1     # 폴더 준비
node C:\mm\demo\serve.mjs                                          # 발표 화면 서버
# 판매자: C:\demo\seller 에서 claude → SESSION-SCRIPT.md 의 5턴 → mm publish (전날)
# 구매자: C:\demo\buyer  에서 claude → /improve                      (무대 위)
```

`compare.html` 키: `1` `2` `3` 탭 · `R` 지금 값 ↔ 미리 돌려둔 값 · `F` 다시 읽기. (소개 슬라이드와 `←` `→` 는 없어졌다)

`compare.html` 은 **Paylane 기록(`0x75b2…`) 하나만** 다룬다. 실측 표가 그 기록의 실험이라, `state/compare-state.json` 도
같은 기록으로 통일해야 한다: `npm run mm -- --project C:/demo/seller state --pack 0x75b25d24…8f5196` 식으로 다시 만든다.
다른 기록의 값을 섞어 넣지 않는다.

## 파일 규약 (다른 구성요소가 의존)

- `compare.html` 탭 2·3 은 `./state/compare-state.json` 을 4초마다 다시 읽는다 (탭 1 은 이 파일과 무관한 고정 실측값). `thumb` / `shot` 은 **`demo/` 기준 상대경로** — `mm state` / `mm baseline` / `market_receipt` 는 `state/step-1.jpg`, `state/baseline-1.jpg`, `state/live.jpg` 로 쓴다. 접두사 없는 `live.jpg` 는 `state/live.jpg` 로 해석되고 `data:` URI 도 받는다.
- 선택 필드 `fallback`: `live` 와 같은 모양 (`node demo/freeze-live.mjs` 가 만든다). `R` 키를 누르면 오른쪽 패널이 `fallback` 으로 바뀌고 "사전 실행" 라벨이 붙는다. `live` 가 `null` 이고 `fallback` 이 있으면 처음부터 fallback 을 "사전 실행" 으로 보여준다. `mm state` 는 모르는 키를 보존하므로 fallback 은 갱신에도 남는다.
- 판매자 훅 명령은 `node C:/mm/tools/capture.mjs prompt|tool|stop` (UserPromptSubmit / PostToolUse(Edit|Write|MultiEdit) / Stop). Stop 훅 timeout 은 120초 (capture 의 예산 110초보다 길게).
- 구매자 에이전트가 남기는 증거는 `evidence.json` (`mm.evidence/1`: pack_id, ts, check{passed,failed}, applied[{step,selector}]). `market_receipt` 가 이 파일로 compare-state 의 `live` 칸을 채우고, 증거 파일 옆의 `index.html` 을 찍어 `state/live.jpg` 도 넣는다. 채워지지 않았을 때만 `mm state --live C:\demo\buyer --evidence C:\demo\buyer\evidence.json` 으로 보충한다.
