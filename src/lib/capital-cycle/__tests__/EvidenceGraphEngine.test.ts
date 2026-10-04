import { describe, it, expect } from 'vitest';
import { EvidenceGraphEngine } from '../EvidenceGraphEngine.ts';
import {
  makeTestPolicy,
  makeTestProject,
  makeTestBeneficiary,
  makeTestBacklogItem,
} from './fixtures.ts';
import { BacklogConversionEngine } from '../BacklogConversionEngine.ts';

describe('Phase 26 — EvidenceGraphEngine', () => {
  it('constructs a multi-layer evidence graph from policy down to company and backlog', () => {
    const policy = makeTestPolicy({ policyEventId: 'P1' });
    const project = makeTestProject({ projectId: 'PRJ1' });
    const ben = makeTestBeneficiary({ projectId: 'PRJ1', symbol: 'HHV' });
    const item = makeTestBacklogItem({ symbol: 'HHV' });
    const backlogSummary = BacklogConversionEngine.summarizeBacklog('HHV', [item], 2000000000000);

    const graph = EvidenceGraphEngine.buildGraph({
      rootSectorId: 'materials',
      policies: [policy],
      projects: [project],
      beneficiaries: [ben],
      backlogs: [backlogSummary],
    });

    expect(graph.isComplete).toBe(true);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(4); // Sector, Policy, Project, Company, Backlog
    expect(graph.edges.length).toBeGreaterThanOrEqual(3);

    const companyNode = graph.nodes.find((n) => n.nodeType === 'COMPANY_NODE');
    expect(companyNode).toBeDefined();
    expect(companyNode?.entityId).toBe('HHV');

    const projectToCompanyEdge = graph.edges.find((e) => e.edgeType === 'AWARDS_CONTRACT_TO');
    expect(projectToCompanyEdge).toBeDefined();
    expect(projectToCompanyEdge?.confirmed).toBe(true);
  });
});
