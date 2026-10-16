import { Router } from 'express';
import { correlationMiddleware, securityHeaders } from '../../../middleware/platform/security.ts';
import {
  runHealthCheck,
  statusCodeFor,
  livenessBody,
  readinessBody,
  type DependencyProbe,
} from '../observability/health.ts';
import { MetricsRegistry, registerPlatformMetrics } from '../observability/metrics.ts';

export function defaultProbes(): readonly DependencyProbe[] {
  return [
    {
      name: 'database',
      optional: true,
      check: async () => 'OK',
    },
    {
      name: 'auth',
      optional: true,
      check: () => (process.env.FIREBASE_PROJECT_ID ? 'OK' : 'UNAVAILABLE'),
    },
    {
      name: 'gemini',
      optional: true,
      check: () => (process.env.GEMINI_API_KEY ? 'OK' : 'UNAVAILABLE'),
    },
  ];
}

export function createPlatformRouter(): Router {
  const router = Router();
  router.use(correlationMiddleware);
  router.use(securityHeaders);

  const metrics = new MetricsRegistry();
  registerPlatformMetrics(metrics);
  const probes = defaultProbes();

  // §31 liveness
  router.get('/healthz', (_req, res) => {
    const report = runHealthCheck({ now: () => Date.now(), probes });
    void report.then((r) => res.status(200).json(livenessBody(r)));
  });

  // §31 readiness
  router.get('/readyz', async (_req, res) => {
    const report = await runHealthCheck({ now: () => Date.now(), probes });
    res.status(statusCodeFor(report)).json(readinessBody(report));
  });

  // §32 metrics
  router.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics.toPrometheus());
  });

  return router;
}
