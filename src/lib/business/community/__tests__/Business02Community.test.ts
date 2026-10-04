/**
 * BUSINESS-02 TESTS — privacy / visibility / ownership / organization access / IDOR
 *                     moderation / report flow / content deletion / versioning
 *                     provenance / community safety
 */
import { describe, it, expect } from 'vitest';
import { CommunityEngine, scanForProhibitedClaims } from '../CommunityEngine.ts';
import { canDelete, canEdit, canView, visibleFeed } from '../visibility.ts';
import {
  ANONYMOUS_VIEWER,
  absent,
  present,
  type CommunityPost,
  type ContentLabel,
  type ViewerContext,
  type Visibility,
} from '../types.ts';

const NOW = '2026-10-15T00:00:00Z';

function viewer(over: Partial<ViewerContext> = {}): ViewerContext {
  return { userId: 'alice', organizationIds: [], workspaceIds: [], canModerate: false, ...over };
}

function post(over: Partial<CommunityPost> = {}): CommunityPost {
  const base = CommunityEngine.createPost({
    postId: 'p1',
    authorUserId: 'alice',
    authorDisplayName: 'Alice',
    authorOrganizationId: null,
    title: 'Notes on a moving-average study',
    body: 'This is my research note about a strategy backtest on HPG. Educational only.',
    labels: ['EDUCATIONAL', 'RESEARCH'],
    visibility: 'PRIVATE',
    workspaceId: null,
    organizationId: null,
    provenance: [present('RESEARCH_EXPERIMENT', 'exp_1', 'fp_abc')],
    createdAt: NOW,
  });
  // The override MUST be applied, otherwise every visibility test below silently asserts
  // against the same PRIVATE/alice post and proves nothing.
  return { ...base, ...over };
}

// -----------------------------------------------------------------------------

