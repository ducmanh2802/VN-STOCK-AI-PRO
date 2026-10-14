export interface EodSchedulerConfig {
  readonly enabled: boolean;
}

export function readEodSchedulerConfig(): EodSchedulerConfig {
  return {
    enabled: process.env.EOD_INGEST_ENABLED === 'true',
  };
}

export class EodIngestionScheduler {
  constructor(
    _job: () => Promise<any>,
    _config: EodSchedulerConfig,
    _opts?: { needsCatchUp?: () => Promise<boolean> }
  ) {}

  start(): void {}
  stop(): void {}
}
