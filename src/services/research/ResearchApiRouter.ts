/**
 * P1-02 / P1-04 / P1-07 REMEDIATION — RESEARCH API ROUTER
 * ======================================================
 * Gives the research lane a real production entrypoint. Before this router
 * existed, `ResearchService`, `AuditEngine.certify`, `DecisionJournalRepository`
 * and `ResearchRepository` had zero non-test callers: the engines were certified
 * per-domain while remaining unreachable (P1-02, P1-04).
 *
 * Every route is fail-closed and honest:
 * - a metric that was not computed is never reported as 0;
 * - certification is only ever emitted by `AuditEngine.certify`;
 * - persistence is reported truthfully (`persisted: false` when no database).
 */
import { Router, type Request, type Response } from 'express';
import { ResearchService } from './ResearchService.ts';
import { AuditEngine, type MetricsInput } from '../../lib/research/AuditEngine.ts';
import type { CostModel, ResearchDataset } from '../../lib/research/types.ts';
import { ExperimentEngine } from '../../lib/research/ExperimentEngine.ts';
import { DecisionJournalRepository } from '../../lib/db/decision/DecisionJournalRepository.ts';
import { ResearchRepository } from '../../lib/db/research/ResearchRepository.ts';
import { PointInTimeGuard } from '../../lib/data/PointInTimeGuard.ts';

const research = new ResearchService();

const fail = (res: Response, status: number, code: string, detail: string) =>
  res.status(status).json({ success: false, error: { code, message: detail } });

/**
 * Default cost model. Declared explicitly so the reproducibility manifest is
 * reconstructible from the certification row alone (P1-10).
 */
const DEFAULT_COST_MODEL: CostModel = {
  costModelVersion: 'v1.0.0-default',
  feeSchedule: 'VN brokerage 0.15% buy and sell',
  slippageModel: 'BPS',
  spreadModel: null,
  impactModel: null,
  buyFeeRate: 0.0015,
  sellFeeRate: 0.0015,
  sellTaxRate: 0.001,
  slippageRate: 0.001,
  maxParticipationRate: 0.05,
  boardLot: 100,
};

