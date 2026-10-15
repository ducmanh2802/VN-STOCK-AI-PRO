export interface AuthEvent {
  type: string;
  userId?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface AuthEventSink {
  record(event: AuthEvent): void;
}

export class InMemoryAuthEventSink implements AuthEventSink {
  private events: AuthEvent[] = [];
  record(e: AuthEvent) {
    this.events.push(e);
  }
  list(): AuthEvent[] {
    return [...this.events];
  }
}
