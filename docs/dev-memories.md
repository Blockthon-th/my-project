# 개발 기억 로그 (판매자 팩의 원천)

MemWal 플러그인을 붙이기 전까지 여기에 수동 기록. 붙인 뒤에는 `memwal_remember_bulk`로 일괄 이관한다.
형식: `- [YYYY-MM-DD] 증상 → 원인 → 해결` (에이전트가 recall 하기 좋게 한 줄에 맥락이 다 들어가게)

## Sui CLI 설치 / 환경 (Windows)

- [2026-09-03] Sui CLI 릴리스에 Windows용 `.zip`은 없고 `.tgz`만 있다. `sui-testnet-v1.79.0-windows-x86_64.zip`은 404, `.tgz`는 200. Windows 10/11의 내장 `tar`로 풀면 된다.
- [2026-09-03] PowerShell 스크립트 안에서 `[Environment]::SetEnvironmentVariable("Path", ..., "User")`로 PATH를 등록해도 **그 스크립트를 띄운 부모 PowerShell 창에는 반영되지 않는다**. 현재 창에서 바로 쓰려면 `$env:Path += ";$env:LOCALAPPDATA\sui\bin"`을 직접 실행해야 하고, 영구 등록분은 새 창부터 적용된다.
- [2026-09-03] `sui client --yes`는 문서상 "프롬프트 없이 설정 생성"이지만 Windows에서는 여전히 대화형 질문(풀노드 연결? / URL / key scheme)을 띄우고 대기한다. 스크립트에서 `| Out-Null`로 출력을 가리면 질문이 보이지 않아 **멈춘 것처럼 보인다**. 스크립트에서는 출력을 가리지 말 것.
- [2026-09-03] 설정 파일이 이미 있으면 `sui client`(하위 명령 없이)는 초기화를 시도하지 않고 도움말만 출력한다. 설정을 만들려면 아무 하위 명령(`sui client active-address` 등)을 실행하면 되고, 그때 "No sui config found... create one [Y/n]?" 프롬프트가 뜨면서 ed25519 지갑 + 복구 문구를 생성하고 testnet을 활성 환경으로 잡아준다.
- [2026-09-03] 지갑 생성 시 복구 문구(12단어)가 터미널에 그대로 출력된다. 스크린샷·로그 공유 시 노출되므로, CI나 데모 녹화에서는 출력을 가리거나 해당 지갑을 테스트넷 전용으로만 쓸 것.
- [2026-09-03] 한글이 포함된 `.ps1`은 UTF-8 BOM 없이 저장하면 PowerShell 5.x가 CP949로 읽어 깨진다. BOM(`utf-8-sig`)으로 저장할 것.
- [2026-09-03] 클라우드 샌드박스(egress 제한 환경)에서는 `fullnode.testnet.sui.io:443`, `faucet.testnet.sui.io:443`가 프록시에서 차단된다(CONNECT rejected). 체인에 닿는 명령은 로컬 머신에서 실행해야 한다. `sui move build/test`는 네트워크 없이도 동작(프레임워크는 git 의존성 캐시).

## TypeScript SDK / RPC

