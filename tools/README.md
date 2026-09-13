# tools/: 디자인 세션 포집 도구 (mm.step/1)

판매자가 Claude Code 로 `index.html` 을 고치는 동안, 훅이 턴마다 **(프롬프트, diff, 스크린샷, 왜 고쳤는지, 교훈)** 을
한 "단계(step)" 로 자동 기록한다. 기록은 `.mm/steps/step-N.json` (스키마 `mm.step/1`) 이고,
`scripts/mm.ts` 의 `mm publish` 가 이것을 Seal 로 잠가 Walrus 에 올린다.

전부 ESM `.mjs`, Node 22, 의존성은 `playwright`(chromium) 와 `diff` 뿐. LLM 호출 없음, 네트워크 없음.

| 파일 | 역할 |
|---|---|
| `capture.mjs` | Claude Code 훅 본체. `prompt` / `tool` / `stop` 세 이벤트 |
| `check.mjs` | 5항목 디자인 검사 → `{passed, failed, details}` |
| `check-copy.mjs` | 6항목 한국어 랜딩 카피 검사 → `{passed, failed, details}` |
| `shot.mjs` | Playwright 로 1280x800 · 375x812 JPEG 스크린샷 |
| `lib.mjs` | `sha256` / `canonicalJson` / `recordHash` / `genesisHash` 등 공용 (scripts 에서 import 가능) |
| `selftest.mjs` | 네트워크·Claude 없이 전 과정 검증. 통과하면 `SELFTEST OK` |
| `first-edit.mjs` | PostToolUse 훅. 첫 편집 직후의 `index.html` 을 `.first-edit.html` 로 한 번만 보존(기준선 비교용) |

## 설치

```powershell
cd C:\mm\tools
npm install                      # playwright, diff
npx playwright install chromium  # chromium 이 없다는 오류가 나면
node selftest.mjs                # SELFTEST OK 가 나와야 한다
```

## 훅 등록

