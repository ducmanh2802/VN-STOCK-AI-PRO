import { describe, it, expect } from 'vitest';
import { StrategicProjectEngine } from '../StrategicProjectEngine.ts';
import { makeTestProject } from './fixtures.ts';

describe('Phase 26 — StrategicProjectEngine', () => {
  it('validates a correct strategic project', () => {
    const project = makeTestProject();
    const result = StrategicProjectEngine.validateProject(project);
    expect(result.isValid).toBe(true);
    expect(result.validationStatus).toBe('VALID');
  });

  it('rejects invalid progress percent outside [0, 100]', () => {
    const invalid = makeTestProject({ progressPercent: 120 });
    const result = StrategicProjectEngine.validateProject(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('progressPercent'))).toBe(true);
  });

  it('filters projects by sector and tracks delayed projects', () => {
    const normal = makeTestProject({ projectId: 'P1', primarySectorId: 'materials' });
    const delayed = makeTestProject({
      projectId: 'P2',
      primarySectorId: 'materials',
      projectStatus: 'DELAYED',
      delayMonths: 6,
    });
    const energy = makeTestProject({ projectId: 'P3', primarySectorId: 'energy' });

    const filtered = StrategicProjectEngine.filterProjectsAsOf([normal, delayed, energy], {
      sectorFilter: 'materials',
      asOfDate: '2026-10-01',
    });

    expect(filtered.validProjects).toHaveLength(2);
    expect(filtered.delayedProjects).toHaveLength(1);
    expect(filtered.totalApprovedCapexVnd).toBe(293980000000000);
  });

  it('computes pipeline health score appropriately', () => {
    const normal = makeTestProject({ projectId: 'P1', primarySectorId: 'materials' });
    const health = StrategicProjectEngine.computePipelineHealth('materials', [normal]);

    expect(health.totalProjects).toBe(1);
    expect(health.pipelineHealthScore).toBeGreaterThanOrEqual(0);
    expect(health.pipelineHealthScore).toBeLessThanOrEqual(100);
    expect(health.delayRatioPercent).toBe(0);
  });
});
