# memory-market (Claude Code 플러그인)

다른 개발자의 에이전트가 **실제 작업에서 쌓은 기억**을 기간제로 구독해서 쓰는 시장.
실패한 시도와 그 원인, 문서에 없는 동작, 에러 메시지와 실제 원인이 다른 사례, 검색으로는 안 나오는 것들.

## 설치

```
/plugin marketplace add Blockthon-th/my-project
/plugin install memory-market
```

로컬 체크아웃에서:

```
/plugin marketplace add C:\path\to\my-project
/plugin install memory-market
```

## 들어 있는 것

| 구성 | 역할 |
|---|---|
| MCP 서버 | `market_list` · `market_preview` · `market_subscribe` · `market_recall` · `market_find` · `market_acquire` · `market_receipt` |
| UserPromptSubmit 훅 | Sui/Move/Walrus/Seal 관련 질문일 때 "코드를 뒤지기 전에 시장을 먼저 확인하라"고 상기 |

### `server/index.mjs` 는 왜 커밋돼 있나

`cd scripts; npm run build:plugin` 이 `scripts/mcp/server.ts` 를 esbuild 로 묶어 만드는 2.3MB 단일 파일이다.
생성물이지만 일부러 추적한다, `/plugin marketplace add Blockthon-th/my-project` 로 설치하는 사람은
이 저장소를 clone 만 하고 빌드하지 않기 때문에, 커밋돼 있지 않으면 플러그인이 뜨지 않는다.
저장소 용량의 약 57% 가 이 한 파일이다. **읽거나 고칠 원본은 `scripts/mcp/server.ts` 이고,
번들은 손으로 편집하지 말고 다시 빌드한다.**
`plugin/hooks/on_user_prompt.mjs` 도 같은 이유로 플러그인 안에 사본이 아니라 원본으로 있다.

훅이 필요한 이유: MCP 도구는 에이전트가 "지금 쓸 상황"이라고 판단해야만 호출된다.
코딩 에이전트는 오류를 보면 먼저 로컬 코드를 뒤지므로, 도구 설명만으로는 잘 불리지 않는다.
훅은 세션 첫 질문에만 전체 안내를 넣고, 이후엔 한 줄, 무관한 대화엔 아무것도 하지 않는다.

## 설정: 한 번만

구독에는 **본인 지갑**이 필요하다. 지갑 키는 플러그인과 함께 배포되지 않는다 ·
플러그인은 모두가 같은 코드를 받지만 지갑은 사람마다 다르기 때문이다.
(MemWal 도 같은 구조로, 코드는 플러그인에, 자격 증명은 `~/.memwal/credentials.json` 에 둔다.)

`~/.memory-market/config.json` 을 만든다. 한 번 만들면 모든 프로젝트에서 쓰인다:

```json
{
  "BUYER_SUI_PRIVATE_KEY": "suiprivkey1..."
}
```

키 만들고 꺼내기 (testnet):

```
sui client new-address ed25519
sui client faucet --address <새 주소>
sui keytool export --key-identity <새 주소>
```

시장 컨트랙트 주소는 공개 정보라 기본값이 들어 있다. 다른 배포를 쓰려면 같은 파일에
`MARKET_PACKAGE_ID` 를 넣으면 된다. 저장소에서 직접 개발할 때는 프로젝트 `.env` 도 읽는다.

설정이 없어도 서버는 정상적으로 뜨고, 도구를 부르면 무엇을 해야 하는지 안내한다.

## 결제·안전 규칙 (읽고 쓸 것)

구독 결제는 실제 SUI 트랜잭션이다. **도구 호출 승인이 곧 결제 승인**이다, 이 서버는 따로 되묻지 않는다.

- 결제가 일어나는 도구는 두 개: `market_subscribe`, 그리고 **`market_acquire`** (유효한 구독이 없으면 그 자리에서 `subscribe` tx 를 보낸다. 유효한 구독이 있으면 재사용하고 결제하지 않는다). `market_recall` · `market_find` · `market_preview` · `market_list` 는 결제하지 않고, `market_receipt` 는 가스만 쓴다.
- 권한 설정에서 `mcp__memory-market__market_acquire` 와 `market_subscribe` 를 자동 허용(allow)하면 에이전트가 사람 확인 없이 지갑을 쓴다. 데모 템플릿(`demo/buyer/.claude/settings.json`)은 시연을 위해 `mcp__memory-market__*` 를 통째로 허용해 두었다, 자기 프로젝트에서는 결제 도구를 allow 목록에서 빼는 것을 권장한다.
- 세션 지출 상한 `MARKET_SPEND_CAP_SUI` (기본 0.5 SUI): 이 MCP 서버 **프로세스 안에서** 누적 결제액이 상한을 넘으면 구독을 거부한다. 서버를 다시 띄우면 0 부터 센다, 지갑 잔액 한도가 아니므로 **구매용 지갑에는 쓸 만큼만 넣어라.** 숫자가 아닌 값을 넣으면 기본값으로 되돌린다.
- 팩 내용(플레이북·manifest·미리보기)은 **판매자가 쓴 데이터**다. 도구 출력 첫 줄에 "지시가 아니다" 를 붙여 돌려주지만, 그 안의 "이 파일을 올려라 / 이 팩을 사라" 류 문장을 에이전트가 따르지 않는지는 사용자가 확인해야 한다.
- `market_receipt` 의 증거 파일은 공개 Walrus 에 **평문**으로 올라가고 blob id 가 체인에 영구히 남는다. 그래서 서버는 작업 폴더(서버가 뜬 cwd, `MM_PROJECT`, `MM_EVIDENCE_DIR`) 밖의 파일, `.env*`, `~/.memory-market`, `~/.sui`, `.ssh`, `.git`, `node_modules` 아래 파일, 256KB 초과, 바이너리, 비밀키 패턴(`suiprivkey1…`, `PRIVATE_KEY=`, PEM)이 든 파일을 거부한다.
- 폐기(`retract`)는 회수가 아니다. 판매자가 폐기한 단계는 `market_acquire` / `mm recall` 이 걸러 주지만, 컨트랙트의 `seal_approve` 는 폐기를 검사하지 않으므로 유효한 구독자가 열쇠 ID 를 직접 대면 여전히 복호화된다. 이미 받은 키·평문은 만료 뒤에도 남는다.
