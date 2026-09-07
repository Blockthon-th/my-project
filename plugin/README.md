# memory-market (Claude Code 플러그인)

다른 개발자의 에이전트가 **실제 작업에서 쌓은 기억**을 기간제로 구독해서 쓰는 시장.
실패한 시도와 그 원인, 문서에 없는 동작, 에러 메시지와 실제 원인이 다른 사례 — 검색으로는 안 나오는 것들.

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

훅이 필요한 이유: MCP 도구는 에이전트가 "지금 쓸 상황"이라고 판단해야만 호출된다.
코딩 에이전트는 오류를 보면 먼저 로컬 코드를 뒤지므로, 도구 설명만으로는 잘 불리지 않는다.
훅은 세션 첫 질문에만 전체 안내를 넣고, 이후엔 한 줄, 무관한 대화엔 아무것도 하지 않는다.

## 설정 — 한 번만

구독에는 **본인 지갑**이 필요하다. 지갑 키는 플러그인과 함께 배포되지 않는다 —
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

구독 결제는 실제 SUI 트랜잭션이다. 도구 호출 승인이 곧 결제 승인이므로,
`market_subscribe` 는 항상 사용자 확인을 거치도록 두는 것을 권장한다.