판매자 프로젝트 폴더의 `.claude/settings.json` (또는 `settings.local.json`). 경로는 한글이 없는 정션 `C:\mm` 을 쓴다.
JSON 안에서는 백슬래시를 두 번 쓴다 (`C:/mm/tools/capture.mjs` 처럼 슬래시를 써도 된다).

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node C:\\mm\\tools\\capture.mjs prompt", "timeout": 60 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|MultiEdit|Write",
        "hooks": [ { "type": "command", "command": "node C:\\mm\\tools\\capture.mjs tool", "timeout": 60 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node C:\\mm\\tools\\capture.mjs stop", "timeout": 120 } ] }
    ]
  }
}
```

훅은 **세션 폴더에 `.mm/config.json` 이 있을 때만** 동작한다. 세션 폴더는 `CLAUDE_PROJECT_DIR`(Claude Code 가 세션을 시작한 프로젝트 루트) → 훅 입력의 `cwd` → 프로세스 cwd 순으로 `.mm/config.json` 이 있는 첫 폴더다, 훅 입력 `cwd` 는 모델이 Bash 로 `cd` 하면 따라 바뀌므로(Claude Code 문서) 그것만 믿지 않는다. 어디에도 없으면 아무 일도 하지 않고 0 으로 끝난다.
그래서 전역(`~/.claude/settings.json`)에 등록해 두어도 mm 세션이 아닌 폴더에는 영향이 없다.

`.mm/config.json` (`mm init` 이 만든다; 손으로 만들어도 된다):

```json
{
  "entry": "index.html",
  "viewport": [1280, 800],
  "mobile": [375, 812],
  "series_id": "lumen-landing-2026-09",
  "pack_id": null,
  "cap_id": null,
  "checks": ["cta-contrast", "h1-lines", "no-hscroll", "card-height", "nav-overlap"],
  "git": true
}
```

- `domain` 을 주지 않으면 `design.web`. `checks` 를 비우거나 빼면 5항목 전부. `git:false` 또는 환경변수 `MM_NO_GIT=1` 이면 자동 커밋 안 함.

## 동작 (capture.mjs)

| 이벤트 | 하는 일 |
|---|---|
| `prompt` (UserPromptSubmit) | `pending.prompts` 에 누적. 아직 단계가 없고 entry 가 이미 있으면 `steps/step-0.html` 로 기준선을 떠 두고 `last_hash` 를 잡는다(첫 diff 가 "빈 파일 → 전체" 가 되지 않게). |
| `tool` (PostToolUse) | `Edit`/`MultiEdit` → `edit_mode: targeted`, 기존 파일에 `Write` → `rewrite`(한 턴에 둘 다면 rewrite). `touched` 에 cwd 기준 상대 경로 추가. 새 파일 `Write`(`tool_response.type === "create"`) 는 모드를 정하지 않는다. `Bash` 로 entry 를 리다이렉트한 경우도 touched 에는 넣는다(best effort). |
| `stop` (Stop) | **분절 규칙**: entry 의 sha256 이 `state.last_hash` 와 같거나 `touched` 가 비면 pending 을 폐기하고 끝. 아니면 step-N 기록(아래). |

`stop` 에서 step-N 을 기록하는 순서:

1. `steps/step-N.html` 복사
2. `steps/step-(N-1).html`(없으면 빈 문자열)과 unified diff (`diff` 패키지, 8KB 로 절단, 문맥 2줄)
3. 이번 턴의 assistant 텍스트를 구한다. **Stop 입력의 `last_assistant_message` 를 우선**한다(Claude Code 문서: transcript 파일은 비동기로 써져서 Stop 시점에 이번 턴의 마지막 메시지가 아직 없을 수 있다). 그것이 없거나 비면 `transcript_path` JSONL 에서 **마지막 사람 프롬프트 이후** assistant 텍스트를 모은다. `model`/`tool.version` 은 항상 transcript 에서. `tool_result` 가 든 user 메시지, `isMeta`, `isSidechain` 은 사람 프롬프트가 아니다.
   - assistant 텍스트에 ` ```step-note ` 펜스의 JSON `{intent,target,why,lesson,verdict}` 이 있으면 우선(마지막 유효 블록). `target` 은 기록하지 않는다.
   - 없으면 `why` = 마지막 문단, `lesson = null`, `verdict = null`, `intent` 는 규칙 분류: 첫 단계 `init` / "되돌려·원래대로·revert·undo·롤백" `revert` / "다듬·정리·polish·tidy·clean up·refine" `polish` / 그 외 `fix`.
   - `model` 은 마지막 assistant 메시지의 `message.model`, `tool.version` 은 transcript 줄의 `version`.
4. `check.mjs` 의 `shootAndCheck()` 로 브라우저 1회 기동·페이지 로드 2회(데스크톱·모바일)에 스크린샷 `step-N.jpg`(1280x800) · `step-N.m.jpg`(375x812) 와 검사 5항목을 함께. 스크린샷이 실패하면 `null`, 검사가 실패하면 `null`. 검사 상세는 `step-N.check.json` 에 따로 둔다(기록에는 `{passed, failed}` 만).
5. `step-N.json` 조립, `record_hash`/`prev_hash` 계산, `state.json` 갱신, `pending.json` 초기화
6. git 저장소면 `git add -A -- . && git commit -q -m "mm step N" -- .`
7. stdout 에 `{"systemMessage":"[mm] step N captured · targeted +6/-2 · shot ok · check 3/5"}` 한 줄

모든 예외는 잡아서 `.mm/capture.log` 에 남기고 **항상 exit 0**. 훅 전체 예산은 `MM_HOOK_BUDGET_MS`(기본 110초, Stop 훅 timeout 120초보다 짧게) 이고 그 안에서 브라우저 작업에 10~60초를 준다.
한가한 머신에서 stop 한 번은 3~5초; CPU 가 포화된 머신에서는 chromium 기동만 수십 초 걸릴 수 있다(`.mm/capture.log` 의 `visuals N.Ns` 로 확인).

### 파일 배치 (`.mm/`)

