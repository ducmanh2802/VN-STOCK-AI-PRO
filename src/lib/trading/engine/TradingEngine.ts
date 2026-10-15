import type { PaperBroker } from '../paper/PaperBroker.ts';

export interface TradingEngineOptions {
  broker?: PaperBroker;
}

export class TradingEngine {
  readonly broker?: PaperBroker;

  constructor(options?: TradingEngineOptions) {
    this.broker = options?.broker;
  }

  getStatus() {
    return {
      status: 'IDLE',
      broker: this.broker ? 'PAPER_READY' : 'NONE',
    };
  }
}
