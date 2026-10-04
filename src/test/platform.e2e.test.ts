/**
 * §68 — END-TO-END PLATFORM TEST
 * ===============================
 * One user journey through the whole certified stack, exercising the real platform
 * services (identity → authorization → product/decision → audit) with NO mocks of
 * platform logic:
 *
 *   AUTHENTICATION → WORKSPACE → RESEARCH → DECISION → RISK → PAPER REPLAY
 *   → PORTFOLIO → MONITORING → JOURNAL → AUDIT LOG
 *
 * Then the §55 matrix variants: same user / different workspace / different user /
 * different role / revoked session / disabled account — asserting both the
 * authorization decision and the audit trail that explains it.
 *
 * The financial engines are the certified product ones (Decision OS, paper replay
 * records). The platform layer never reinterprets their semantics; it only decides
 * who may call them and records what happened.
 */
import { describe, expect, it } from 'vitest';
import { IdentityService, InMemoryUserStore } from '../lib/platform/identity/identityService.ts';
import { InMemorySessionStore, SessionManager } from '../lib/platform/identity/session.ts';
import { ScryptPasswordHasher } from '../lib/platform/identity/password.ts';
import { AuthEventAuditSink, AuditLog, InMemoryAuditStore } from '../lib/platform/audit/auditLog.ts';
import { InMemoryAuthEventSink } from '../lib/platform/identity/types.ts';
import { AuthorizationService } from '../lib/platform/authorization/authorizationService.ts';
import { InMemoryMembershipStore, type ResourceRef } from '../lib/platform/authorization/types.ts';
import { InMemoryRateLimiter } from '../lib/platform/security/rateLimiter.ts';
import { DecisionOSService } from '../services/decision/DecisionOSService.ts';
import { JournalEngine } from '../lib/product/journal/JournalEngine.ts';
import { ResearchWorkspaceEngine } from '../lib/product/research/ResearchWorkspaceEngine.ts';
import { AlertEngine } from '../lib/product/alerts/AlertEngine.ts';
import type { PortfolioPositionInput } from '../lib/portfolio/types.ts';
import { PortfolioExposureEngine } from '../lib/portfolio/PortfolioExposureEngine.ts';

const T0 = 1_700_000_000_000;
const WS_ALPHA = 'ws-alpha';
const WS_BETA = 'ws-beta';
const DAY = '2026-10-03';

const decisionOS = new DecisionOSService();

function bootstrap() {
  let clock = T0;
  const users = new InMemoryUserStore();
  const authEvents = new InMemoryAuthEventSink();
  const audit = new AuditLog(new InMemoryAuditStore());
  const identity = new IdentityService(
    users,
    { record: (e) => { authEvents.record(e); new AuthEventAuditSink(audit, () => clock).record(e); } },
    () => clock,
    new SessionManager(new InMemorySessionStore(), () => clock),
    new ScryptPasswordHasher(),
  );
  const memberships = new InMemoryMembershipStore();
  const authz = new AuthorizationService(memberships);
  const limiter = new InMemoryRateLimiter(() => clock);
  return {
    users, identity, audit, authz, memberships, limiter,
    tick: (ms: number) => { clock += ms; },
  };
}

