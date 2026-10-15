export class MemoryLogSink {
  public logs: any[] = [];
  write(entry: any) { this.logs.push(entry); }
}

export class StructuredLogger {
  constructor(
    public readonly sink: MemoryLogSink,
    public readonly level: string,
    public readonly context: string,
    public readonly now: () => number
  ) {}

  info(msg: string, meta?: any) {
    this.sink.write({ level: 'INFO', msg, meta, ts: this.now() });
  }
  error(msg: string, meta?: any) {
    this.sink.write({ level: 'ERROR', msg, meta, ts: this.now() });
  }
  warn(msg: string, meta?: any) {
    this.sink.write({ level: 'WARN', msg, meta, ts: this.now() });
  }
  debug(msg: string, meta?: any) {
    this.sink.write({ level: 'DEBUG', msg, meta, ts: this.now() });
  }
}