```
.mm/config.json     { entry, viewport, mobile, series_id, pack_id?, cap_id?, checks, git? }
.mm/pending.json    { prompts:[], touched:[], edit_mode }          ← 턴 중 누적, stop 에서 비움
.mm/state.json      { step, last_hash, prev_record_hash, published:{step:blobId} }   ← published 는 mm publish 가 쓴다(보존)
.mm/steps/step-0.html                     기준선(entry 가 먼저 있던 경우만)
.mm/steps/step-N.html .json .jpg .m.jpg .check.json
.mm/capture.log
```

### 기록 스키마 `mm.step/1` 과 해시 규칙

```
{ schema:"mm.step/1", pack_id, series_id, step, ts, domain, tool:{name:"claude-code",version}, model,
  prompts:[], intent, edit_mode, files_touched:[], diff(≤8KB), html_full(≤40KB)|null, html_sha256,
  screenshot:{mime,w,h,sha256,b64}|null, screenshot_mobile:{w,h,sha256,b64}|null,
  check:{passed,failed}|null, why, lesson|null, verdict|null, prev_hash, record_hash }
```

- `record_hash = sha256(canonicalJson(record 에서 record_hash 를 뺀 것))`. canonical = 키를 재귀적으로 정렬(JS 기본 sort), 공백 없음, 값은 `JSON.stringify` 그대로(비ASCII 이스케이프 안 함).
- `prev_hash` : step 1 은 `sha256((pack_id ?? "") + series_id)`, 이후는 직전 단계의 `record_hash`. 포집 시점에 `pack_id` 가 없으면(`mm publish --new` 전) 빈 문자열로 계산하고 기록의 `pack_id` 는 `null`.
- 스크린샷 원본 JPEG 는 90KB 이하로 맞춰(q80 → 20 까지 낮춤) b64 가 120KB 를 넘지 않게 한다. 그래도 넘으면 파일은 두고 기록에는 `null`.
- 같은 규칙을 다른 곳에서 쓰려면: `import { canonicalJson, recordHash, genesisHash, sha256 } from '../tools/lib.mjs'`.

## shot.mjs

```
node shot.mjs <html> [--out <접두사>] [--max-kb 120] [--viewport 1280x800] [--mobile 375x812]
→ <접두사>.jpg, <접두사>.m.jpg  (기본 접두사 = html 경로에서 확장자 제거)
stdout: {"desktop":{path,w,h,bytes,quality,oversize,sha256},"mobile":{…},"error":null}
```

`file://` 로 열고 `load` 까지 기다린다(외부 폰트가 늦어도 12초 후 진행). 애니메이션·전환은 0초로 끝내고 캐럿을 숨긴다. 전체 20초 타임아웃.
프로그램에서: `const { shoot } = await import('./shot.mjs'); await shoot(path, { outPrefix, browser })`, `browser` 를 넘기면 재사용한다.

## check.mjs

```
node check.mjs <html> [--viewport 1280x800] [--mobile 375x812] [--only id,id]
stdout: {"passed":[…],"failed":[…],"details":{…}}   종료코드 항상 0
```

| id | 판정 (선택자 의존 없음) |
|---|---|
| `cta-contrast` | 첫 `<section>`(없으면 main → header → body) 안 **가장 큰** `a/button/[role=button]/input[submit]` 의 전경/배경 대비 ≥ 4.5:1. 배경은 요소부터 조상으로 올라가며 첫 불투명 배경까지 알파 합성. `linear-gradient` 는 첫 색으로 근사(`gradientApprox`), 래스터 배경 이미지는 무시(`bgImageIgnored`). CTA 가 없으면 pass |
| `h1-lines` | 1280px 에서 첫 h1 의 텍스트 노드 line box 들의 top 을 묶어 줄 수를 센다. ≤ 2 |
| `no-hscroll` | 375px(모바일 에뮬레이션)에서 `scrollWidth ≤ clientWidth`. `overflow-x:hidden` 으로 가려도 내용이 넘치면 실패(`clipped:true` 표시). 원인 요소를 `offender` 에 |
| `card-height` | 가격 패턴(`₩9` `$9` `9,900원` `/월` `/mo` …)이 든 텍스트에서 위로 올라가며 **형제 ≥2 가 모두 카드 같고(높이≥80, 폭≥120) 가로로 나란한** 첫 묶음. 높이 편차 `(max-min)/max ≤ 8%`. 없으면 같은 class 의 h2~h4 를 가진 형제 ≥3(기능 카드). 그것도 없으면 pass |
| `nav-overlap` | `position: fixed/sticky` 인 nav/header(또는 그 부모)와, nav 밖의 **첫 텍스트 노드** bbox 가 1px 넘게 겹치면 실패 |

