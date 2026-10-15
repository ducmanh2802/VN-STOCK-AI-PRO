/**
 * PLATFORM-04 — STRUCTURED LOGGER (§34/§35)
 *
 * One log line = one JSON object with the §34 minimum fields, redacted through the
 * PLATFORM-03 chokepoint. Level filtering is explicit so a market-data tick storm
 * cannot destroy observability by default.
 *
 * There is deliberately no dependency on a logging library, and no PII/secret can
 * reach output: the redaction layer runs on every field before serialisation.
 */
import { redact } from '../security/redaction.ts';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

export interface LogFields {
  readonly requestId?: string | null;
  readonly correlationId?: string | null;
  readonly service?: string;
  readonly event?: string;
  readonly durationMs?: number | null;
  readonly status?: number | string | null;
  readonly [key: string]: unknown;
}

export interface LogLine extends LogFields {
  readonly timestamp: string;
  readonly level: LogLevel;
}

export interface LogSink {
  write(line: LogLine): void;
}

export class MemoryLogSink implements LogSink {
  private readonly lines: LogLine[] = [];

  write(line: LogLine): void {
    this.lines.push(line);
  }

  all(): readonly LogLine[] {
    return [...this.lines];
  }

  clear(): void {
    this.lines.length = 0;
  }
}

export class ConsoleLogSink implements LogSink {
  write(line: LogLine): void {
    const out = JSON.stringify(line);
    if (line.level === 'ERROR') console.error(out);
    else if (line.level === 'WARN') console.warn(out);
    else console.log(out);
  }
}

export class StructuredLogger {
  constructor(
    private readonly sink: LogSink,
    private readonly minLevel: LogLevel = 'INFO',
    private readonly service = 'platform',
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private emit(level: LogLevel, fields: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const safe = redact(fields);
    this.sink.write({
      timestamp: new Date(this.clock()).toISOString(),
      level,
      service: this.service,
      ...safe,
    } as LogLine);
  }

  debug(fields: LogFields): void {
    this.emit('DEBUG', fields);
  }

  info(fields: LogFields): void {
    this.emit('INFO', fields);
  }

  warn(fields: LogFields): void {
    this.emit('WARN', fields);
  }

  error(fields: LogFields): void {
    this.emit('ERROR', fields);
  }

  child(service: string, extra: LogFields = {}): StructuredLogger {
    const sink = this.sink;
    const minLevel = this.minLevel;
    const clock = this.clock;
    const parent = this;
    return new StructuredLogger(
      {
        write: (line) => sink.write({ ...line, ...redact(extra) } as LogLine),
      },
      minLevel,
      service,
      clock,
    );
    void parent;
  }
}

/** Maps HTTP status codes to a level without inventing new ones. */
export function levelForStatus(status: number): LogLevel {
  if (status >= 500) return 'ERROR';
  if (status >= 400) return 'WARN';
  return 'INFO';
}