/**
 * BUSINESS-01 / 05 — SUBSCRIPTION LIFECYCLE STATE MACHINE
 * =======================================================
 * A CLOSED machine over SubscriptionStatus. Illegal transitions throw.
 *
 * Roadmap §01.2 : TRIALING ACTIVE PAST_DUE PAUSED CANCELLED EXPIRED INCOMPLETE UNAVAILABLE
 * Roadmap §05.3 : "Illegal transitions must be rejected."
 * Roadmap §29   : PAYMENT_UNKNOWN must never silently become ACTIVE.
 *
 * Two distinct concepts are deliberately separated and must not be collapsed:
 *
 *   1. SUBSCRIPTION STATUS  — the commercial entitlement state (this file).
 *   2. PAYMENT STATE        — the money state (src/lib/business/billing/paymentState.ts).
 *
 * A subscription may only become ACTIVE from a *settled* payment, which is enforced by
 * `assertActivationPrecondition` and enforced again by the billing service. This file has
 * no dependency on any payment provider.
 */

import type { Subscription, SubscriptionStatus } from './types.ts';

export const SUBSCRIPTION_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> =
  Object.freeze({
    // Never been able to grant access; awaiting a settled payment.
    INCOMPLETE: ['ACTIVE', 'CANCELLED', 'UNAVAILABLE'],
    // Free/evaluation access without a settled payment.
    TRIALING: ['ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'],
    ACTIVE: ['PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'],
    // Payment failed. Access retained only for the remainder of the paid period/grace.
    PAST_DUE: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'],
    PAUSED: ['ACTIVE', 'CANCELLED', 'EXPIRED', 'UNAVAILABLE'],
    // Access continues until currentPeriodEnd / gracePeriodEnd, then EXPIRED.
    CANCELLED: ['EXPIRED', 'ACTIVE'],
    // Terminal.
    EXPIRED: ['ACTIVE', 'UNAVAILABLE'],
    // Terminal and fail-closed: the commercial state could not be determined.
    UNAVAILABLE: [],
  });

export const TERMINAL_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'EXPIRED',
]);

export function subscriptionStatusExists(value: string): value is SubscriptionStatus {
  return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_TRANSITIONS, value);
}

export function requireSubscriptionStatus(value: string): SubscriptionStatus {
  if (!subscriptionStatusExists(value)) throw new Error(`UNKNOWN_SUBSCRIPTION_STATUS:${value}`);
  return value;
}

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

export function legalTargets(from: SubscriptionStatus): readonly SubscriptionStatus[] {
  return SUBSCRIPTION_TRANSITIONS[from];
}

export function isTerminal(status: SubscriptionStatus): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status) || status === 'UNAVAILABLE';
}

/**
 * Fail-closed transition. Returns a NEW subscription; never mutates.
 * Throws INVALID_SUBSCRIPTION_TRANSITION / UNKNOWN_SUBSCRIPTION_STATUS.
 */
export function transition(
  sub: Subscription,
  to: SubscriptionStatus,
  at: string,
): Subscription {
  requireSubscriptionStatus(to);
  if (!canTransition(sub.status, to)) {
    throw new Error(`INVALID_SUBSCRIPTION_TRANSITION:${sub.status}->${to}`);
  }
  return applyTransition(sub, to, at);
}

/**
 * The mutation body, shared by `transition`. Exposed for engines that must apply a
 * transition that was already validated by a caller holding the machine.
 */
export function applyTransition(sub: Subscription, to: SubscriptionStatus, at: string): Subscription {
  const base: Subscription = { ...sub, status: to, updatedAt: at };

  switch (to) {
    case 'ACTIVE':
      return { ...base, cancelledAt: sub.cancelledAt, gracePeriodEnd: sub.gracePeriodEnd };

    case 'PAST_DUE':
      // Grace period starts when the payment first fails. Never shortens an existing grace.
      if (sub.gracePeriodEnd === null || sub.gracePeriodEnd < at) {
        return { ...base, gracePeriodEnd: null };
      }
      return base;

    case 'PAUSED':
      // Suspension preserves the paid period; it does not grant access (NON_ENTITLING).
      return base;

    case 'CANCELLED':
      // §01.2: cancellation does NOT immediately delete access. Access runs until
      // currentPeriodEnd, then gracePeriodEnd.
      return { ...base, cancelledAt: at, cancelAtPeriodEnd: true };

    case 'EXPIRED':
      return base;

    case 'TRIALING':
      throw new Error(`INVALID_SUBSCRIPTION_TRANSITION:${sub.status}->TRIALING`);

    case 'INCOMPLETE':
      return base;

    case 'UNAVAILABLE':
      return base;

    default: {
      const exhaustive: never = to;
      throw new Error(`UNKNOWN_SUBSCRIPTION_STATUS:${String(exhaustive)}`);
    }
  }
}