`import { runChecks, shootAndCheck, CHECK_IDS, CHECK_DESCS } from './check.mjs'`, `CHECK_DESCS` 는 manifest 의 `checks:[{id,desc}]` 용.
`shootAndCheck(html, { outPrefix, viewport, mobile, maxBytes, mobileMaxBytes, only, browser, timeoutMs })` 는 스크린샷과 검사를 페이지 로드 2번으로 한 번에 돌려 `{ shot:{desktop,mobile,error}, check:{passed,failed,details} }` 를 돌려준다.

## check-copy.mjs

```
node check-copy.mjs <html|url> [--banned a,b,c] [--viewport 1440x900] [--mobile 375x812]
stdout: {"passed":[…],"failed":[…],"details":{…}}   종료코드 0 (파일 없으면 3, 인자가 틀리면 2)
```

`check.mjs` 가 레이아웃을 보는 자리에서 이쪽은 **문장**을 본다. 한국어 랜딩 카피 6항목.

| id | 판정 |
|---|---|
| `first-screen-jargon` | 스크롤 없이 보이는 영역의 텍스트에 자사 용어·기술명 0건. 기본 목록은 `DEFAULT_BANNED`(Sui·Walrus·온체인·에이전트 …), `--banned` 로 통째로 교체 |
| `honorific-consistent` | 합니다체와 해요체를 섞지 않음. 합쇼체는 어간 + -(스)ㅂ니다 라서 `니다` 앞 음절의 **받침이 ㅂ** 인지로 센다(`습니다\|입니다` 만 세면 `합니다·걸립니다·드립니다` 를 통째로 놓친다). 어미가 6개 미만이면 표본 부족으로 통과, 아니면 소수 쪽 비율 ≤ 15% |
| `no-cleft` | 분열문(`핵심은 ~입니다` / `필요한 것은 ~이다`) 0건 |
| `dash-restraint` | 앞뒤에 공백을 낀 대시(`, `) 3회 이하 |
| `quote-restraint` | 따옴표 강조 5회 미만. 곧은 `" "` · 굽은 `“ ”` · 낫표 `「 」` 를 함께 센다 |
| `no-hscroll-375` | 375px 에서 `scrollWidth ≤ clientWidth` |

`import { runCopyChecks, COPY_CHECKS } from './check-copy.mjs'`, `COPY_CHECKS` 는 `{id, desc}` 배열이라 manifest 의 `checks` 에 그대로 실을 수 있다.

형태소 분석기를 쓰지 않는다. 코드 블록(`code/pre/kbd/samp`)은 빼고 보지만 인용문 안의 말투까지 가려내지는 못한다.
실패는 자동 판정이 아니라 사람이 한 번 보라는 신호다.

> 굽은 따옴표는 소스에 `“` `”` 로 적혀 있다. 글자 그대로 두면 파일이 ASCII 로 정규화될 때
> 곧은 따옴표로 바뀌어 문자 클래스가 조용히 `["", ""]` 중복이 되고 검사가 늘 통과한다(실제로 그렇게 깨져 있었다).

`skills/landing-copy-ko/check-copy.mjs` 에 같은 파일이 한 벌 더 있다. **고칠 때 두 벌을 같이 고칠 것.**

## selftest.mjs

```
cd C:\mm\tools && node selftest.mjs [--keep]      # MM_SELFTEST_DIR 로 임시 폴더 위치 지정 가능
```

- A: 생성(결함 4개) → 내용 같은 Edit 턴 → 도구 없는 턴 → 수정(step-note). step-1/2 스키마·해시 체인·check 결과·git 커밋·시간 검사
- D: transcript 가 늦어도 `last_assistant_message` 의 step-note 가 쓰임 · 훅 `cwd` 가 딴 폴더여도 `CLAUDE_PROJECT_DIR` 로 세션 폴더를 찾음 · 둘 다 없으면 무동작
- B: entry 가 이미 있는 폴더의 step-0 기준선
- C: 결함 없는 페이지 5/5(오탐 없음), `--only`, `.mm` 없는 폴더, 깨진 stdin