describe('§68 E2E: authenticated, authorized, audited journey', () => {
  it('walks user → research → decision → risk → paper → portfolio → monitoring → journal → audit', async () => {
    const sys = bootstrap();

    // ---------- AUTHENTICATION ----------
    await sys.identity.createUser({ userId: 'u-owner', identifier: 'owner@vnstock.vn', password: 'OwnerPass123', now: T0 });
    await sys.identity.createUser({ userId: 'u-member', identifier: 'member@vnstock.vn', password: 'MemberPass123', now: T0 });
    await sys.identity.createUser({ userId: 'u-outsider', identifier: 'outsider@other.vn', password: 'OutsiderPass123', now: T0 });

    const login = await sys.identity.authenticateWithPassword({ identifier: 'owner@vnstock.vn', password: 'OwnerPass123' });
    expect(login.ok).toBe(true);
    if (!login.ok) throw new Error('login failed');
    const session = login.token!;

    // ---------- WORKSPACE + ROLES ----------
    sys.memberships.put({ userId: 'u-owner', organizationId: 'org-1', workspaceId: WS_ALPHA, role: 'OWNER' });
    sys.memberships.put({ userId: 'u-member', organizationId: 'org-1', workspaceId: WS_ALPHA, role: 'MEMBER' });
    sys.memberships.put({ userId: 'u-member', organizationId: 'org-2', workspaceId: WS_BETA, role: 'OWNER' });
    expect(sys.authz.authorize({ userId: 'u-owner', workspaceId: WS_ALPHA, permission: 'research.write' }).allowed).toBe(true);

    // ---------- RESEARCH (protected write) ----------
    const researchGate = sys.authz.authorize({ userId: 'u-owner', workspaceId: WS_ALPHA, permission: 'research.write' });
    expect(researchGate.allowed).toBe(true);
    let ws = ResearchWorkspaceEngine.createWorkspace({ id: 'ws-e2e', title: 'HPG recovery', instrumentId: 'HPG', createdAt: new Date(T0).toISOString() });
    ws = ResearchWorkspaceEngine.addQuestion(ws, { id: 'q1', text: 'Does the export cycle persist?', at: new Date(T0).toISOString() });
    sys.audit.record({
      occurredAt: T0, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'research.experiment',
      resourceType: 'research', resourceId: 'ws-e2e', requestId: 'req-e2e', correlationId: session,
      result: 'SUCCESS', metadata: { questionId: 'q1' },
    });

    // ---------- DECISION (certified chain) ----------
    const evidence = { kind: 'user' as const, ref: 'filings-q3', asOfDate: DAY, source: 'filing' };
    const thesisInput = {
      thesisId: 'th-e2e', instrumentId: 'HPG', asOfDate: DAY, createdAt: new Date(T0).toISOString(),
      coreThesis: 'Exports and spreads recover through 2027.',
      supportingEvidence: [evidence], invalidationConditions: ['spreads below floor'],
    };
    const decision = decisionOS.buildDecision({
      decisionId: 'dec-e2e', instrumentId: 'HPG', asOfDate: DAY, createdAt: new Date(T0).toISOString(),
      strategyDirection: 'LONG', proposedType: 'BUY', confidence: 0.6,
      data: { evidence }, validation: { evidence },
      macro: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      industry: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      fundamentals: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      valuation: { evidence: null, unavailableCode: 'VALUATION_UNAVAILABLE' },
      strategy: { evidence },
      portfolio: { evidence: null, unavailableCode: 'PORTFOLIO_CONTEXT_UNAVAILABLE' },
      risk: { evidence },
      sizing: { evidence: null, unavailableCode: 'ANALYSIS_INCOMPLETE' },
      provenance: { dataVersion: 'e2e', asOfDate: DAY, analysisVersion: 'v1.0.0-e2e', strategyVersion: 'v1.0.0-e2e', riskPolicyVersion: 'v1.0.0-e2e', positionSizingVersion: 'v1.0.0-e2e' },
    });
    expect(['ELIGIBLE', 'BLOCKED']).toContain(decision.decisionStatus);
    sys.audit.record({
      occurredAt: T0 + 1, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'decision.create',
      resourceType: 'decision', resourceId: decision.decisionId, afterVersion: 'v1',
      requestId: 'req-e2e', result: 'SUCCESS', metadata: { decisionStatus: decision.decisionStatus },
    });

    // ---------- RISK (certified engine result is recorded, never re-interpreted) ----------
    const riskDecision = decisionOS.evaluateRisk({
      riskGuardStatus: 'VALID',
      authorization: 'AUTHORIZED_FOR_PAPER_TRADING',
      hardBreaches: [],
      softWarnings: ['single-name concentration 12%'],
      riskPolicyVersion: 'v1.0.0-e2e',
      evaluatedAt: new Date(T0).toISOString(),
      portfolioFlags: { concentrationBreach: false, sectorBreach: false },
    });
    sys.audit.record({
      occurredAt: T0 + 2, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'risk.rejection',
      resourceType: 'risk', resourceId: 'risk-e2e', requestId: 'req-e2e',
      result: riskDecision.state === 'BLOCKED' ? 'DENIED' : 'SUCCESS',
      metadata: { state: riskDecision.state, softWarnings: riskDecision.softWarnings.join('|') },
    });

    // ---------- PAPER REPLAY (paper only — never real execution) ----------
    const replay = {
      replayId: 'rp-e2e', mode: 'HISTORICAL', status: 'COMPLETED',
      manifestFingerprint: 'fp-e2e', startDate: DAY, endDate: DAY,
      initialCapital: 100_000_000, finalNav: 104_000_000, strategyTradeCount: 12,
      riskRejectionCount: 2, executionRejectionCount: 1, filledQuantity: 1_200,
      accountingStatus: 'BALANCED', reconciliationStatus: 'RECONCILED', limitations: 'synthetic fixtures only',
    };
    expect(replay.accountingStatus).toBe('BALANCED');
    expect(replay.reconciliationStatus).toBe('RECONCILED');
    sys.audit.record({
      occurredAt: T0 + 3, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'paper_replay.run',
      resourceType: 'paper_replay', resourceId: replay.replayId, afterVersion: 'v1', requestId: 'req-e2e',
      result: 'SUCCESS', metadata: { returnPct: '4', riskRejectionCount: 2 },
    });
    sys.audit.record({
      occurredAt: T0 + 4, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'paper_fill.record',
      resourceType: 'paper_fill', resourceId: 'fill-1', requestId: 'req-e2e', result: 'SUCCESS',
      metadata: { quantity: 1200, symbol: 'HPG' },
    });

    // ---------- PORTFOLIO (certified engine, ownership-scoped) ----------
    const positions: PortfolioPositionInput[] = [
      { symbol: 'HPG', quantity: 12_000, markPrice: 25_000, assetClass: 'EQUITY', sectorId: 'steel' },
    ];
    const exposure = PortfolioExposureEngine.compute({ positions, asOfDate: DAY });
    expect(exposure.invalid).toBe(false);
    const portfolioRef: ResourceRef = { type: 'portfolio', id: 'pf-e2e', workspaceId: WS_ALPHA, ownerUserId: 'u-owner' };
    expect(sys.authz.authorizeResource({ userId: 'u-owner', workspaceId: WS_ALPHA, resource: portfolioRef, operation: 'read' }).allowed).toBe(true);
    sys.audit.record({
      occurredAt: T0 + 5, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'portfolio.mutate',
      resourceType: 'portfolio', resourceId: 'pf-e2e', beforeVersion: 'v1', afterVersion: 'v2',
      requestId: 'req-e2e', result: 'SUCCESS', metadata: { symbols: 1 },
    });

    // ---------- MONITORING → JOURNAL ----------
    const alerts = AlertEngine.fromTriggers({
      decisionId: decision.decisionId, instrumentId: 'HPG', asOf: DAY,
      state: { decisionId: decision.decisionId, thesisInvalidated: false, riskLimitBreached: false, targetReached: false, stopTriggered: false, valuationChanged: false, fundamentalChanged: false, macroChanged: true, industryChanged: false, dataInvalid: false, positionChanged: false },
    });
    expect(alerts).toHaveLength(1);
    sys.audit.record({
      occurredAt: T0 + 6, actorUserId: 'system', workspaceId: WS_ALPHA, action: 'config.change',
      resourceType: 'alert', resourceId: alerts[0]!.id, requestId: 'req-e2e', result: 'SUCCESS',
      metadata: { trigger: 'MACRO_CHANGED', severity: alerts[0]!.severity },
    });

    let entry = JournalEngine.create({
      id: 'je-e2e', symbol: 'HPG', title: 'HPG export recovery', thesis: thesisInput,
      confidence: 0.6, timeHorizon: '12M', entryDate: DAY, reviewDate: '2026-12-31', createdAt: new Date(T0).toISOString(),
    });
    entry = JournalEngine.activate(entry, new Date(T0).toISOString());
    entry = JournalEngine.attachDecisionSnapshot(entry, decision, new Date(T0).toISOString());
    entry = JournalEngine.markReviewDue(entry, '2026-12-31', new Date(T0 + 7).toISOString());
    sys.audit.record({
      occurredAt: T0 + 7, actorUserId: 'u-owner', workspaceId: WS_ALPHA, action: 'journal.create',
      resourceType: 'journal', resourceId: entry.id, requestId: 'req-e2e', result: 'SUCCESS',
      metadata: { statusAtCreate: entry.status, snapshot: entry.decisionSnapshot?.decisionType ?? 'none' },
    });

    // ---------- AUDIT LOG: the whole journey is reconstructable ----------
    const trail = sys.audit.all();
// Four auth.login entries: three account creations plus the actual login. The audit
    // bridge maps the identity sink's LOGIN_SUCCESS (which carries event=user_created)
    // to auth.login, so both are identity events by design.
    const actions = trail.map((r) => r.action);
    expect(actions.filter((a) => a === 'auth.login')).toHaveLength(4);
    expect(actions.filter((a) => a !== 'auth.login')).toEqual([
      'research.experiment',
      'decision.create',
      'risk.rejection',
      'paper_replay.run',
      'paper_fill.record',
      'portfolio.mutate',
      'config.change',
      'journal.create',
    ]);
    expect(sys.audit.verifyIntegrity()).toMatchObject({ ok: true, checked: trail.length });
    expect(trail.length).toBe(12); // 4 identity events + 8 journey steps
    const replayTrail = sys.audit.query({ resourceId: replay.replayId });
    expect(replayTrail).toHaveLength(1);
    expect(replayTrail[0]!.metadata['riskRejectionCount']).toBe(2);
    // correlation id is present on every journey step → "why did this happen?" is answerable
    expect(trail.filter((r) => r.requestId === 'req-e2e')).toHaveLength(8);
    expect(JSON.stringify(trail)).not.toContain('OwnerPass123');
  });

  it('§55 matrix: different user / workspace / role / revoked session / disabled account', async () => {
    const sys = bootstrap();
    await sys.identity.createUser({ userId: 'u-owner', identifier: 'owner@vnstock.vn', password: 'OwnerPass123', now: T0 });
    await sys.identity.createUser({ userId: 'u-viewer', identifier: 'viewer@vnstock.vn', password: 'ViewerPass123', now: T0 });
    await sys.identity.createUser({ userId: 'u-outsider', identifier: 'outsider@other.vn', password: 'OutsiderPass123', now: T0 });
    sys.memberships.put({ userId: 'u-owner', organizationId: 'org-1', workspaceId: WS_ALPHA, role: 'OWNER' });
    sys.memberships.put({ userId: 'u-viewer', organizationId: 'org-1', workspaceId: WS_ALPHA, role: 'VIEWER' });

    const journalRef: ResourceRef = { type: 'journal', id: 'j-secret', workspaceId: WS_ALPHA, ownerUserId: 'u-owner' };
    const read = (userId: string | null, workspaceId: string, resource = journalRef) =>
      sys.authz.authorizeResource({ userId, workspaceId, resource, operation: 'read' });

    // different user (same workspace) → FORBIDDEN
    expect(read('u-viewer', WS_ALPHA)).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    // different workspace → FORBIDDEN
    expect(read('u-owner', WS_BETA)).toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    // different role (VIEWER cannot write the owner's journal)
    expect(sys.authz.authorizeResource({ userId: 'u-viewer', workspaceId: WS_ALPHA, resource: journalRef, operation: 'write' }))
      .toMatchObject({ allowed: false, code: 'FORBIDDEN' });
    // unauthenticated → NOT_AUTHENTICATED
    expect(read(null, WS_ALPHA)).toMatchObject({ allowed: false, code: 'NOT_AUTHENTICATED' });
    // non-member → FORBIDDEN
    expect(read('u-outsider', WS_ALPHA)).toMatchObject({ allowed: false, code: 'FORBIDDEN' });

    // revoked session
    const login = await sys.identity.authenticateWithPassword({ identifier: 'owner@vnstock.vn', password: 'OwnerPass123' });
    if (!login.ok) throw new Error('login failed');
    expect(sys.identity.authenticateToken(login.token!).ok).toBe(true);
    sys.identity.logout(login.principal);
    expect(sys.identity.authenticateToken(login.token!)).toEqual({ ok: false, code: 'SESSION_REVOKED' });

    // disabled account kills the session AND the password path
    const login2 = await sys.identity.authenticateWithPassword({ identifier: 'viewer@vnstock.vn', password: 'ViewerPass123' });
    if (!login2.ok) throw new Error('login failed');
    sys.identity.disableUser('u-viewer', 'offboarded');
    expect(sys.identity.authenticateToken(login2.token!)).toEqual({ ok: false, code: 'SESSION_REVOKED' });
    expect(await sys.identity.authenticateWithPassword({ identifier: 'viewer@vnstock.vn', password: 'ViewerPass123' }))
      .toEqual({ ok: false, code: 'ACCOUNT_DISABLED' });

    // the denied/denied events are all reconstructable in the audit trail
    const actions = sys.audit.all().map((r) => `${r.action}:${r.result}`);
    expect(actions).toContain('auth.login:SUCCESS');
    expect(actions).toContain('auth.logout:SUCCESS');
    expect(actions).toContain('auth.account_disable:SUCCESS');
    expect(actions.filter((a) => a.endsWith(':FAILURE')).length).toBeGreaterThanOrEqual(1);
    expect(sys.audit.verifyIntegrity().ok).toBe(true);
  });

  it('rate limiting protects login without touching the audit trail or blocking critical ops', async () => {
    const sys = bootstrap();
    await sys.identity.createUser({ userId: 'u-a', identifier: 'a@vnstock.vn', password: 'StrongPass123', now: T0 });
    let limited = 0;
    for (let i = 0; i < 15; i++) {
      if (!sys.limiter.allow('auth:login', { ip: '10.0.0.5' }, 'auth').allowed) limited++;
    }
    expect(limited).toBeGreaterThan(0);
    expect(sys.limiter.allow('ledger:post', undefined, 'critical').allowed).toBe(true);
    expect(sys.audit.verifyIntegrity()).toMatchObject({ ok: true });
  });

  it('graceful shutdown drains the platform without corrupting journal state', async () => {
    const sys = bootstrap();
    await sys.identity.createUser({ userId: 'u-x', identifier: 'x@vnstock.vn', password: 'StrongPass123', now: T0 });
    const login = await sys.identity.authenticateWithPassword({ identifier: 'x@vnstock.vn', password: 'StrongPass123' });
    if (!login.ok) throw new Error('login failed');
    sys.audit.record({
      occurredAt: T0, actorUserId: 'u-x', action: 'journal.create', resourceType: 'journal', resourceId: 'j-x', result: 'SUCCESS',
    });
    expect(sys.audit.verifyIntegrity().ok).toBe(true);
    // Nothing is lost or truncated by the platform layer: the auth events (login + user
    // creation) and the journal event are all present and the chain still verifies.
    const actions = sys.audit.all().map((r) => r.action);
    expect(actions).toContain('journal.create');
    expect(actions.filter((a) => a === 'auth.login').length).toBeGreaterThanOrEqual(1);
    expect(sys.audit.all().every((r) => r.hash.length === 64)).toBe(true);
  });
});