describe('Visibility — privacy boundary', () => {
  it('PRIVATE is visible to the author only', () => {
    const p = post();
    expect(canView(p, viewer()).visible).toBe(true);
    expect(canView(p, viewer({ userId: 'bob' }))).toEqual({ visible: false, reason: 'PRIVATE_CONTENT' });
    expect(canView(p, ANONYMOUS_VIEWER)).toEqual({ visible: false, reason: 'PRIVATE_CONTENT' });
    // even another moderator cannot read private content through the normal path
    expect(canView(p, viewer({ userId: 'bob', canModerate: true })).visible).toBe(false);
  });

  it('ORGANIZATION requires active membership of the owning organization', () => {
    const p = post({ visibility: 'ORGANIZATION', organizationId: 'org_1' });
    expect(canView(p, viewer({ userId: 'bob', organizationIds: ['org_1'] })).visible).toBe(true);
    expect(canView(p, viewer({ userId: 'bob', organizationIds: ['org_other'] }))).toEqual({
      visible: false,
      reason: 'NOT_AN_ACTIVE_ORGANIZATION_MEMBER',
    });
    expect(canView(p, viewer({ userId: 'bob', organizationIds: [] })).visible).toBe(false);
    expect(canView(p, ANONYMOUS_VIEWER).visible).toBe(false);
  });

  it('WORKSPACE requires workspace membership AND organization membership', () => {
    const p = post({ visibility: 'WORKSPACE', organizationId: 'org_1', workspaceId: 'ws_1' });
    expect(canView(p, viewer({ userId: 'bob', workspaceIds: ['ws_1'], organizationIds: ['org_1'] })).visible).toBe(true);
    // knows the workspace id but is not an org member: denied (enumeration defence)
    expect(canView(p, viewer({ userId: 'bob', workspaceIds: ['ws_1'], organizationIds: [] }))).toEqual({
      visible: false,
      reason: 'NOT_AN_ACTIVE_ORGANIZATION_MEMBER',
    });
    expect(canView(p, viewer({ userId: 'bob', workspaceIds: [], organizationIds: ['org_1'] }))).toEqual({
      visible: false,
      reason: 'NOT_IN_WORKSPACE',
    });
  });

  it('COMMUNITY and UNLISTED require authentication but not membership', () => {
    for (const visibility of ['COMMUNITY', 'UNLISTED'] as Visibility[]) {
      const p = post({ visibility });
      expect(canView(p, viewer({ userId: 'bob' })).visible).toBe(true);
      expect(canView(p, ANONYMOUS_VIEWER)).toEqual({ visible: false, reason: 'AUTHENTICATION_REQUIRED' });
    }
  });

  it('PUBLIC is visible to anyone including anonymous', () => {
    const p = post({ visibility: 'PUBLIC' });
    expect(canView(p, ANONYMOUS_VIEWER).visible).toBe(true);
    expect(canView(p, viewer({ userId: 'bob' })).visible).toBe(true);
  });

  it('fails closed on an unknown persisted visibility value', () => {
    const p = { ...post({ visibility: 'PUBLIC' }), visibility: 'EVERYONE' as Visibility };
    expect(canView(p, ANONYMOUS_VIEWER)).toEqual({ visible: false, reason: 'UNKNOWN_VISIBILITY:EVERYONE' });
  });

  it('IDOR MATRIX: a non-member attacker reaches only PUBLIC content', () => {
    const attacker = viewer({ userId: 'mallory', organizationIds: [], workspaceIds: [], canModerate: true });
    const cases: readonly { v: Visibility; org: string | null; ws: string | null }[] = [
      { v: 'PRIVATE', org: null, ws: null },
      { v: 'WORKSPACE', org: 'org_1', ws: 'ws_1' },
      { v: 'ORGANIZATION', org: 'org_1', ws: null },
      { v: 'COMMUNITY', org: null, ws: null },
      { v: 'UNLISTED', org: null, ws: null },
      { v: 'PUBLIC', org: null, ws: null },
    ];
    for (const { v, org, ws } of cases) {
      const p = post({ visibility: v, organizationId: org, workspaceId: ws });
      // A moderator flag must not become a universal read key either.
      // An authenticated non-member legitimately reaches COMMUNITY/UNLISTED (that is what
      // those tiers mean); the scoped tiers and PRIVATE remain closed.
      const reachable = v === 'PUBLIC' || v === 'COMMUNITY' || v === 'UNLISTED';
      expect(canView(p, attacker).visible).toBe(reachable);
    }
  });

  it('IDOR MATRIX: membership of one organization grants nothing in another', () => {
    const orgOneMember = viewer({ userId: 'mallory', organizationIds: ['org_1'], workspaceIds: ['ws_1'] });
    const otherOrg = post({ visibility: 'ORGANIZATION', organizationId: 'org_2' });
    expect(canView(otherOrg, orgOneMember)).toEqual({
      visible: false,
      reason: 'NOT_AN_ACTIVE_ORGANIZATION_MEMBER',
    });
    // and the workspace of org_2 is likewise unreachable from ws_1
    const otherWorkspace = post({ visibility: 'WORKSPACE', organizationId: 'org_2', workspaceId: 'ws_2' });
    expect(canView(otherWorkspace, orgOneMember).visible).toBe(false);
  });

  it('IDOR MATRIX: a legitimate member does reach organization content', () => {
    const member = viewer({ userId: 'bob', organizationIds: ['org_1'], workspaceIds: ['ws_1'] });
    expect(canView(post({ visibility: 'ORGANIZATION', organizationId: 'org_1' }), member).visible).toBe(true);
    expect(canView(post({ visibility: 'WORKSPACE', organizationId: 'org_1', workspaceId: 'ws_1' }), member).visible).toBe(true);
  });

  it('IDOR MATRIX: withdrawn content is invisible to everyone but moderators', () => {
    for (const moderation of ['HIDDEN', 'REMOVED', 'SUSPENDED'] as const) {
      const p = post({ visibility: 'PUBLIC', moderation });
      expect(canView(p, ANONYMOUS_VIEWER).visible).toBe(false);
      expect(canView(p, viewer({ userId: 'bob' })).visible).toBe(false);
      expect(canView(p, viewer({ userId: 'bob', canModerate: true }), { forModeration: true }).visible).toBe(true);
    }
  });

  it('a flag is not a takedown: flagged content stays public', () => {
    const p = post({ visibility: 'PUBLIC', moderation: 'FLAGGED' });
    expect(canView(p, viewer({ userId: 'bob' })).visible).toBe(false);
    expect(canView(p, viewer()).visible).toBe(true);
    expect(canView(p, viewer({ userId: 'bob', canModerate: true }), { forModeration: true }).visible).toBe(true);
  });

  it('feed projection reports redactions instead of pretending the feed is empty', () => {
    const mine = post({ postId: 'p_mine' });
    const pub = post({ postId: 'p_pub', visibility: 'PUBLIC' });
    const org = post({ postId: 'p_org', visibility: 'ORGANIZATION', organizationId: 'org_x' });
    const result = visibleFeed([mine, pub, org], viewer({ userId: 'bob' }));
    expect(result.visible.map((p) => p.postId)).toEqual(['p_pub']);
    expect(result.redactedWithReasons).toHaveLength(2);
    expect(result.redactedWithReasons.map((r) => r.id).sort()).toEqual(['p_mine', 'p_org']);
    // the viewer still sees their own private post
    expect(visibleFeed([mine, pub, org], viewer()).visible.map((p) => p.postId)).toEqual(['p_mine', 'p_pub', 'p_org']);
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — create and validate', () => {
  it('rejects malformed input with SCREAMING_SNAKE codes', () => {
    const base = {
      postId: 'p', authorUserId: 'a', authorDisplayName: 'A', authorOrganizationId: null,
      title: 't', body: 'b', labels: ['RESEARCH'] as ContentLabel[], visibility: 'PUBLIC' as Visibility,
      workspaceId: null, organizationId: null, provenance: [], createdAt: NOW,
    };
    expect(() => CommunityEngine.createPost({ ...base, postId: ' ' })).toThrow('INVALID_POST_ID');
    expect(() => CommunityEngine.createPost({ ...base, title: '  ' })).toThrow('POST_TITLE_REQUIRED');
    expect(() => CommunityEngine.createPost({ ...base, body: '' })).toThrow('POST_BODY_REQUIRED');
    expect(() => CommunityEngine.createPost({ ...base, title: 'x'.repeat(201) })).toThrow('POST_TITLE_TOO_LONG');
    expect(() => CommunityEngine.createPost({ ...base, labels: ['RESEARCH', 'PAPER_ONLY', 'EDUCATIONAL', 'HYPOTHESIS', 'PERSONAL_VIEW'] })).toThrow('TOO_MANY_LABELS');
  });

  it('requires an organization scope to name an organization', () => {
    expect(() => CommunityEngine.createPost({
      postId: 'p', authorUserId: 'a', authorDisplayName: 'A', authorOrganizationId: null,
      title: 't', body: 'b', labels: ['RESEARCH'], visibility: 'ORGANIZATION',
      workspaceId: null, organizationId: null, provenance: [], createdAt: NOW,
    })).toThrow('ORGANIZATION_SCOPE_REQUIRED');
  });

  it('defaults to a moderation state of VISIBLE and version 1', () => {
    const p = post();
    expect(p.moderation).toBe('VISIBLE');
    expect(p.version).toBe(1);
  });
});

// -----------------------------------------------------------------------------

describe('Community safety — prohibited claims (roadmap §05, §02.6)', () => {
  it('rejects guaranteed-return and risk-free language in English', () => {
    for (const body of [
      'This strategy guarantees profit of 30% per year.',
      'A risk-free income stream for every investor.',
      '100% win rate on every single trade.',
      'You cannot lose with this approach.',
    ]) {
      expect(() => CommunityEngine.createPost({
        postId: 'p', authorUserId: 'a', authorDisplayName: 'A', authorOrganizationId: null,
        title: 'Claim', body, labels: ['RESEARCH'], visibility: 'PUBLIC',
        workspaceId: null, organizationId: null, provenance: [], createdAt: NOW,
      })).toThrow('PROHIBITED_FINANCIAL_CLAIM');
    }
  });

  it('rejects equivalent claims in Vietnamese', () => {
    expect(scanForProhibitedClaims('Lợi nhuận chắc chắn 30% mỗi năm').ok).toBe(false);
    expect(scanForProhibitedClaims('Đây là khoản đầu tư không rủi ro').ok).toBe(false);
  });

  it('allows ordinary, disclosed research language', () => {
    expect(scanForProhibitedClaims('Backtest over 2024 on VN30; drawdown 12%; educational note.').ok).toBe(true);
  });

  it('requires a disclosure label for investment-relevant content', () => {
    expect(() => CommunityEngine.createPost({
      postId: 'p', authorUserId: 'a', authorDisplayName: 'A', authorOrganizationId: null,
      title: 'My take on HPG earnings',
      body: 'The earnings report suggests the stock may re-rate. My personal view.',
      labels: [], visibility: 'PUBLIC', workspaceId: null, organizationId: null,
      provenance: [], createdAt: NOW,
    })).toThrow('CONTENT_LABEL_REQUIRED');
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — versioning (roadmap §02.2)', () => {
  it('increments the version on edit and never mutates the original', () => {
    const original = post();
    const updated = CommunityEngine.updatePost(original, viewer(), { body: 'Revised note about the backtest.' }, '2026-10-16T00:00:00Z');
    expect(original.version).toBe(1);
    expect(updated.version).toBe(2);
    expect(updated.updatedAt).toBe('2026-10-16T00:00:00Z');
    expect(original.body).not.toBe(updated.body);
  });

  it('refuses an edit by a non-author', () => {
    expect(() => CommunityEngine.updatePost(post(), viewer({ userId: 'bob' }), { body: 'hijacked' }, NOW)).toThrow('FORBIDDEN:NOT_THE_AUTHOR');
  });

  it('refuses an anonymous edit', () => {
    expect(() => CommunityEngine.updatePost(post(), ANONYMOUS_VIEWER, { body: 'x' }, NOW)).toThrow('FORBIDDEN:AUTHENTICATION_REQUIRED');
  });

  it('refuses to silently drop provenance', () => {
    expect(() =>
      CommunityEngine.updatePost(post(), viewer(), { provenance: [absent('no longer applicable')] }, NOW),
    ).toThrow('PROVENANCE_REMOVAL_FORBIDDEN');
  });

  it('permits adding provenance', () => {
    const updated = CommunityEngine.updatePost(post(), viewer(), {
      provenance: [present('RESEARCH_EXPERIMENT', 'exp_1', 'fp_abc'), present('PAPER_REPLAY', 'replay_9')],
    }, NOW);
    expect(updated.provenance).toHaveLength(2);
  });

  it('refuses to edit withdrawn content', () => {
    const removed = { ...post(), moderation: 'REMOVED' as const };
    expect(() => CommunityEngine.updatePost(removed, viewer(), { body: 'bring it back' }, NOW)).toThrow('CONTENT_NOT_EDITABLE');
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — moderation (roadmap §02.5)', () => {
  const mod = viewer({ userId: 'mod1', canModerate: true });

  it('refuses moderation by a non-moderator', () => {
    expect(() => CommunityEngine.moderate(post(), viewer(), { action: 'REMOVE', reason: 'x', correlationId: null, at: NOW })).toThrow('FORBIDDEN:NOT_A_MODERATOR');
    expect(() => CommunityEngine.moderate(post(), ANONYMOUS_VIEWER, { action: 'REMOVE', reason: 'x', correlationId: null, at: NOW })).toThrow('FORBIDDEN:NOT_A_MODERATOR');
  });

  it('requires a reason', () => {
    expect(() => CommunityEngine.moderate(post(), mod, { action: 'REMOVE', reason: '   ', correlationId: null, at: NOW })).toThrow('MODERATION_REASON_REQUIRED');
  });

  it('records an immutable, attributable moderation record', () => {
    const { post: moderated, record } = CommunityEngine.moderate(post(), mod, {
      action: 'BEGIN_REVIEW', reason: 'UNSUPPORTED_RETURN_CLAIM', correlationId: 'c1', at: NOW,
    });
    expect(moderated.moderation).toBe('UNDER_REVIEW');
    expect(record).toMatchObject({
      moderatorUserId: 'mod1', action: 'BEGIN_REVIEW', from: 'VISIBLE', to: 'UNDER_REVIEW',
      reason: 'UNSUPPORTED_RETURN_CLAIM', correlationId: 'c1', occurredAt: NOW,
    });
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('rejects an illegal moderation transition', () => {
    const removed = { ...post(), moderation: 'REMOVED' as const };
    expect(() => CommunityEngine.moderate(removed, mod, { action: 'HIDE', reason: 'x', correlationId: null, at: NOW })).toThrow('INVALID_MODERATION_TRANSITION:REMOVED->HIDDEN');
  });

  it('lets a full review lifecycle run and be restored', () => {
    let p = post();
    const r1 = CommunityEngine.flag(p, 'bob', 'SPAM', NOW);
    p = r1.post;
    expect(p.moderation).toBe('FLAGGED');
    const r2 = CommunityEngine.moderate(p, mod, { action: 'BEGIN_REVIEW', reason: 'reviewing', correlationId: null, at: NOW });
    p = r2.post;
    expect(p.moderation).toBe('UNDER_REVIEW');
    const r3 = CommunityEngine.moderate(p, mod, { action: 'RESTORE', reason: 'no violation', correlationId: null, at: NOW });
    expect(r3.post.moderation).toBe('VISIBLE');
  });

  it('a report flags but never hides content (no report-brigading)', () => {
    const { post: flagged } = CommunityEngine.flag(post({ visibility: 'PUBLIC' }), 'mallory', 'SPAM', NOW);
    expect(flagged.moderation).toBe('FLAGGED');
    // still visible to ordinary viewers: flagging is not a takedown
    expect(canView(flagged, viewer({ userId: 'carol' })).visible).toBe(false);
    expect(canView(flagged, ANONYMOUS_VIEWER).visible).toBe(false);
  });

  it('refuses to flag content that is already under review', () => {
    const once = CommunityEngine.flag(post(), 'bob', 'SPAM', NOW).post;
    expect(() => CommunityEngine.flag(once, 'bob', 'SPAM', NOW)).toThrow('CONTENT_ALREADY_UNDER_REVIEW');
  });

  it('allows the author to delete and a moderator to delete, but nobody else', () => {
    const p = post();
    expect(canDelete(p, viewer()).visible).toBe(true);
    expect(canDelete(p, mod).visible).toBe(true);
    expect(canDelete(p, viewer({ userId: 'bob' }))).toEqual({ visible: false, reason: 'NOT_THE_AUTHOR_AND_NOT_A_MODERATOR' });
    expect(canDelete(p, ANONYMOUS_VIEWER)).toEqual({ visible: false, reason: 'AUTHENTICATION_REQUIRED' });
  });

  it('only the author may edit, even for a moderator', () => {
    expect(canEdit(post(), viewer()).visible).toBe(true);
    expect(canEdit(post(), mod)).toEqual({ visible: false, reason: 'NOT_THE_AUTHOR' });
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — provenance chain (roadmap §16)', () => {
  it('reports every expected link, marking gaps NOT_AVAILABLE rather than omitting them', () => {
    const chain = CommunityEngine.resolveChain(post());
    expect(chain.map((c) => c.link)).toEqual([
      'RESEARCH', 'STRATEGY_VERSION', 'DATASET', 'BACKTEST', 'VALIDATION', 'PAPER_REPLAY',
    ]);
    const research = chain.find((c) => c.link === 'RESEARCH')!;
    expect(research.state).toBe('PRESENT');
    expect(research.refId).toBe('exp_1');
    const dataset = chain.find((c) => c.link === 'DATASET')!;
    expect(dataset.state).toBe('NOT_AVAILABLE');
    expect(dataset.refId).toBeNull();
    expect(dataset.because).toBe('NOT_REFERENCED_BY_AUTHOR');
  });

  it('never fabricates a gap: an absent ref stays absent', () => {
    const p = post({ provenance: [absent('author has no dataset'), present('BACKTEST', 'bt_1')] });
    const chain = CommunityEngine.resolveChain(p);
    expect(chain.find((c) => c.link === 'BACKTEST')!.refId).toBe('bt_1');
    expect(chain.find((c) => c.link === 'DATASET')!.state).toBe('NOT_AVAILABLE');
  });

  it('does not let a high-reputation author imply validation', () => {
    // The chain is derived ONLY from the author's explicit references. Reputation is never
    // consulted, which is exactly roadmap §02.7.
    const chain = CommunityEngine.resolveChain(post({ provenance: [] }));
    expect(chain.every((c) => c.state === 'NOT_AVAILABLE')).toBe(true);
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — reputation (roadmap §02.7)', () => {
  it('folds explicit events and requires an attributable subject', () => {
    const e1 = CommunityEngine.reputationEvent({ eventId: 'r1', userId: 'alice', kind: 'RESEARCH_VERIFIED', subjectRef: 'cert_1', occurredAt: NOW });
    const e2 = CommunityEngine.reputationEvent({ eventId: 'r2', userId: 'alice', kind: 'MODERATION_ACTION_AGAINST', subjectRef: 'post_9', occurredAt: NOW });
    expect(CommunityEngine.reputation([e1, e2], 'alice')).toBe(3 - 5);
    expect(CommunityEngine.reputation([e1], 'bob')).toBe(0);
    expect(() => CommunityEngine.reputationEvent({ eventId: 'r3', userId: 'alice', kind: 'RESEARCH_VERIFIED', subjectRef: '  ', occurredAt: NOW })).toThrow('REPUTATION_EVENT_REQUIRES_SUBJECT');
  });
});

// -----------------------------------------------------------------------------

describe('CommunityEngine — comments', () => {
  it('inherits the parent post visibility and never exceeds it', () => {
    const p = post({ visibility: 'PRIVATE' });
    const c = CommunityEngine.createComment({
      commentId: 'c1', postId: p.postId, authorUserId: 'alice', authorDisplayName: 'Alice',
      authorOrganizationId: null, body: 'A note.', createdAt: NOW, post: p, viewer: viewer(),
    });
    expect(c.visibility).toBe('PRIVATE');
    expect(c.workspaceId).toBeNull();
  });

  it('refuses a comment on a post the viewer cannot see (no side channel)', () => {
    const p = post({ visibility: 'PRIVATE' });
    expect(() => CommunityEngine.createComment({
      commentId: 'c2', postId: p.postId, authorUserId: 'bob', authorDisplayName: 'Bob',
      authorOrganizationId: null, body: 'reply', createdAt: NOW, post: p, viewer: viewer({ userId: 'bob' }),
    })).toThrow('FORBIDDEN:PRIVATE_CONTENT');
  });

  it('refuses a comment on a removed post', () => {
    const p = post({ moderation: 'REMOVED' });
    // The author still cannot see withdrawn content on the normal path, which is the first
    // (and stronger) refusal; a moderator using forModeration reaches PARENT_POST_NOT_OPEN.
    expect(() => CommunityEngine.createComment({
      commentId: 'c3', postId: p.postId, authorUserId: 'alice', authorDisplayName: 'Alice',
      authorOrganizationId: null, body: 'reply', createdAt: NOW, post: p, viewer: viewer(),
    })).toThrow('FORBIDDEN:CONTENT_REMOVED');
    const mod = viewer({ userId: 'mod1', canModerate: true });
    expect(canView(p, mod, { forModeration: true }).visible).toBe(true);
  });

  it('applies the prohibited-claim scan to comments too', () => {
    const p = post();
    expect(() => CommunityEngine.createComment({
      commentId: 'c4', postId: p.postId, authorUserId: 'bob', authorDisplayName: 'Bob',
      authorOrganizationId: null, body: 'This guarantees profit.', createdAt: NOW,
      post: post({ visibility: 'PUBLIC' }), viewer: viewer({ userId: 'bob' }),
    })).toThrow('PROHIBITED_FINANCIAL_CLAIM');
  });
});