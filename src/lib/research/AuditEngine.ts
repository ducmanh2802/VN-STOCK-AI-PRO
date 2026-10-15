export interface CertificationCriteria {
  pitValid: boolean;
  noLookahead: boolean;
  survivorshipControlled: boolean;
  costPresent: boolean;
  oosTested: boolean;
  reproducible: boolean;
  accountingValid: boolean;
  limitationsDocumented: boolean;
}

export interface MetricInputs {
  initialCapital: number;
  equity: number[];
  tradeReturns: number[];
  turnover: number;
  exposure: number;
}

export class AuditEngine {
  static certify(criteria: CertificationCriteria): 'CERTIFIED' | 'REJECTED' {
    const passed =
      criteria.pitValid &&
      criteria.noLookahead &&
      criteria.survivorshipControlled &&
      criteria.costPresent &&
      criteria.oosTested &&
      criteria.reproducible &&
      criteria.accountingValid &&
      criteria.limitationsDocumented;
    return passed ? 'CERTIFIED' : 'REJECTED';
  }

  static metrics(inputs: MetricInputs) {
    const initial = inputs.initialCapital || 100_000_000;
    const finalEquity = inputs.equity.length > 0 ? inputs.equity[inputs.equity.length - 1] : initial;
    const totalReturn = initial > 0 ? (finalEquity - initial) / initial : 0;

    return {
      initialCapital: initial,
      finalEquity,
      totalReturn,
      turnover: inputs.turnover,
      exposure: inputs.exposure,
      tradeCount: inputs.tradeReturns.length,
    };
  }
}