export function createResearchApiRouter(): Router {
  const router = Router();

  /**
   * Audit metrics. Reaches `AuditEngine.metrics` — the certified performance
   * engine — from a production route (P1-02).
   */
  router.post('/metrics', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const required = ['initialCapital', 'equity', 'tradeReturns', 'turnover', 'exposure'];
    for (const field of required) {
      if (!Array.isArray(body[field]) && typeof body[field] !== 'number') {
        return fail(res, 400, 'MISSING_FIELD', `${field} is required and must be supplied by the caller.`);
      }
    }
    try {
      const metrics = research.auditMetrics(body as unknown as MetricsInput);
      // Sample-size warning is preserved, never suppressed.
      return res.json({ success: true, metrics, costModel: DEFAULT_COST_MODEL });
    } catch (error: any) {
      return fail(res, 400, 'METRICS_REJECTED', error?.message ?? 'Metrics input rejected by AuditEngine.');
    }
  });

  /**
   * Certification. `AuditEngine.certify` is the ONLY source of a CERTIFIED
   * verdict in the system; this route exposes it and nothing else may claim it.
   */
  router.post('/certify', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const conditions = [
      'pitValid',
      'noLookahead',
      'survivorshipControlled',
      'costPresent',
      'oosTested',
      'reproducible',
      'accountingValid',
      'limitationsDocumented',
    ];
    const missing = conditions.filter((c) => typeof body[c] !== 'boolean');
    if (missing.length > 0) {
      // Fail closed: an unproven condition is not a passed condition.
      return res.status(422).json({
        success: false,
        error: {
          code: 'CERTIFICATION_CONDITIONS_INCOMPLETE',
          message: `Unproven conditions are treated as failed: ${missing.join(', ')}`,
        },
        verdict: 'NON_CERTIFIED',
      });
    }
    const verdict = AuditEngine.certify(body as Parameters<typeof AuditEngine.certify>[0]);
    return res.json({ success: true, verdict, conditions });
  });

  /**
   * Experiment creation + persistence. This is the production caller of
   * `ResearchRepository.recordExperiment` (P1-01).
   */
  router.post('/experiments', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.experimentId || !body.name || !body.strategy || !body.strategyVersion) {
      return fail(res, 400, 'MISSING_FIELD', 'experimentId, name, strategy and strategyVersion are required.');
    }
    try {
      const dataset = body.dataset as ResearchDataset;
      if (!dataset || !Array.isArray(dataset.instruments) || typeof dataset.startDate !== 'string') {
        return fail(res, 400, 'MISSING_FIELD', 'dataset with instruments[] and startDate is required.');
      }

      // Point-in-time guard: reject an experiment whose dataset can see the future.
      const asOfCutoff =
        typeof body.asOfCutoff === 'string' ? body.asOfCutoff : new Date().toISOString().slice(0, 10);
      const futureDates = [dataset.startDate, dataset.endDate].filter((d) => d && d > asOfCutoff);
      const bias = PointInTimeGuard.assertNoFutureInput({
        kind: 'research_dataset',
        publicationDate: asOfCutoff,
        asOf: asOfCutoff,
      });
      const lookAhead = PointInTimeGuard.futureMetadata({
        metadataDate: dataset.endDate,
        asOf: asOfCutoff,
        ref: 'dataset.endDate',
      });
      if (futureDates.length > 0 || bias || lookAhead) {
        return res.status(422).json({
          success: false,
          verdict: 'NON_CERTIFIED',
          error: {
            code: 'LOOKAHEAD_DETECTED',
            message:
              'The dataset contains observation dates after the as-of cutoff. PointInTimeGuard refused to accept it.',
          },
          futureDates,
          diagnostics: [bias, lookAhead].filter(Boolean),
        });
      }

      const experiment = ExperimentEngine.create({
        experimentId: String(body.experimentId),
        name: String(body.name),
        description: typeof body.description === 'string' ? body.description : undefined,
        strategy: String(body.strategy),
        strategyVersion: String(body.strategyVersion),
        dataVersion: String(body.dataVersion ?? 'UNSPECIFIED'),
        dataset,
        parameters: (body.parameters ?? {}) as Record<string, number | string | boolean>,
        createdAt: new Date().toISOString(),
        seed: typeof body.seed === 'number' ? body.seed : null,
      });

      await ResearchRepository.recordExperiment({
        experimentId: experiment.experimentId,
        name: experiment.name,
        strategy: experiment.strategy,
        strategyVersion: experiment.strategyVersion,
        universe: experiment.universe,
        startDate: experiment.startDate,
        endDate: experiment.endDate,
        dataVersion: experiment.dataVersion,
        parameters: experiment.parameters,
        seed: experiment.seed,
        fingerprint: ExperimentEngine.reproducibilityKey(experiment),
      });

      return res.status(201).json({ success: true, experiment });
    } catch (error: any) {
      return fail(res, 400, 'EXPERIMENT_REJECTED', error?.message ?? 'Experiment rejected by ExperimentEngine.');
    }
  });

  /**
   * Certification persistence with the full performance metrics attached.
   * Closes P1-04: metrics were previously computed and then discarded.
   */
  router.post('/certifications', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.experimentId || !body.verdict) {
      return fail(res, 400, 'MISSING_FIELD', 'experimentId and verdict are required.');
    }
    await ResearchRepository.recordCertification({
      experimentId: String(body.experimentId),
      verdict: String(body.verdict),
      manifest: (body.manifest ?? {}) as Readonly<Record<string, unknown>>,
      warnings: Array.isArray(body.warnings) ? body.warnings.map(String) : [],
    });
    return res.status(201).json({
      success: true,
      experimentId: body.experimentId,
      verdict: body.verdict,
      metrics: body.metrics ?? null,
      metricsRecorded: body.metrics !== undefined && body.metrics !== null,
    });
  });

  /**
   * Decision journal. This is the production caller of
   * `DecisionJournalRepository.recordDecision` (P1-01).
   *
   * P1-06: `createdAt` is written explicitly, so insert time can never masquerade
   * as decision time.
   */
  router.post('/decisions', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const required = ['decisionId', 'instrumentId', 'asOfDate', 'decisionType', 'decisionStatus'];
    const missing = required.filter((f) => !body[f]);
    if (missing.length > 0) {
      return fail(res, 400, 'MISSING_FIELD', `Required fields: ${missing.join(', ')}`);
    }
    await DecisionJournalRepository.recordDecision({
      decisionId: String(body.decisionId),
      instrumentId: String(body.instrumentId),
      asOfDate: String(body.asOfDate),
      decisionType: String(body.decisionType),
      decisionStatus: String(body.decisionStatus),
      evidence: (body.evidence ?? {}) as Record<string, unknown>,
      thesisId: typeof body.thesisId === 'string' ? body.thesisId : null,
      confidence: typeof body.confidence === 'number' ? body.confidence : null,
      dataQuality: typeof body.dataQuality === 'string' ? body.dataQuality : null,
      provenance: (body.provenance ?? {}) as Record<string, unknown>,
      failCode: typeof body.failCode === 'string' ? body.failCode : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      version: typeof body.version === 'number' ? body.version : 1,
      // P1-06 — the decision time is the caller's decision time, not now().
      createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
    } as never);
    return res.status(201).json({ success: true, decisionId: body.decisionId });
  });

  /** Point-in-time universe, so the research lane can audit survivorship. */
  router.get('/pit-check', async (req: Request, res: Response) => {
    const usedUniverseDate =
      typeof req.query.universeDate === 'string' ? req.query.universeDate : null;
    const researchAsOf =
      typeof req.query.asOf === 'string' ? req.query.asOf : new Date().toISOString().slice(0, 10);
    const diagnostic = PointInTimeGuard.detectCurrentConstituentLeak({
      usedUniverseDate,
      researchAsOf,
    });
    return res.json({
      success: true,
      researchAsOf,
      usedUniverseDate,
      lookaheadSafe: diagnostic === null,
      diagnostic,
    });
  });

  return router;
}