/**
 * Effective status at an injected instant. Purely derived — never mutates persisted state.
 *
 *   CANCELLED + period not elapsed  -> CANCELLED (still within paid access; grant decided
 *                                      by ENTITLING_STATUSES + SubscriptionAccessEngine)
 *   CANCELLED + period elapsed      -> EXPIRED
 *   TRIALING + trial elapsed        -> EXPIRED
 *   ANY + grace elapsed while PAST_DUE -> EXPIRED
 */
export function effectiveStatus(sub: Subscription, atMs: number): SubscriptionStatus {
  if (sub.status === 'CANCELLED' || sub.status === 'PAUSED') {
    if (sub.currentPeriodEnd !== null && atMs >= Date.parse(sub.currentPeriodEnd)) {
      return 'EXPIRED';
    }
    if (sub.gracePeriodEnd !== null && atMs >= Date.parse(sub.gracePeriodEnd)) {
      return 'EXPIRED';
    }
    return sub.status;
  }
  if (sub.status === 'TRIALING' && sub.trialEndsAt !== null && atMs >= Date.parse(sub.trialEndsAt)) {
    return 'EXPIRED';
  }
  if (sub.status === 'PAST_DUE') {
    if (sub.gracePeriodEnd !== null && atMs >= Date.parse(sub.gracePeriodEnd)) {
      return 'EXPIRED';
    }
  }
  if (sub.status === 'ACTIVE') {
    if (sub.currentPeriodEnd !== null && atMs >= Date.parse(sub.currentPeriodEnd)) {
      return 'EXPIRED';
    }
  }
  return sub.status;
}

/** True when the paid access window has fully elapsed for a cancelling/paused subscription. */
export function accessWindowElapsed(sub: Subscription, atMs: number): boolean {
  const periodEnd = sub.currentPeriodEnd === null ? null : Date.parse(sub.currentPeriodEnd);
  const graceEnd = sub.gracePeriodEnd === null ? null : Date.parse(sub.gracePeriodEnd);
  const last = periodEnd !== null && graceEnd !== null ? Math.max(periodEnd, graceEnd) : (periodEnd ?? graceEnd);
  if (last === null) return false;
  return atMs >= last;
}

/**
 * Start a FREE subscription. The free tier is explicit and data-driven (roadmap §01.6):
 * every subject without a paid subscription holds exactly this record.
 */
export function startFreeSubscription(input: {
  readonly subscriptionId: string;
  readonly subjectId: string;
  readonly at: string;
}): Subscription {
  return {
    subscriptionId: input.subscriptionId,
    subjectId: input.subjectId,
    planId: 'FREE',
    status: 'ACTIVE',
    currentPeriodStart: input.at,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    gracePeriodEnd: null,
    trialEndsAt: null,
    createdAt: input.at,
    updatedAt: input.at,
    providerRef: null,
  };
}

/** Start a TRIALING subscription for a paid plan. Trials are explicit, never implicit. */
export function startTrial(input: {
  readonly subscriptionId: string;
  readonly subjectId: string;
  readonly planId: Exclude<Subscription['planId'], 'FREE'>;
  readonly at: string;
  readonly trialEndsAt: string;
  readonly currentPeriodEnd: string;
}): Subscription {
  return {
    subscriptionId: input.subscriptionId,
    subjectId: input.subjectId,
    planId: input.planId,
    status: 'TRIALING',
    currentPeriodStart: input.at,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    gracePeriodEnd: null,
    trialEndsAt: input.trialEndsAt,
    createdAt: input.at,
    updatedAt: input.at,
    providerRef: null,
  };
}