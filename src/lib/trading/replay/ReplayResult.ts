import type {
  ReplayExecutionSummary,
  ReplayMismatch,
  ReplayResult,
  ReplayStatus,
} from './types.ts';
import type { PaperExecutionResult } from '../paper/PaperExecutionEngine.ts';
import type { PaperAuditEntry } from '../paper/PaperTradeLedger.ts';

export class ReplayResultFactory {
  /**
   * Summarizes an execution outcome from various representations into a uniform ReplayExecutionSummary.
   */
  static summarizeExecution(
    exec: PaperExecutionResult | PaperAuditEntry | ReplayExecutionSummary
  ): ReplayExecutionSummary {
    if (!exec) {
      return {
        status: 'REJECTED',
        side: 'BUY',
        symbol: '',
        requestedQuantity: 0,
        executedQuantity: 0,
        requestedPrice: 0,
        executedPrice: null,
        fee: 0,
        tax: 0,
        slippage: 0,
        code: 'UNKNOWN',
        success: false,
      };
    }

    // Check if it's a PaperExecutionResult
    if ('integrityResult' in exec) {
      const res = exec as PaperExecutionResult;
      return {
        orderId: res.orderId,
        status: res.status,
        side: res.side,
        symbol: res.symbol,
        requestedQuantity: res.requestedQuantity,
        executedQuantity: res.executedQuantity,
        requestedPrice: res.requestedPrice,
        executedPrice: res.executedPrice,
        fee: res.fee ?? 0,
        tax: res.tax ?? 0,
        slippage: res.slippage ?? 0,
        code: res.code,
        success: res.success,
        realizedPnL: res.realizedPnL,
        cashAfter: res.accountAfter?.cash,
      };
    }

    // Check if it's a PaperAuditEntry
    if ('auditId' in exec) {
      const audit = exec as PaperAuditEntry;
      return {
        orderId: audit.orderId,
        status: audit.finalOrderStatus,
        side: audit.side,
        symbol: audit.symbol,
        requestedQuantity: audit.requestedQuantity,
        executedQuantity: audit.executedQuantity,
        requestedPrice: audit.requestedPrice,
        executedPrice: audit.executedPrice,
        fee: audit.fees ?? 0,
        tax: audit.tax ?? 0,
        slippage: audit.slippage ?? 0,
        code: audit.validatorCode === 'OK' ? (audit.finalOrderStatus === 'FILLED' ? 'EXECUTED' : 'REJECTED') : audit.validatorCode,
        success: audit.finalOrderStatus === 'FILLED',
        realizedPnL: audit.realizedPnL,
        cashAfter: audit.cashAfter,
        positionAfter: audit.positionAfter,
      };
    }

    // Already a ReplayExecutionSummary
    return { ...(exec as ReplayExecutionSummary) };
  }

  /**
   * Compares two execution summaries field-by-field for complete determinism.
   */
  static compareExecutions(
    original: ReplayExecutionSummary,
    replay: ReplayExecutionSummary
  ): ReplayMismatch[] {
    const mismatches: ReplayMismatch[] = [];

    const checkField = (
      field: keyof ReplayExecutionSummary,
      tolerance = 0
    ) => {
      const origVal = original[field];
      const repVal = replay[field];

      if (typeof origVal === 'number' && typeof repVal === 'number') {
        if (Math.abs(origVal - repVal) > tolerance) {
          mismatches.push({
            code: 'EXECUTION_MISMATCH',
            field: String(field),
            expected: origVal,
            actual: repVal,
            message: `Execution discrepancy in ${String(field)}: original=${origVal}, replay=${repVal}`,
          });
        }
      } else if (origVal !== repVal) {
        mismatches.push({
          code: 'EXECUTION_MISMATCH',
          field: String(field),
          expected: origVal,
          actual: repVal,
          message: `Execution discrepancy in ${String(field)}: original=${origVal}, replay=${repVal}`,
        });
      }
    };

    checkField('status');
    checkField('success');
    checkField('side');
    checkField('symbol');
    checkField('requestedQuantity');
    checkField('executedQuantity');
    checkField('requestedPrice', 0.001);
    checkField('executedPrice', 0.001);
    checkField('fee', 0.01);
    checkField('tax', 0.01);
    checkField('slippage', 0.001);

    return mismatches;
  }

  /**
   * Constructs an invalid replay outcome.
   */
  static invalid(
    marketDataSnapshotId: string,
    mismatches: readonly ReplayMismatch[],
    error?: string
  ): ReplayResult {
    return {
      status: 'REPLAY_INVALID',
      marketDataSnapshotId,
      mismatches,
      deterministic: true,
      error: error || (mismatches.length > 0 ? mismatches[0].message : 'Replay validation failed'),
      replayedAt: new Date().toISOString(),
    };
  }

  /**
   * Constructs a mismatch replay outcome.
   */
  static mismatch(
    marketDataSnapshotId: string,
    original: ReplayExecutionSummary,
    replay: ReplayExecutionSummary,
    mismatches: readonly ReplayMismatch[]
  ): ReplayResult {
    return {
      status: 'REPLAY_MISMATCH',
      marketDataSnapshotId,
      originalExecution: original,
      replayExecution: replay,
      mismatches,
      deterministic: true,
      error: mismatches.length > 0 ? mismatches[0].message : 'Execution output did not match original',
      replayedAt: new Date().toISOString(),
    };
  }

  /**
   * Constructs a successful deterministic replay outcome.
   */
  static success(
    marketDataSnapshotId: string,
    original: ReplayExecutionSummary | undefined,
    replay: ReplayExecutionSummary
  ): ReplayResult {
    return {
      status: 'REPLAYED',
      marketDataSnapshotId,
      originalExecution: original,
      replayExecution: replay,
      mismatches: [],
      deterministic: true,
      replayedAt: new Date().toISOString(),
    };
  }

  /**
   * Constructs a non-deterministic execution failure.
   */
  static nonDeterministic(
    marketDataSnapshotId: string,
    run1: ReplayExecutionSummary,
    run2: ReplayExecutionSummary,
    mismatches: readonly ReplayMismatch[]
  ): ReplayResult {
    return {
      status: 'REPLAY_MISMATCH',
      marketDataSnapshotId,
      originalExecution: run1,
      replayExecution: run2,
      mismatches: [
        ...mismatches,
        {
          code: 'NON_DETERMINISTIC',
          field: 'executionRun',
          expected: 'Identical execution outcomes across identical runs',
          actual: 'Outputs diverged between consecutive runs',
          message: 'Execution engine produced non-deterministic outputs for identical input parameters',
        },
      ],
      deterministic: false,
      error: 'Non-deterministic execution detected across repeated replay iterations',
      replayedAt: new Date().toISOString(),
    };
  }
}
