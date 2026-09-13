# demo/

기록을 다시 만들고 실측 실험을 재현할 때 쓰는 템플릿이다. 발표용 비교 화면(compare.html)은 뺐다. 발표 때는 공개 랜딩(https://blockthon-th.github.io/my-project/)을 그대로 띄운다.

```
seller/      판 사람 쪽 Claude Code 프로젝트 템플릿. 훅이 턴마다 .mm/steps/ 에 기록을 남긴다. SESSION-SCRIPT.md 가 다섯 번 고친 대본.
buyer/       산 사람 쪽 템플릿. .mcp.json 으로 시장 도구 7개가 붙고, /improve 한 번이면 알아서 사서 적용한다.
baseline/    기록 없이 같은 일을 시키는 대조군 템플릿. 검사 도구 없이 돌린다.
setup.ps1    위 셋을 C:\demo\ 아래에 펼친다. C:\mm 정션은 미리 mklink /J C:\mm <저장소 경로> 로 만들어 둔다.
state/       mm CLI 가 쓰는 실행 산출물 (커밋하지 않는다).
```

순서와 명령은 [docs/DEMO.md](../docs/DEMO.md) 에 있다.