- [2026-09-03] **공개 풀노드는 JSON-RPC를 중단했다.** `new SuiClient({ url: getFullnodeUrl('testnet') })` 로 트랜잭션을 보내면 `JsonRpcError: Method not found. JSON-RPC on public fullnodes has been deprecated` (code -32601). 웹의 예제 대부분이 아직 이 방식이라 Sui 입문자가 여기서 막힌다. `import { SuiGrpcClient } from '@mysten/sui/grpc'` + `new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' })` 로 교체.
- [2026-09-03] (1.x 한정) `keypair.signAndExecuteTransaction({ transaction, client })` 는 sender 를 자동으로 채우지 않아 `Error: Missing transaction sender` 가 난다, `tx.setSender()` 필요. 2.x 의 `client.signAndExecuteTransaction({ transaction, signer })` 에서는 불필요.
- [2026-09-03] **@mysten/sui 는 1.x → 2.x 로 크게 바뀌었고, testnet 노드와 통신하려면 2.x 가 필수다.** 1.x(1.45.2)의 gRPC 클라이언트는 (a) transaction resolution 미지원, `Error: Transaction resolution is not supported with the GRPC client` (SDK 소스에서 해당 플러그인이 통째로 주석 처리돼 있음), (b) 설령 수동으로 다 채워도 `RpcError: invalid read_mask path: transaction.transaction` (INVALID_ARGUMENT) 로 노드가 거절한다(노드 1.79 기준). 2.29 로 올리면 둘 다 해결. **버전 확인부터 할 것**: 2026-09 기준 `@mysten/sui` latest 2.29.0, `@mysten/seal` latest 1.4.8. 오래된 예제를 보고 `^1.x`, `^0.9.x` 로 잡으면 여기서 막힌다.
- [2026-09-03] @mysten/sui 2.x 의 트랜잭션 실행 API: `client.signAndExecuteTransaction({ transaction, signer, include })`. **응답에 담을 필드를 `include` 로 명시해야 한다**, `{ effects: true, objectTypes: true }` 를 주지 않으면 `res.effects` / `res.objectTypes` 가 `undefined`. 결과는 `{ $kind: 'Transaction' | 'FailedTransaction', Transaction | FailedTransaction }` 유니온이라 `$kind` 를 먼저 확인해야 한다.
- [2026-09-03] 2.x gRPC 클라이언트는 resolution 과 가스 선택을 지원하므로 `tx.object(id)` 로 객체를 넘기면 되고 `setGasPrice/Budget/Payment` 를 직접 부를 필요가 없다. (1.x 에서 하던 `sharedObjectRef`/`objectRef` 수동 지정 코드는 전부 걷어낼 것.)
- [2026-09-03] **`ExpiredSessionKeyError: Session key has expired` 의 진짜 원인 (확정).** 이 예외는 서버 응답 `InvalidCertificate` 의 SDK 쪽 이름이고(Seal SDK 의 `error.mjs`), 서버(Seal 키 서버의 `src/server.rs`)가 그걸 내는 조건은 셋뿐이다: ① TTL > 서버의 `session_key_ttl_max`, ② **생성 시각이 서버 시계보다 미래**, ③ 이미 만료. 이 중 ②의 허용 오차가 **0**이다, `checked_duration_since()` 는 `offset > now` 이면 그냥 `None` 을 반환하고(Rust 의 `time.rs`), 1ms 만 빨라도 거부된다. 따라서 **PC 시계가 서버보다 1~2초만 빨라도 방금 만든 세션 키가 즉시 거부된다.** TTL 을 낮추거나 키 서버를 바꿔도 소용없다(둘 다 시스템 시계를 씀).
  - 진단: HTTPS 응답 `date` 헤더와 `Date.now()` 비교. "몇 초 차이니 정상"이라고 넘기면 안 된다, 양수(빠름)면 그 자체가 원인이다.
  - 해결 1: `w32tm /resync /force` 로 시계 동기화(그래도 드리프트로 다시 앞설 수 있음).
  - 해결 2(견고): SDK 가 `creationTimeMs` 를 내부에서 `Date.now()` 로 찍고 주입을 안 받으므로, `SessionKey.create()` 호출 동안만 `Date.now` 를 (실제 - 측정된 skew - 여유분)로 감싸 인증서가 확실히 과거에 찍히게 한다.
