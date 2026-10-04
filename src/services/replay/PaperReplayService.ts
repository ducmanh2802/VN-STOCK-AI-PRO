/**
 * PAPER REPLAY SERVICE — orchestration only.
 * PAPER ONLY: every execution path goes through the injected SIMULATION port.
 * Pure math stays in src/lib/replay/**.
 */
import {
  PaperReplayEngine,
  ReplayComparison,
  ReplayManifestEngine,
  ReplayAccounting,
  ReplayReconciliation,
  ReplayStateMachine,
  type CreateManifestInput,
  type ReplayRunInput,
  type ReplayPorts,
  type BacktestSummary,
  type PaperReplaySummary,
} from '../../lib/replay/index.ts';

export class PaperReplayService {
  createManifest(input: CreateManifestInput) {
    return ReplayManifestEngine.create(input);
  }

  assertPaperOnly(ports: ReplayPorts): { readonly ok: boolean; readonly reason: string | null } {
    if (!ports.executionPort.isSimulation) {
      return { ok: false, reason: 'EXECUTION_PORT_NOT_SIMULATION' };
    }
    return { ok: true, reason: null };
  }

  run(input: ReplayRunInput) {
    return PaperReplayEngine.run(input);
  }

  canTransition(from: Parameters<typeof ReplayStateMachine.canTransition>[0], to: Parameters<typeof ReplayStateMachine.canTransition>[1]) {
    return ReplayStateMachine.canTransition(from, to);
  }

  compare(bt: BacktestSummary, pr: PaperReplaySummary) {
    return ReplayComparison.compare(bt, pr);
  }

  verifyAccounting(input: Parameters<typeof ReplayAccounting.verify>[0]) {
    return ReplayAccounting.verify(input);
  }

  reconcile(input: Parameters<typeof ReplayReconciliation.reconcile>[0]) {
    return ReplayReconciliation.reconcile(input);
  }
}