## first-edit.mjs

```
node first-edit.mjs        # PostToolUse 훅. 인자도 stdin 도 보지 않고 언제나 0 으로 끝난다
```

`CLAUDE_PROJECT_DIR`(없으면 cwd)의 `index.html` 을 `.first-edit.html` 로 **한 번만** 복사한다.
이미 있으면 덮지 않으므로 남는 것은 언제나 *첫 편집 직후* 상태다. 기준선 실험에서 **첫 수정 점수**를 재려고 쓴다.

```powershell
node C:\mm\tools\check.mjs C:\demo\baseline-1\.first-edit.html
```

등록은 기준선 템플릿 하나뿐이다 (`demo/baseline/.claude/settings.json`, matcher `Edit|Write|MultiEdit`).
`capture.mjs` 와 달리 `.mm/config.json` 을 보지 않고 `index.html` 을 하드코딩한다, 기준선 폴더에는 `.mm` 이 없는 것이 실험의 요점이기 때문이다.
그래서 **전역 `~/.claude/settings.json` 에는 넣지 말 것.** mm 과 무관한 폴더에도 `.first-edit.html` 이 생긴다.

## 알려진 제약

- **Playwright chromium 필요.** 없으면 스크린샷/검사는 `null` 로 기록되고 단계 자체는 남는다(`shot fail · check n/a`).
- `selftest.mjs` 는 `capture.mjs` / `check.mjs` / `shot.mjs` / `lib.mjs` 만 덮는다. **`check-copy.mjs` 와 `first-edit.mjs` 는 자동 검증이 없다**, 손으로 돌려 볼 것.
- Write 가 새 파일인지(`create`)는 Claude Code 의 `tool_response.type` 에 의존한다. 없으면 entry 의 첫 생성일 때만 create 로 본다.
- 셸(`Bash`)로 파일을 고친 경우 `edit_mode` 는 알 수 없어 `null`. 훅 matcher 에 `Bash` 를 넣지 않으면 그 턴은 폐기될 수 있다.
- `why`/`lesson`/`verdict` 는 Stop 의 `last_assistant_message` 에서 읽는다(없으면 transcript). `.mm/capture.log` 의 `text last_assistant_message|transcript|none` 으로 어느 쪽이 쓰였는지, `(no lesson)` 으로 step-note 누락을 확인할 수 있다.
- transcript 형식은 Claude Code 의 JSONL(`type: user|assistant`, `message.content`, `isMeta`, `isSidechain`, `version`)을 가정한다. 없거나 깨져도 단계는 기록되며 `why` 는 마지막 프롬프트로 대체.
- 대비 계산은 계산된 스타일 기반이다. 배경 사진 위의 CTA, `color()`/`lab()` 색, `mix-blend-mode` 는 정확하지 않다.
- `card-height` 는 flex/grid 의 `stretch` 로 이미 같은 높이면 통과한다(의도). 모바일 세로 배치는 보지 않는다.
- git 커밋은 cwd 이하(`-- .`)만 대상으로 하지만, cwd 가 큰 저장소의 하위 폴더면 그 저장소 이력에 커밋이 남는다. 원치 않으면 `git:false`.
- 훅 한 번은 8초 안이 목표이나(한가한 머신에서 3~5초), CPU 가 포화된 머신에서는 chromium 기동만으로 수십 초가 걸린다. Stop 훅 timeout 은 120초, 필요하면 `MM_HOOK_BUDGET_MS` 를 그보다 짧게 맞출 것. 예산을 넘기면 그 턴의 단계는 기록되지 않는다(로그에 `watchdog`).
- Windows 경로: 훅 명령에 한글 경로를 쓰지 말 것(`C:\mm` 정션 사용). `import.meta.url` 은 정션을 푼 경로가 되므로 내부에서 realpath 로 비교한다.
