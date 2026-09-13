# 판매자 세션 대본: Paylane 랜딩 5턴

데모 **전날** 이 폴더(저장소 밖으로 복사한 사본, 예: `C:\demo\seller`)에서 Claude Code 를 열고
아래 5개 프롬프트를 **순서대로, 한 턴에 하나씩** 던진다. 각 턴은 결함 하나를 고치게 하는 문장이고,
훅이 턴마다 단계(step-N)를 기록한다. 5턴이 끝나면 `mm review` 로 확인하고 `mm publish` 로 팩을 만든다.

시작 전 확인:
```
node C:/mm/tools/check.mjs index.html      # failed 에 5개 전부 있어야 정상 (v1 은 일부러 결함 5개)
cd C:\mm\scripts
npm run mm -- --project C:\demo\seller init   # 선택, 훅은 .mm/config.json(템플릿에 있음)만 있으면 동작한다. init 은 기존 config 를 보존한다
```
`mm` 은 `.mm/` 이 있는 폴더를 `--project` 로 받는다 (없으면 `npm run` 을 실행한 폴더 = INIT_CWD). 아래 명령은 전부 `C:\mm\scripts` 에서 `--project C:\demo\seller` 를 붙인 형태다.

| 턴 | 고칠 결함 (check id) | Claude Code 에 던질 프롬프트 |
|---|---|---|
| 1 | `cta-contrast` | 버튼이 그라데이션에 묻혀 안 보여. 나머지 레이아웃은 승인. **버튼 대비만** 고쳐. |
| 2 | `h1-lines` | 제목이 세 줄로 떨어져서 답답해. 1280px 에서 **두 줄 안에** 들어오게 카피를 줄이든 크기를 조정하든 해. 히어로의 다른 건 그대로. |
| 3 | `no-hscroll` | 폰(375px)에서 보면 옆으로 스크롤돼. 지원 국가 줄이 범인 같아. **가로 스크롤만** 없애고 데스크톱 모양은 유지해. |
| 4 | `card-height` | 요금제 카드 세 장 높이가 제각각이야. **같은 높이로** 맞추고 버튼은 카드 바닥에 붙여. 카드 내용은 바꾸지 마. |
| 5 | `nav-overlap` | 상단 고정 메뉴가 첫 문장을 가려. 메뉴는 그대로 두고 **겹침만** 해결해. |

각 턴이 끝나면 답변 끝에 ```step-note``` 블록이 있는지 확인한다. 없으면 "step-note 블록 남겨" 라고 한 번 더 말한다
(그 턴은 파일을 안 고쳤으므로 새 단계로 기록되지 않고, 훅이 직전 단계의 note 를 보완한다, 안 되면 `mm review` 에서 손으로 채운다).

## 기대하는 단계 기록 (좋은 예)

| step | intent | target | why (요지) | lesson (요지) |
|---|---|---|---|---|
| 1 | fix | `.hero .btn-primary` | 반투명 배경 위 흰 글자, 대비 2.5:1 → 불투명 `#0b1020` 배경으로 15:1 | 그라데이션 히어로의 주 CTA 는 glass 스타일 금지, 불투명 단색 |
| 2 | fix | `.hero h1`, `.hero .copy` | 56px·640px 컨테이너에서 37자가 3줄 → 카피 22자로 줄이고 컨테이너 720px | 한글 h1 은 (컨테이너 폭 ÷ font-size) × 2 자 이내로 카피를 잡는다 |
| 3 | fix | `.countries` | `min-width:1040px` 가 375px 에서 넘침 → `flex-wrap:wrap`, min-width 제거 | 가로 나열 칩은 `min-width` 대신 `flex-wrap` + `overflow-x:auto` 중 하나를 반드시 둔다 |
| 4 | fix | `.plans`, `.plan`, `.plan .cta` | `align-items:start` 로 381/534/419px → stretch + flex-column + `margin-top:auto` | 가격 카드는 grid `align-items:stretch` 기본값을 건드리지 말고 CTA 를 `margin-top:auto` 로 바닥에 |
| 5 | fix | `.hero` | fixed nav 72px 가 eyebrow(y=24) 를 덮음 → `padding-top: 112px` | fixed nav 를 쓰면 첫 섹션 `padding-top` ≥ nav 높이 + 32px |

## 5턴 뒤

```
node C:/mm/tools/check.mjs index.html               # passed 5 / failed 0 이어야 함
cd C:\mm\scripts
npm run mm -- --project C:\demo\seller review        # 단계 5개, record_hash 체인, 스크린샷 확인. lesson 이 비면 --step N --lesson ".." 로 보충
npm run mm -- --project C:\demo\seller publish --new --fee 0.05 --ttl 7d --label claude-code
                                                      # 팩 생성(이름은 .mm/config.json 의 name) + Seal 암호화 + Walrus + publish×5 + manifest add_preview
npm run mm -- --project C:\demo\seller state         # demo/state/compare-state.json 의 filmstrip 갱신 (publish 가 이미 한 번 한다)
```

`--label` 은 팩의 agent_label(출처 이력), 팩 이름은 `--name` 또는 config 의 `name`. `publish` 가 출력한 pack id 를 `docs/DEMO.md` 의 준비 체크리스트에 적어 둔다 (Suiscan 링크용).
필름스트립 카드의 위 줄(결함)은 그 턴의 **첫 프롬프트**, 아래 줄(교정)은 **lesson** 이다, lesson 이 없으면 why 가 대신 들어가므로 step-note 의 lesson 을 꼭 채운다.

## 되돌림 턴을 넣고 싶으면 (선택)

3턴 뒤에 "아니 지원 국가는 한 줄로 흐르는 게 맞았어. 가로 스크롤은 그 줄 안에서만 되게 해" 라고 던지면
`intent: "revert"`, `verdict: "rejected"` 단계가 하나 더 생긴다. 구매자 쪽 플레이북에는 "wrap 은 거절됨, overflow-x:auto 가 정답" 으로 전달된다.
데모 시간이 빠듯하면 생략.