- [2026-09-03] `SessionKey` 의 `ttlMin` 은 SDK 상 1~30 만 허용되지만, **키 서버가 자기 `session_key_ttl_max` 설정보다 긴 TTL 을 거부한다**(server.rs: `if ttl > self.options.session_key_ttl_max { return Err(InvalidCertificate) }`). 서버 기본값은 30분이나 배포 설정 예시에는 `session_key_ttl_max: '60s'` 가 있어, 어떤 키 서버에서는 `ttlMin: 10` 이 곧바로 `ExpiredSessionKeyError` 가 된다. **시계가 정상인데 이 에러가 나면 TTL 을 1 로 낮춰볼 것.** 세션이 짧아지므로 복호화 시도마다 세션 키를 새로 만드는 편이 안전하다.
- [2026-09-03] 키 서버는 committee 모드(`0xb012…` + aggregator, threshold 1)와 독립형 2대(`0x73d05d62…`, `0xf5d14a81…`, threshold 2) 둘 다 testnet 에서 쓸 수 있다. 인증서 거부는 서버 선택 문제가 아니라 시계 문제였다(위 항목 참고), 서버를 바꿔가며 시간 낭비하지 말 것.
- [2026-09-03] 키 서버 검증 로직 원문은 `MystenLabs/seal` 의 `crates/key-server/src/server.rs`(인증서 TTL·생성시각·서명 검사)와 `errors.rs`(에러명 매핑)에 있다. SDK 에러 이름이 모호할 때 여기를 보면 실제 조건을 알 수 있다.
- [2026-09-03] **SealClient 는 키 서버에서 받은 파생 키를 인스턴스 내부에 캐시한다.** 한 번 `decrypt` 에 성공하면 이후 복호화는 로컬에서 일어나므로, **구독이 만료돼도 같은 클라이언트로는 계속 읽힌다.** 만료·권한 회수를 검증하거나 데모하려면 캐시가 빈 새 `SealClient` 인스턴스로 시도해야 한다(= 새 세션의 사용자). 이걸 모르면 "정책이 동작하지 않는다"고 오진하기 쉽다. 반대로 말하면 Seal 의 접근 회수는 **이미 키를 받아간 클라이언트에는 소급되지 않는다**, 설계상의 성질이므로 서비스 설계 시 감안할 것.
- [2026-09-03] `@mysten/seal` 1.x 의 `KeyServerConfig` 에는 `aggregatorUrl` 이 있다. committee mode(탈중앙) 키 서버 `0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98` 는 모든 키 요청이 aggregator(`https://seal-aggregator-testnet.mystenlabs.com`)를 거치므로 이 필드가 필수. 0.9.x 에는 이 필드가 없어서 독립형 서버 2개 + threshold 2 로 우회해야 했다.
- [2026-09-03] gRPC 응답에는 `objectChanges` 가 없다. 새로 만들어진 객체는 `res.effects.changedObjects` 에서 `idOperation === 'Created'` 로 거르고, 타입은 `res.objectTypes` (id → type 맵)로 확인한다. 필드명은 `c.id` 가 아니라 **`c.objectId`**. 성공 여부는 결과 유니온의 `$kind === 'Transaction'` 으로 판단.
- [2026-09-03] `dotenv/config` 를 import 하면 `.env` 를 실행 위치(cwd)에서 찾는다. `scripts/` 안에서 `npm run` 하면 루트의 `.env` 를 못 찾으므로, `import.meta.url` 기준 절대 경로로 `loadEnv({ path: ... })` 를 호출할 것.

## Move / 컨트랙트

- [2026-09-03] Sui Move 2024 edition: `vector::empty()`와 `dynamic_field::exists_`는 deprecated. 각각 `vector[]` 리터럴, `df::exists`로 쓸 것. 빌드는 되지만 경고가 뜬다.
- [2026-09-03] Seal 접근 정책은 Seal을 수정하는 게 아니라 **내 패키지에 `seal_approve` entry 함수를 두는 것**이다. 키 서버가 그 함수를 시뮬레이션해서 abort하지 않으면 키를 발급한다. 공식 예제는 `MystenLabs/seal` 저장소의 `examples/move/sources/{allowlist,subscription}.move`.
- [2026-09-03] Seal 열쇠 ID 규약은 `[패키지 ID]::[정책 객체 ID][임의 nonce]`. `seal_approve` 안에서 `is_prefix(정책객체.id.to_bytes(), id)`로 이 정책 소관인지 확인한다. 한 정책 객체로 여러 blob을 nonce만 바꿔 커버할 수 있다.
- [2026-09-03] `expected_failure(abort_code = ...)`를 쓰는 Move 테스트는 마지막에 도달 불가 코드가 필요해서 `abort 0`으로 끝내면 컴파일이 통과한다.

