/**
 * 서버 시각에 정렬된 Seal 세션 키 생성.
 *
 * 키 서버는 인증서의 `creation_time` 이 **자기 시계보다 조금이라도 미래이면** 무조건 거부한다
 * (key-server/src/server.rs → `checked_duration_since()` 가 None → `InvalidCertificate`,
 *  SDK 는 이를 `ExpiredSessionKeyError: Session key has expired` 로 표시).
 * 허용 오차가 0이라 PC 시계가 1~2초만 빨라도 방금 만든 세션 키가 거부된다.
 *
 * SDK 는 `creationTimeMs` 를 내부에서 `Date.now()` 로 찍고 외부 주입을 받지 않으므로,
 * 생성하는 순간에만 `Date.now` 를 서버 시각 기준으로 되돌려 인증서가 확실히 과거에 찍히게 한다.
 */
import { SessionKey } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import { clockSkewMs, SEAL_PACKAGE_ID, SEAL_SESSION_TTL_MIN, suiClient } from './config.js';

/** 서버보다 확실히 과거로 밀어둘 여유분 */
const SAFETY_MS = 10_000;

let cachedShiftMs: number | null = null;

async function shiftMs(): Promise<number> {
  if (cachedShiftMs === null) {
    const skew = await clockSkewMs();
    // skew > 0 = 내 시계가 서버보다 빠름. 그만큼 되돌리고 여유분을 더 뺀다.
    cachedShiftMs = Math.max(0, skew ?? 0) + SAFETY_MS;
  }
  return cachedShiftMs;
}

export async function createSessionKey(signer: Signer, address: string): Promise<SessionKey> {
  const shift = await shiftMs();
  const realNow = Date.now;
  Date.now = () => realNow.call(Date) - shift;
  try {
    // Seal 은 첫 버전 패키지 ID 만 받는다 (config.ts 의 SEAL_PACKAGE_ID 주석 참고)
    return await SessionKey.create({
      address,
      packageId: SEAL_PACKAGE_ID,
      ttlMin: SEAL_SESSION_TTL_MIN,
      suiClient,
      signer,
    });
  } finally {
    Date.now = realNow;
  }
}
