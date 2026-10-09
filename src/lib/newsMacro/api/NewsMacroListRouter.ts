/**
 * NEWS / MACRO LIST API ROUTER
 * ============================
 * Four list routes over ONE shared repository + ONE shared service, so
 * dedupe, primary-source precedence and canonical timestamps can never drift
 * between them:
 *
 *   GET /api/news
 *   GET /api/policy-events
 *   GET /api/earnings-calendar
 *   GET /api/macro/observations
 *
 * Query params (all four): limit (1..100, default 50), cursor ("<ISO>#<id>").
 * Optional filters: news → symbol; policy-events → policyType, status;
 * earnings-calendar → symbol, status; macro-observations → metricCode.
 *
 * Failure mapping:
 *   invalid params  → 400 { error: { code, message } }
 *   store unavailable → 503 { items: [], dataStatus: "DATA_UNAVAILABLE", ... }
 * Never a fabricated row, never an empty 200 pretending to be "no data".
 */

import { Router, type Request, type Response } from 'express';
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  NewsMacroListError,
  NewsMacroUnavailableError,
  getNewsMacroListService,
  type NewsMacroKind,
  type NewsMacroListParams,
  type NewsMacroListService,
} from '../../../services/newsMacro/NewsMacroListService.ts';

interface RouteSpec {
  readonly path: string;
  readonly kind: NewsMacroKind;
  readonly run: (service: NewsMacroListService, params: NewsMacroListParams) => Promise<unknown>;
}

const ROUTES: readonly RouteSpec[] = [
  { path: '/news', kind: 'NEWS', run: (s, p) => s.listNews(p) },
  { path: '/policy-events', kind: 'POLICY_EVENT', run: (s, p) => s.listPolicyEvents(p) },
  { path: '/earnings-calendar', kind: 'EARNINGS_EVENT', run: (s, p) => s.listEarningsCalendar(p) },
  { path: '/macro/observations', kind: 'MACRO_OBSERVATION', run: (s, p) => s.listMacroObservations(p) },
];

function readParams(req: Request): NewsMacroListParams {
  const q = req.query as Record<string, unknown>;
  const str = (key: string): string | null => {
    const value = q[key];
    if (value === undefined || value === null) return null;
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
    return typeof value === 'string' ? value : null;
  };
  return {
    limit: str('limit'),
    cursor: str('cursor'),
    symbol: str('symbol'),
    metricCode: str('metricCode'),
    policyType: str('policyType'),
    status: str('status'),
  };
}

export function createNewsMacroListRouter(
  service: NewsMacroListService = getNewsMacroListService()
): Router {
  const router = Router();

  for (const route of ROUTES) {
    router.get(route.path, async (req: Request, res: Response) => {
      try {
        const result = await route.run(service, readParams(req));
        res.json(result);
      } catch (error) {
        if (error instanceof NewsMacroListError) {
          res.status(400).json({ error: { code: error.code, message: error.message } });
          return;
        }
        if (error instanceof NewsMacroUnavailableError) {
          res.status(503).json({
            kind: route.kind,
            items: [],
            count: 0,
            limit: DEFAULT_LIST_LIMIT,
            maxLimit: MAX_LIST_LIMIT,
            nextCursor: null,
            dataStatus: 'DATA_UNAVAILABLE',
            error: {
              code: error.code,
              message: 'Data store unavailable — cơ sở dữ liệu chưa sẵn sàng.',
            },
            retrievedAt: new Date().toISOString(),
          });
          return;
        }
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Unexpected error while reading the list.' },
        });
      }
    });
  }

  return router;
}