## MemWal

- [2026-09-03] MemWal 릴레이어는 직접 띄울 필요 없음. Walrus Foundation 호스팅: mainnet `https://relayer.memory.walrus.xyz`, testnet `https://relayer-staging.memory.walrus.xyz`. Walrus 저장 비용도 릴레이어 지갑이 부담.
- [2026-09-03] 소유자의 기억 전체를 읽는 API가 있다: `GET /v1/owners/:owner/memories` (cursor 기반). Ed25519 서명 헤더 5개 또는 owner bearer 토큰으로 인증. SDK의 `recall`은 질의 기반이라 전량 덤프에는 이 API를 써야 한다.
- [2026-09-03] MemWal의 Seal 열쇠 ID는 `BCS(owner) ‖ BCS(counter)` 하나뿐이다. 즉 **소유자당 열쇠 1개**라서 "기억 일부만 특정인에게" 같은 부분 접근이 구조적으로 불가능하다. 델리게이트를 등록하면 계정 전체가 열린다(최대 20개, 결제·만료 개념 없음). 팩 단위 거래는 별도 패키지에서 재암호화해야 한다.
- [2026-09-03] Claude Code용 공식 플러그인이 저장소 안에 있다(`packages/mcp/plugin`). MCP 도구 5개 + SessionStart/UserPromptSubmit/PostToolUse 훅. 훅은 "저장해라"고 상기만 시키고 실제 저장 판단은 에이전트가 한다 → 확실히 쌓으려면 `CLAUDE.md`에 저장 규칙을 명시해야 한다.

## MCP 서버

- [2026-09-03] **stdio MCP 서버는 stdout 을 JSON-RPC 전용으로 비워둬야 한다.** 한 줄이라도 다른 출력이 섞이면 클라이언트가 `failed` 로 표시한다. 두 가지가 흔한 원인:
  - `npm run <script>` 로 띄우면 npm 이 `> script` 배너를 stdout 에 찍는다 → **npm 을 거치지 말고 실행 파일을 직접 부를 것**. 예: `node scripts/node_modules/tsx/dist/cli.mjs scripts/mcp/server.ts`.
  - dotenv v17 은 `◇ injected env (N) from .env` 를 stdout 에 찍는다 → `config({ quiet: true })` 필수.
  로그는 전부 `console.error`(stderr)로 보낼 것. 디버깅은 `claude --debug`.
- [2026-09-03] Windows 에서 `.mcp.json` 의 `command` 에 `npm`/`npx` 를 쓰면 `.cmd` 해석 문제로 실패할 수 있다. `node` + 스크립트 절대/상대 경로가 가장 안전하다.
- [2026-09-13] 브라우저/스크립트에서 `sui_getObject` 가 `-32601 Method not found` → 공개 풀노드의 JSON-RPC 가 폐기됨(안내문이 gRPC/GraphQL 로 이관하라고 답한다) → 객체 조회를 GraphQL 로 바꾼다. `query($a:SuiAddress!){ object(address:$a){ asMoveObject{ contents{ json } } } }` 로 필드가 그대로 나온다.
- [2026-09-13] GraphQL 로 읽은 MemoryPack 의 값 필드가 계속 0 → 필드 이름을 `price_mist` 로 넘겨짚었기 때문. 실제 이름은 `fee`(mist 단위) 이고 네임스페이스도 `namespace` 가 아니라 `source_namespace` 다. 추측하지 말고 `contents{ json }` 을 한 번 통째로 찍어보고 이름을 확인할 것.
- [2026-09-13] 미리보기 블롭을 전부 `<img>` 로 그리면 안 된다 → 같은 `preview_blob_ids` 안에 JSON 설명, JPG 사진, 순수 텍스트 교훈이 섞여 들어간다. 앞 바이트로 종류를 갈라야 한다(`89 50`=PNG, `ff d8`=JPG, `{`=JSON, 나머지는 글). 텍스트 미리보기를 "없음" 으로 처리하면 팔 거리를 스스로 버리는 셈이다.
