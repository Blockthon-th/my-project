/**
 * 트랜잭션 헬퍼 (@mysten/sui 2.x, gRPC).
 *
 * 2.x 의 gRPC 클라이언트는 transaction resolution(객체 참조 확정, 가스 선택)을 지원하므로
 * 1.x 때처럼 객체 version/digest 나 가스를 직접 채울 필요가 없다.
 * 대신 응답에 무엇을 담을지 `include` 로 명시해야 한다.
 */
import type { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { suiClient } from './config.js';

const INCLUDE = { effects: true, objectTypes: true } as const;

/** 서명 → 실행 → 확정 대기. 실패하면 throw. */
export async function execute(tx: Transaction, signer: Signer) {
  const res = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer,
    include: INCLUDE,
  });
  if (res.$kind === 'FailedTransaction') {
    throw new Error(
      `tx 실패 (${res.FailedTransaction.digest}): ${JSON.stringify(res.FailedTransaction.status)}`,
    );
  }
  const done = await suiClient.waitForTransaction({
    digest: res.Transaction.digest,
    include: INCLUDE,
  });
  if (done.$kind === 'FailedTransaction') {
    throw new Error(`tx 실패: ${JSON.stringify(done.FailedTransaction.status)}`);
  }
  return done.Transaction;
}

export type TxResult = Awaited<ReturnType<typeof execute>>;

/**
 * 새로 만들어진 객체 중 지정한 타입의 ID 찾기.
 * effects.changedObjects 에서 idOperation === 'Created' 인 것들을 objectTypes 로 걸러낸다.
 */
export function createdId(res: TxResult, typeSuffix: string): string {
  const types = res.objectTypes ?? {};
  const created = (res.effects?.changedObjects ?? []).filter((c) => c.idOperation === 'Created');
  const hit = created.find((c) => types[c.objectId]?.endsWith(typeSuffix));
  if (!hit) {
    throw new Error(
      `${typeSuffix} 객체를 찾지 못함.\n생성된 객체: ${JSON.stringify(
        created.map((c) => ({ id: c.objectId, type: types[c.objectId] })),
        null,
        2,
      )}`,
    );
  }
  return hit.objectId;
}
