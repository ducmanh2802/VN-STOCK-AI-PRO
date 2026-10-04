/**
 * Shared viewer fixtures for business-lane tests.
 * Kept in its own module so the same viewer shapes are used by every lane's suite and a
 * change to ViewerContext cannot silently make one lane's assertions vacuous.
 */
import type { ViewerContext } from '../types.ts';

export function viewer(over: Partial<ViewerContext> = {}): ViewerContext {
  return {
    userId: 'alice',
    organizationIds: [],
    workspaceIds: [],
    canModerate: false,
    ...over,
  };
}

export function anonymous(): ViewerContext {
  return { userId: null, organizationIds: [], workspaceIds: [], canModerate: false };
}

export function moderator(userId = 'mod1'): ViewerContext {
  return viewer({ userId, canModerate: true });
}