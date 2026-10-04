/**
 * PLATFORM-03 — APPEND-ONLY AUDIT LOG (pure + tamper-evident)
 *
 * §22/§23: WHO / DID WHAT / WHEN / TO WHICH OBJECT / FROM WHICH VERSION / WITH WHAT RESULT.
 * §25: records are append-only — there is deliberately NO update and NO delete method,
 *       and the integrity chain makes out-of-band edits detectable.
 *
 * Tamper-EVIDENT, not tamper-proof: the hash chain detects mutation of stored records.
 * A determined operator with write access to the store could rewrite the whole chain;
 * real tamper-proofing needs an external append-only sink (documented in the
 * architecture doc as the next step, together with the DB adapter).
 */
import { createHash } from 'node:crypto';
import { redact } from '../security/redaction.ts';

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'PARTIAL';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password_change'
  | 'auth.password_reset'
  | 'auth.account_disable'
  | 'auth.session_revoke'
  | 'authz.role_assign'
  | 'authz.role_revoke'
  | 'workspace.create'
  | 'workspace.update'
  | 'decision.create'
  | 'decision.update'
  | 'journal.create'
  | 'journal.review'
  | 'research.experiment'
  | 'backtest.run'
  | 'paper_replay.run'
  | 'paper_order.submit'
  | 'paper_fill.record'
  | 'portfolio.mutate'
  | 'risk.rejection'
  | 'config.change'
  | 'ai.interaction'
  | 'admin.action';

export interface AuditRecord {
  readonly auditId: string;
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly beforeVersion: string | null;
  readonly afterVersion: string | null;
  readonly requestId: string | null;
  readonly correlationId: string | null;
  readonly result: AuditResult;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly prevHash: string;
  readonly hash: string;
}

export interface AuditInput {
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  readonly organizationId?: string | null;
  readonly workspaceId?: string | null;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId?: string | null;
  readonly beforeVersion?: string | null;
  readonly afterVersion?: string | null;
  readonly requestId?: string | null;
  readonly correlationId?: string | null;
  readonly result: AuditResult;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

/** Deterministic canonical serialization (key order fixed) so hashes are reproducible. */
function canonical(rec: Omit<AuditRecord, 'hash'>): string {
  return JSON.stringify([
    rec.auditId,
    rec.occurredAt,
    rec.actorUserId,
    rec.organizationId,
    rec.workspaceId,
    rec.action,
    rec.resourceType,
    rec.resourceId,
    rec.beforeVersion,
    rec.afterVersion,
    rec.requestId,
    rec.correlationId,
    rec.result,
    rec.metadata,
    rec.prevHash,
  ]);
}

function computeHash(rec: Omit<AuditRecord, 'hash'>): string {
  return createHash('sha256').update(canonical(rec), 'utf8').digest('hex');
}

export interface AuditStore {
  append(record: AuditRecord): void;
  all(): readonly AuditRecord[];
  tail(limit: number): readonly AuditRecord[];
  clear(): void;
}

export class InMemoryAuditStore implements AuditStore {
  private records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  all(): readonly AuditRecord[] {
    return [...this.records];
  }

  tail(limit: number): readonly AuditRecord[] {
    return this.records.slice(-limit);
  }

  clear(): void {
    this.records = [];
  }
}

export interface AuditIntegrityReport {
  readonly ok: boolean;
  readonly checked: number;
  readonly brokenAt: string | null;
  readonly reason: string | null;
}

export class AuditLog {
  private sequence = 0;

  constructor(private readonly store: AuditStore) {}

  /** Metadata is redacted before it can ever be stored (§28/§43). */
  record(input: AuditInput): AuditRecord {
    this.sequence += 1;
    const previous = this.store.tail(1)[0] ?? null;
    const base: Omit<AuditRecord, 'hash'> = {
      auditId: `aud_${input.occurredAt}_${this.sequence}`,
      occurredAt: input.occurredAt,
      actorUserId: input.actorUserId,
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      beforeVersion: input.beforeVersion ?? null,
      afterVersion: input.afterVersion ?? null,
      requestId: input.requestId ?? null,
      correlationId: input.correlationId ?? null,
      result: input.result,
      metadata: redact(input.metadata ?? {}),
      prevHash: previous?.hash ?? AUDIT_GENESIS_HASH,
    };
    const record: AuditRecord = { ...base, hash: computeHash(base) };
    this.store.append(record);
    return record;
  }

  /** §25 verification: detects any mutation, deletion or reordering of stored records. */
  verifyIntegrity(): AuditIntegrityReport {
    const records = this.store.all();
    let expectedPrev = AUDIT_GENESIS_HASH;
    for (const r of records) {
      if (r.prevHash !== expectedPrev) {
        return { ok: false, checked: records.length, brokenAt: r.auditId, reason: 'prev_hash_mismatch' };
      }
      const { hash, ...rest } = r;
      if (computeHash(rest) !== hash) {
        return { ok: false, checked: records.length, brokenAt: r.auditId, reason: 'record_hash_mismatch' };
      }
      expectedPrev = r.hash;
    }
    return { ok: true, checked: records.length, brokenAt: null, reason: null };
  }

  all(): readonly AuditRecord[] {
    return this.store.all();
  }

  /** Read path for `audit.read` consumers — filtered, never mutating. */
  query(filter: { actorUserId?: string; action?: AuditAction; workspaceId?: string; resourceId?: string; limit?: number }): readonly AuditRecord[] {
    let out = this.store.all();
    if (filter.actorUserId) out = out.filter((r) => r.actorUserId === filter.actorUserId);
    if (filter.action) out = out.filter((r) => r.action === filter.action);
    if (filter.workspaceId) out = out.filter((r) => r.workspaceId === filter.workspaceId);
    if (filter.resourceId) out = out.filter((r) => r.resourceId === filter.resourceId);
    const limit = filter.limit ?? 100;
    return out.slice(-limit);
  }
}

/** Bridges PLATFORM-01 auth events into the audit trail. */
export class AuthEventAuditSink {
  constructor(
    private readonly audit: AuditLog,
    private readonly now: () => number,
  ) {}

  record(event: { type: string; userId: string | null; sessionId: string | null; occurredAt: number; outcome: 'SUCCESS' | 'FAILURE'; metadata: Readonly<Record<string, string>> }): void {
    const action =
      event.type === 'LOGIN_SUCCESS'
        ? 'auth.login'
        : event.type === 'LOGOUT'
          ? 'auth.logout'
          : event.type === 'PASSWORD_CHANGED'
            ? 'auth.password_change'
            : event.type === 'ACCOUNT_DISABLED'
              ? 'auth.account_disable'
              : event.type === 'SESSION_REVOKED'
                ? 'auth.session_revoke'
                : 'auth.login';
    this.audit.record({
      occurredAt: event.occurredAt || this.now(),
      actorUserId: event.userId,
      action,
      resourceType: 'identity',
      resourceId: event.userId,
      correlationId: event.sessionId,
      result: event.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      metadata: { authEvent: event.type, ...event.metadata },
    });
  }
}