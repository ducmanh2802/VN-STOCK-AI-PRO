import type { MarketSnapshot } from '../snapshot/types.ts';
import { computeSnapshotHash, computeSnapshotId } from '../snapshot/snapshotHash.ts';
import { verifySnapshotIntegrity } from '../snapshot/MarketSnapshot.ts';
import type { ReplayRequest, ReplayValidationResult, ReplayMismatch } from './types.ts';

export class ReplayValidator {
  /**
   * Validates snapshot integrity, execution binding, and parameter consistency
   * before replay execution. Fail-closed: any failure halts execution.
   */
  static validate(request: ReplayRequest): ReplayValidationResult {
    const mismatches: ReplayMismatch[] = [];

    // 1. Snapshot existence
    if (!request || !request.snapshot || typeof request.snapshot !== 'object') {
      mismatches.push({
        code: 'SNAPSHOT_NOT_FOUND',
        field: 'snapshot',
        expected: 'MarketSnapshot object',
        actual: request?.snapshot,
        message: 'MarketSnapshot is missing or invalid in replay request',
      });
      return {
        isValid: false,
        mismatches,
        error: 'MarketSnapshot is missing or invalid in replay request',
      };
    }

    const snapshot = request.snapshot;

    // 2. Snapshot Hash and ID verification (anti-tamper)
    try {
      const calculatedHash = computeSnapshotHash(snapshot);
      if (calculatedHash !== snapshot.hash) {
        mismatches.push({
          code: 'SNAPSHOT_HASH_INVALID',
          field: 'snapshot.hash',
          expected: calculatedHash,
          actual: snapshot.hash,
          message: `Snapshot hash mismatch: expected computed ${calculatedHash}, found ${snapshot.hash}`,
        });
      }

      const calculatedId = computeSnapshotId(snapshot.hash);
      if (calculatedId !== snapshot.snapshotId) {
        mismatches.push({
          code: 'SNAPSHOT_ID_MISMATCH',
          field: 'snapshot.snapshotId',
          expected: calculatedId,
          actual: snapshot.snapshotId,
          message: `Snapshot ID mismatch: expected computed ${calculatedId}, found ${snapshot.snapshotId}`,
        });
      }

      const isIntegrityValid = verifySnapshotIntegrity(snapshot);
      if (!isIntegrityValid && !mismatches.some(m => m.code === 'SNAPSHOT_HASH_INVALID')) {
        mismatches.push({
          code: 'SNAPSHOT_HASH_INVALID',
          field: 'snapshot.integrity',
          expected: 'valid cryptographic signature/hash',
          actual: 'corrupted or altered snapshot payload',
          message: 'Snapshot cryptographic verification failed',
        });
      }
    } catch (err) {
      mismatches.push({
        code: 'SNAPSHOT_HASH_INVALID',
        field: 'snapshot.hash',
        expected: 'valid hash computation',
        actual: String(err),
        message: `Failed to compute or verify snapshot hash: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // 3. Snapshot integrity status
    if (snapshot.integrity && snapshot.integrity.validationStatus === 'INVALID') {
      mismatches.push({
        code: 'INPUT_INVALID',
        field: 'snapshot.integrity.validationStatus',
        expected: 'VALID',
        actual: snapshot.integrity.validationStatus,
        message: 'Snapshot marked as INVALID in its integrity record',
      });
    }

    // 4. Execution Context verification
    if (!request.executionContext || typeof request.executionContext !== 'object') {
      mismatches.push({
        code: 'INPUT_INVALID',
        field: 'executionContext',
        expected: 'ExecutionContextBinding object',
        actual: request.executionContext,
        message: 'ExecutionContextBinding is missing or invalid',
      });
    } else {
      const ctx = request.executionContext;

      if (!ctx.marketDataSnapshotId) {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: 'executionContext.marketDataSnapshotId',
          expected: snapshot.snapshotId,
          actual: ctx.marketDataSnapshotId,
          message: 'marketDataSnapshotId is required in execution context',
        });
      } else if (ctx.marketDataSnapshotId !== snapshot.snapshotId) {
        mismatches.push({
          code: 'ORDER_SNAPSHOT_MISMATCH',
          field: 'executionContext.marketDataSnapshotId',
          expected: snapshot.snapshotId,
          actual: ctx.marketDataSnapshotId,
          message: `ExecutionContext marketDataSnapshotId (${ctx.marketDataSnapshotId}) does not match snapshot.snapshotId (${snapshot.snapshotId})`,
        });
      }

      // Strategy version consistency
      if (
        snapshot.versions?.strategyVersion &&
        ctx.strategyVersion &&
        snapshot.versions.strategyVersion !== ctx.strategyVersion
      ) {
        mismatches.push({
          code: 'STRATEGY_VERSION_MISMATCH',
          field: 'strategyVersion',
          expected: snapshot.versions.strategyVersion,
          actual: ctx.strategyVersion,
          message: `Strategy version mismatch: snapshot=${snapshot.versions.strategyVersion}, context=${ctx.strategyVersion}`,
        });
      }

      // Risk policy version consistency
      if (
        snapshot.versions?.riskPolicyVersion &&
        ctx.riskPolicyVersion &&
        snapshot.versions.riskPolicyVersion !== ctx.riskPolicyVersion
      ) {
        mismatches.push({
          code: 'RISK_POLICY_VERSION_MISMATCH',
          field: 'riskPolicyVersion',
          expected: snapshot.versions.riskPolicyVersion,
          actual: ctx.riskPolicyVersion,
          message: `Risk policy version mismatch: snapshot=${snapshot.versions.riskPolicyVersion}, context=${ctx.riskPolicyVersion}`,
        });
      }

      // Recommendation ID consistency
      if (
        snapshot.recommendation?.recommendationId &&
        ctx.recommendationId &&
        snapshot.recommendation.recommendationId !== ctx.recommendationId
      ) {
        mismatches.push({
          code: 'RECOMMENDATION_MISMATCH',
          field: 'recommendationId',
          expected: snapshot.recommendation.recommendationId,
          actual: ctx.recommendationId,
          message: `Recommendation ID mismatch: snapshot=${snapshot.recommendation.recommendationId}, context=${ctx.recommendationId}`,
        });
      }
    }

    // 5. Order Intent verification
    if (!request.orderIntent || typeof request.orderIntent !== 'object') {
      mismatches.push({
        code: 'INPUT_INVALID',
        field: 'orderIntent',
        expected: 'OrderIntent object',
        actual: request.orderIntent,
        message: 'OrderIntent is missing or invalid',
      });
    } else {
      const intent = request.orderIntent;

      if (!intent.symbol) {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: 'orderIntent.symbol',
          expected: 'Valid ticker string',
          actual: intent.symbol,
          message: 'OrderIntent symbol is missing',
        });
      } else if (
        snapshot.instrument?.symbol &&
        intent.symbol.toUpperCase() !== snapshot.instrument.symbol.toUpperCase()
      ) {
        mismatches.push({
          code: 'INPUT_INVALID',
          field: 'orderIntent.symbol',
          expected: snapshot.instrument.symbol.toUpperCase(),
          actual: intent.symbol.toUpperCase(),
          message: `OrderIntent symbol (${intent.symbol}) does not match snapshot instrument symbol (${snapshot.instrument.symbol})`,
        });
      }

      if (
        intent.marketDataSnapshotId &&
        intent.marketDataSnapshotId !== snapshot.snapshotId
      ) {
        mismatches.push({
          code: 'ORDER_SNAPSHOT_MISMATCH',
          field: 'orderIntent.marketDataSnapshotId',
          expected: snapshot.snapshotId,
          actual: intent.marketDataSnapshotId,
          message: `OrderIntent marketDataSnapshotId (${intent.marketDataSnapshotId}) does not match snapshot (${snapshot.snapshotId})`,
        });
      }

      if (
        request.executionContext?.strategyVersion &&
        intent.strategyVersion &&
        request.executionContext.strategyVersion !== intent.strategyVersion
      ) {
        mismatches.push({
          code: 'STRATEGY_VERSION_MISMATCH',
          field: 'orderIntent.strategyVersion',
          expected: request.executionContext.strategyVersion,
          actual: intent.strategyVersion,
          message: `OrderIntent strategyVersion (${intent.strategyVersion}) does not match executionContext (${request.executionContext.strategyVersion})`,
        });
      }

      if (
        request.executionContext?.riskPolicyVersion &&
        intent.riskPolicyVersion &&
        request.executionContext.riskPolicyVersion !== intent.riskPolicyVersion
      ) {
        mismatches.push({
          code: 'RISK_POLICY_VERSION_MISMATCH',
          field: 'orderIntent.riskPolicyVersion',
          expected: request.executionContext.riskPolicyVersion,
          actual: intent.riskPolicyVersion,
          message: `OrderIntent riskPolicyVersion (${intent.riskPolicyVersion}) does not match executionContext (${request.executionContext.riskPolicyVersion})`,
        });
      }

      if (
        request.executionContext?.recommendationId &&
        intent.recommendationId &&
        request.executionContext.recommendationId !== intent.recommendationId
      ) {
        mismatches.push({
          code: 'RECOMMENDATION_MISMATCH',
          field: 'orderIntent.recommendationId',
          expected: request.executionContext.recommendationId,
          actual: intent.recommendationId,
          message: `OrderIntent recommendationId (${intent.recommendationId}) does not match executionContext (${request.executionContext.recommendationId})`,
        });
      }
    }

    const isValid = mismatches.length === 0;
    return {
      isValid,
      mismatches,
      error: isValid ? undefined : mismatches.map(m => m.message).join('; '),
    };
  }
}
