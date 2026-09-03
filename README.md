# Memory Market

**전문가 에이전트의 살아 있는 기억을 필요한 기간만 구독하는 시장.**
Sui · Walrus · Seal · MemWal 위에 얹는 앱 층 프로젝트 (프로토콜 수정 없음).

Blockthon 2026 출품작. 기획은 [PLANNING.md](PLANNING.md).

## 지금까지 동작 확인된 것 (testnet)

`scripts/e2e.ts` 가 전 과정을 통과한다:

1. 판매자가 **기억 팩** 생성 (가격·구독 기간·출처 이력이 담긴 Sui 공유 객체)
2. 기억을 **Seal 로 암호화 → Walrus 업로드 → 팩에 등록**
3. 구독자가 **SUI 결제 → 구독권 발급** (수수료는 판매자에게 즉시 전송)
4. 구독 유효 → **복호화 성공**, 원문 회수
5. 만료 후 → **새 클라이언트는 키를 받지 못함** (NoAccessError)

배포된 패키지: `0x9202b4c61a6ce136af797e9b85503b1ef2576d2e9f772d150a57227d12476b83` (testnet)

## 구조

```
contracts/memory_market/   Move 패키지 — MemoryPack, PackCap, Subscription, seal_approve
scripts/
  config.ts                네트워크·키 서버·Walrus 엔드포인트, 시계 오차 측정
  session.ts               서버 시각에 정렬된 Seal 세션 키 생성 (아래 "함정" 참고)
  tx.ts                    트랜잭션 실행 + 생성 객체 조회
  market.ts                팩 생성/등록/구독/조회/복호화 (sync 와 MCP 가 공유)
  memories.ts              기억 수집 (MemWal 또는 docs/dev-memories.md)
  filter.ts                개인정보 필터 (제외 / 가림)
  sync.ts                  판매자: 수집 → 필터 → 암호화 → 업로드 → 등록
  e2e.ts                   전 과정 검증
  mcp/server.ts            구독자 에이전트용 MCP 서버
  *.ps1                    설치·배포·지갑 준비 (Windows)
docs/dev-memories.md       개발하며 쌓인 기억 — 데모에서 판매할 팩의 원천
docs/DEMO.md               3분 데모 시나리오 + 예상 질문
```

## 사용

```powershell
cd scripts
npm run sync -- --dry   # 무엇이 팔리고 무엇이 걸러지는지 확인
npm run sync            # 팩 생성(최초) + 새 기억 업로드 + 미리보기 등록
npm run e2e             # 전 과정 검증
npm run typecheck
```

### 구독자 쪽 (Claude Code)

프로젝트 루트에 `.mcp.json` 을 만든다:

```json
{
  "mcpServers": {
    "memory-market": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp/server.ts"]
    },
    "memwal": {
      "command": "npx",
      "args": ["-y", "@mysten-incubation/memwal-mcp", "--staging", "--namespace", "sui-dev"]
    }
  }
}
```

붙으면 도구 네 개를 쓸 수 있다:
`market_list` → `market_preview` → `market_subscribe` → `market_recall`.

`memwal` 서버는 판매자 쪽 기억 자동 수집용이다. 처음 한 번
`npx -y @mysten-incubation/memwal-mcp login` 으로 지갑을 연결한다.

## 실행

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1      # CLI + 지갑
# 출력된 faucet 링크에서 테스트넷 SUI 수령
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1         # 배포 → .env
powershell -ExecutionPolicy Bypass -File scripts\setup-wallets.ps1  # 두 지갑 키
cd scripts; npm install; npm run e2e
```

`.env` 는 `.env.example` 참고. 커밋 금지.

## 이 프로젝트에서 걸린 함정들

`docs/dev-memories.md` 에 전부 기록되어 있고, 이 기록 자체가 데모에서 판매하는 상품이다.
가장 값비쌌던 것 세 가지:

- **공개 풀노드가 JSON-RPC 를 중단했다.** `SuiClient` 대신 `SuiGrpcClient`, SDK 는 `@mysten/sui` **2.x 이상**이어야 한다. 1.x 의 gRPC 클라이언트는 현재 노드와 아예 통신이 안 된다.
- **`ExpiredSessionKeyError: Session key has expired` 는 만료가 아니다.** 키 서버는 인증서 생성 시각이 자기 시계보다 **1ms 라도 미래이면 거부**한다(허용 오차 0). PC 시계가 2~3초 빠른 것만으로 재현된다. TTL 을 낮추거나 키 서버를 바꿔도 소용없다 → `session.ts` 가 생성 시각을 서버 기준으로 되돌린다.
- **SealClient 는 받아온 키를 캐시한다.** 구독이 만료돼도 같은 클라이언트로는 계속 읽힌다. 만료 검증·시연은 새 클라이언트로 해야 한다.

## 돌아왔을 때 먼저 할 것

1. **git 잠금 정리** — 원격 도구에 파일 삭제 권한이 없어 `.git/*.lock` 이 남는다. 관리자 아닌 PowerShell 에서:
   ```powershell
   cd C:\Users\pc\source\my-project
   del .git\*.lock
   rmdir /s /q _to_delete
   git rm -r --cached _to_delete 2>$null; git add -A; git commit -m "chore: cleanup"
   git push -u origin main
   ```
2. **`.mcp.json` 생성** — 아래 "구독자 쪽" 참고 (원격에서는 이 파일을 쓸 수 없다).
3. **`npm run sync -- --dry`** 로 무엇이 팔리고 무엇이 걸러지는지 확인 → 문제없으면 `npm run sync`.

## 다음

- [ ] **MemWal 플러그인 연결** — 개발 기억을 `sui-dev` 네임스페이스에 자동 수집
      (`npx -y @mysten-incubation/memwal-mcp login` 후 `.env` 에 키 기록 → `MEMORY_SOURCE=memwal`)
- [ ] `npm run sync` 실측 (팩 생성 · 업로드 · 미리보기)
- [ ] MCP 서버를 구독자 Claude Code 에 붙여 데모 리허설
- [ ] 팩 목록 웹 (선택, Walrus Sites 배포하면 활용도 점수 +)
- [ ] 만료 후 캐시 문제 — MCP 서버가 요청마다 키를 새로 받도록 (현재 60초 캐시)
