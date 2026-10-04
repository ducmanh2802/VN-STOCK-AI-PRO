/**
 * DECISION OS SERVICE — orchestration only.
 * Pure math stays in src/lib/decision/**. Protected engines
 * (RiskGuard/PositionSizer/…) are consumed via injected callables,
 * never reimplemented here.
 */
import { DecisionChainBuilder, type DecisionChainInput } from '../../lib/decision/DecisionChainBuilder.ts';
import { ThesisEngine, type CreateThesisInput } from '../../lib/decision/ThesisEngine.ts';
import { RiskDecisionEngine, type RiskDecisionInput } from '../../lib/decision/RiskDecisionEngine.ts';
import { PositionIntegrationEngine, type SizerFn, type SizingIntegrationInput } from '../../lib/decision/PositionIntegrationEngine.ts';
import { MonitoringEngine, ReviewEngine, type CreateReviewInput, type MonitoredState } from '../../lib/decision/MonitoringEngine.ts';

export class DecisionOSService {
  buildDecision(input: DecisionChainInput) {
    return DecisionChainBuilder.build(input);
  }

  createThesis(input: CreateThesisInput) {
    return ThesisEngine.create(input);
  }

  evaluateRisk(input: RiskDecisionInput) {
    return RiskDecisionEngine.evaluate(input);
  }

  sizePosition(input: SizingIntegrationInput, sizer: SizerFn) {
    return PositionIntegrationEngine.integrate(input, sizer);
  }

  detectTriggers(state: MonitoredState) {
    const raw = MonitoringEngine.detect(state);
    return MonitoringEngine.falseTriggerGuard(raw, state.dataInvalid);
  }

  createReview(input: CreateReviewInput) {
    return ReviewEngine.create(input);
  }
}
