# Memory Market (Blockthon 2026)

Sui · Walrus · Seal · MemWal 위에 얹는 "기억 팩 구독 시장". 기획은 `PLANNING.md` 참조.

## 구조
- `contracts/memory_market/` — Move 패키지 (MemoryPack, Subscription, seal_approve)
- `scripts/` — sync(export→필터→Seal 암호화→Walrus 업로드→publish), e2e 검증
- `mcp/` — 구독자 에이전트용 MCP 서버 (market_list / market_subscribe / market_recall)
- `web/` — 팩 목록 UI (선택)

## 메모리 저장 규칙 (중요)
이 프로젝트를 개발하며 겪는 Sui / Move / Walrus / Seal / MemWal 관련 경험은
**반드시 `memwal_remember`(또는 `memwal_remember_bulk`)로 저장한다.** 이 기억이 데모의 판매자 팩이 된다.
저장 대상:
- 시도했다가 실패한 접근과 실패 원인
- 문서에 없거나 문서와 다른 동작
- 해결책과 그 근거(명령어, 인자 순서, 버전)
- 시간을 많이 쓴 지점
네임스페이스: `sui-dev`

## 환경
- 네트워크: Sui testnet. Seal 키 서버 testnet. MemWal 릴레이어 `https://relayer-staging.memory.walrus.xyz`
- 비밀키·계정 ID는 `.env`에만. 커밋 금지.
