/**
 * RESEARCH REPOSITORIES — append-only experiments + certifications.
 */
import { db } from '../../../db/index.ts';
import { researchCertifications, researchExperiments } from '../../../db/schema.ts';

export class ResearchRepository {
  static async recordExperiment(e: {
    readonly experimentId: string;
    readonly name: string;
    readonly strategy: string;
    readonly strategyVersion: string;
    readonly universe: readonly string[];
    readonly startDate: string;
    readonly endDate: string;
    readonly dataVersion: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly seed: number | null;
    readonly fingerprint: string;
  }): Promise<void> {
    if (!db) return;
    await db
      .insert(researchExperiments)
      .values({
        experimentId: e.experimentId,
        name: e.name,
        strategy: e.strategy,
        strategyVersion: e.strategyVersion,
        universe: JSON.stringify(e.universe),
        startDate: e.startDate,
        endDate: e.endDate,
        dataVersion: e.dataVersion,
        parameters: JSON.stringify(e.parameters),
        seed: e.seed,
        fingerprint: e.fingerprint,
      })
      .onConflictDoNothing({ target: researchExperiments.experimentId });
  }

  static async recordCertification(c: {
    readonly experimentId: string;
    readonly verdict: string;
    readonly manifest: Readonly<Record<string, unknown>>;
    readonly warnings: readonly string[];
  }): Promise<void> {
    if (!db) return;
    await db
      .insert(researchCertifications)
      .values({
        experimentId: c.experimentId,
        verdict: c.verdict,
        manifest: JSON.stringify(c.manifest),
        warnings: JSON.stringify(c.warnings),
      })
      .onConflictDoNothing({ target: researchCertifications.experimentId });
  }
}
