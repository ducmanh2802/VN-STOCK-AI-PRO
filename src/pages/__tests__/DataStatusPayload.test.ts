import { describe, expect, it } from 'vitest';
import { payloadDeclaresUnavailable } from '../DataStatusPage';

/**
 * P27 §9 / §13 — HTTP 200 is transport success, not data availability.
 *
 * Several market-data routes deliberately answer 200 with an honest
 * `dataStatus: DATA_UNAVAILABLE` (fail-closed). The Data Status page must not
 * report such a feed as LIVE.
 */
describe('DataStatusPage payload inspection', () => {
  it('treats a 200 body carrying DATA_UNAVAILABLE as unavailable, not live', () => {
    expect(payloadDeclaresUnavailable({ dataStatus: 'DATA_UNAVAILABLE', data: null })).toBe(true);
    expect(payloadDeclaresUnavailable({ dataStatus: 'INSUFFICIENT_DATA' })).toBe(true);
    expect(payloadDeclaresUnavailable({ dataStatus: 'UNAVAILABLE' })).toBe(true);
  });

  it('does not flag a real payload as unavailable', () => {
    expect(payloadDeclaresUnavailable({ dataStatus: 'OK', data: { price: 21_700 } })).toBe(false);
    expect(payloadDeclaresUnavailable({ status: 'LIVE' })).toBe(false);
    expect(payloadDeclaresUnavailable(null)).toBe(false);
    expect(payloadDeclaresUnavailable(undefined)).toBe(false);
    expect(payloadDeclaresUnavailable('DATA_UNAVAILABLE')).toBe(false);
    expect(payloadDeclaresUnavailable(200)).toBe(false);
  });

  it('honours only the three declared codes — non-string and empty statuses are ignored', () => {
    expect(payloadDeclaresUnavailable({})).toBe(false);
    expect(payloadDeclaresUnavailable({ dataStatus: 500 })).toBe(false);
    expect(payloadDeclaresUnavailable({ dataStatus: '   ' })).toBe(false);
    expect(payloadDeclaresUnavailable({ dataStatus: 'DATA_UNAVAILABLE ' })).toBe(false);
  });
});
