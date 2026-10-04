/**
 * RESEARCH SERVICE — orchestration only.
 * Pure math stays in src/lib/research/**. Protected engines
 * (TradeSimulator/LookAheadGuard/PositionSizer/…) consumed via contracts.
 */
import { ExperimentEngine, type CreateExperimentInput } from '../../lib/research/ExperimentEngine.ts';
import { EventBacktestEngine, type BacktestRunInput } from '../../lib/research/EventBacktestEngine.ts';
import { ValidationEngine } from '../../lib/research/ValidationEngine.ts';
import { AuditEngine } from '../../lib/research/AuditEngine.ts';

export class ResearchService {
  createExperiment(input: CreateExperimentInput) {
    return ExperimentEngine.create(input);
  }

  runBacktest(input: BacktestRunInput) {
    return EventBacktestEngine.run(input);
  }

  split(dates: readonly string[], trainRatio?: number, validationRatio?: number) {
    return ValidationEngine.split(dates, trainRatio, validationRatio);
  }

  walkForward(dates: readonly string[], train: number, val: number, test: number, step: number) {
    return ValidationEngine.walkForward(dates, train, val, test, step);
  }

  auditMetrics(input: Parameters<typeof AuditEngine.metrics>[0]) {
    return AuditEngine.metrics(input);
  }
}
