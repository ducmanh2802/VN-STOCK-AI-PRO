/**
 * PHASE 26 — STRATEGIC PROJECT ENGINE
 * ===================================
 * Deterministic management and progress tracking of Strategic Mega-Infrastructure
 * & Energy Projects in Vietnam (e.g. Long Thanh Airport, 500kV Circuit 3, PDP8).
 */

import type {
  StrategicProject,
  ProjectStatus,
  DataFreshnessStatus,
  EntityValidationStatus,
} from './types.ts';

export interface EvaluateProjectOptions {
  readonly asOfDate?: string;
  readonly sectorFilter?: string;
}

export class StrategicProjectEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Validates a strategic project record.
   */
  public static validateProject(project: StrategicProject): {
    isValid: boolean;
    errors: string[];
    validationStatus: EntityValidationStatus;
  } {
    const errors: string[] = [];

    if (!project.projectId || project.projectId.trim().length === 0) {
      errors.push('Missing projectId');
    }
    if (!project.projectCode || project.projectCode.trim().length === 0) {
      errors.push('Missing projectCode');
    }
    if (!project.name || project.name.trim().length === 0) {
      errors.push('Missing project name');
    }
    if (project.estimatedInvestmentVnd !== null && (isNaN(project.estimatedInvestmentVnd) || project.estimatedInvestmentVnd < 0)) {
      errors.push('Invalid estimatedInvestmentVnd');
    }
    if (project.approvedInvestmentVnd !== null && (isNaN(project.approvedInvestmentVnd) || project.approvedInvestmentVnd < 0)) {
      errors.push('Invalid approvedInvestmentVnd');
    }
    if (project.progressPercent !== null && project.progressPercent !== undefined) {
      if (isNaN(project.progressPercent) || project.progressPercent < 0 || project.progressPercent > 100) {
        errors.push(`Invalid progressPercent: ${project.progressPercent}. Must be between 0 and 100.`);
      }
    }
    if (!project.provenance || !project.provenance.source) {
      errors.push('Missing source provenance');
    }

    const isValid = errors.length === 0;
    const validationStatus: EntityValidationStatus = isValid
      ? 'VALID'
      : project.provenance?.sourceTier === 'TIER_4_UNVERIFIED'
        ? 'INVALID'
        : 'SUSPECT';

    return { isValid, errors, validationStatus };
  }

  /**
   * Filters projects as of evaluation date with lookahead safety.
   */
  public static filterProjectsAsOf(
    projects: readonly StrategicProject[],
    options?: EvaluateProjectOptions
  ): {
    validProjects: StrategicProject[];
    delayedProjects: StrategicProject[];
    totalApprovedCapexVnd: number | null;
    lookaheadViolations: string[];
  } {
    const asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const sectorFilter = options?.sectorFilter?.toLowerCase();

    const validProjects: StrategicProject[] = [];
    const delayedProjects: StrategicProject[] = [];
    const lookaheadViolations: string[] = [];
    let totalApprovedCapex: number | null = null;

    for (const p of projects) {
      // Fail-closed (P26-P3-1): undated records are excluded with a violation,
      // never assumed current.
      const pubDate = p.provenance.publicationDate || null;
      if (!pubDate) {
        lookaheadViolations.push(
          `Project ${p.projectCode} has no publication date — excluded (fail-closed)`
        );
        continue;
      }
      if (pubDate > asOfDate) {
        lookaheadViolations.push(
          `Project ${p.projectCode} publication date (${pubDate}) > asOfDate (${asOfDate})`
        );
        continue;
      }

      const validation = this.validateProject(p);
      if (!validation.isValid) {
        continue;
      }

      if (sectorFilter && p.primarySectorId.toLowerCase() !== sectorFilter && sectorFilter !== 'all') {
        continue;
      }

      validProjects.push(p);

      if (p.projectStatus === 'DELAYED' || (p.delayMonths && p.delayMonths > 0)) {
        delayedProjects.push(p);
      }

      const capex = p.approvedInvestmentVnd ?? p.estimatedInvestmentVnd;
      if (capex && capex > 0) {
        totalApprovedCapex = (totalApprovedCapex ?? 0) + capex;
      }
    }

    return {
      validProjects,
      delayedProjects,
      totalApprovedCapexVnd: totalApprovedCapex,
      lookaheadViolations,
    };
  }

  /**
   * Computes sector project pipeline health.
   */
  public static computePipelineHealth(
    sectorId: string,
    projects: readonly StrategicProject[],
    asOfDate?: string
  ): {
    sectorId: string;
    totalProjects: number;
    underConstructionCount: number;
    delayedCount: number;
    totalCapexVnd: number | null;
    delayRatioPercent: number | null;
    pipelineHealthScore: number; // 0 - 100
    freshness: DataFreshnessStatus;
  } {
    const { validProjects, delayedProjects, totalApprovedCapexVnd } =
      this.filterProjectsAsOf(projects, { asOfDate, sectorFilter: sectorId });

    if (validProjects.length === 0) {
      return {
        sectorId,
        totalProjects: 0,
        underConstructionCount: 0,
        delayedCount: 0,
        totalCapexVnd: null,
        delayRatioPercent: null,
        pipelineHealthScore: 0,
        freshness: 'UNAVAILABLE',
      };
    }

    const underConstructionCount = validProjects.filter(
      (p) => p.projectStatus === 'UNDER_CONSTRUCTION' || p.projectStatus === 'AWARDED'
    ).length;

    const delayedCount = delayedProjects.length;
    const delayRatio = Math.round((delayedCount / validProjects.length) * 100);

    // Score increases with active execution, penalized by high delays
    let healthScore = 50 + underConstructionCount * 10 - delayedCount * 15;
    healthScore = Math.max(0, Math.min(100, healthScore));

    const isCurrent = validProjects.some((p) => p.provenance.freshness === 'CURRENT');

    return {
      sectorId,
      totalProjects: validProjects.length,
      underConstructionCount,
      delayedCount,
      totalCapexVnd: totalApprovedCapexVnd,
      delayRatioPercent: delayRatio,
      pipelineHealthScore: healthScore,
      freshness: isCurrent ? 'CURRENT' : 'STALE',
    };
  }
}
