import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  getDirectPrerequisites,
  practicedBy,
  prerequisitesOf,
  taughtBy,
  validateGraph,
  type KnowledgeGraph,
} from '../KnowledgeGraph';
import { PREREQUISITES } from '../catalog';

describe('graph derivation from catalog', () => {
  const g = buildGraph();
  it('builds a deterministic graph covering all content', () => {
    expect(buildGraph()).toEqual(buildGraph());
    const kinds = new Map<string, number>();
    for (const n of g.nodes) kinds.set(n.kind, (kinds.get(n.kind) ?? 0) + 1);
    expect(kinds.get('LESSON')).toBe(7);
    expect(kinds.get('EXERCISE')).toBe(11);
    expect(kinds.get('LAB')).toBe(1);
    expect(kinds.get('PROJECT')).toBe(1);
    expect(kinds.get('ASSESSMENT')).toBe(1);
    expect(kinds.get('CONCEPT')).toBeGreaterThan(0);
    expect(kinds.get('SYSTEM_CAPABILITY')).toBeGreaterThan(0);
  });
  it('real catalog validates clean (no missing/dangling/cycle/dup/orphan)', () => {
    expect(validateGraph(g)).toEqual([]);
  });
  it('prerequisite traversal matches catalog chain transitively', () => {
    expect(getDirectPrerequisites(g, 'les-risk-105')).toEqual(PREREQUISITES['les-risk-105']);
    const chain = prerequisitesOf(g, 'les-risk-105');
    expect(chain).toContain('les-statements-104');
    expect(chain).toContain('les-market-101');
    // nearest-first: direct prereq comes before distant ones
    expect(chain.indexOf('les-statements-104')).toBeLessThan(chain.indexOf('les-market-101'));
  });
  it('concept navigation answers taught-by / practiced-by', () => {
    expect(taughtBy(g, 'c-stock')).toContain('les-market-101');
    expect(practicedBy(g, 'c-data-risk').join(' ')).toContain('ex-stale-01');
  });
});

describe('graph integrity detection (§12.3)', () => {
  const base = buildGraph();
  const withEdges = (extra: KnowledgeGraph['edges']): KnowledgeGraph => ({
    nodes: [...base.nodes],
    edges: [...base.edges, ...extra],
  });
  it('detects dangling references', () => {
    const issues = validateGraph(withEdges([{ from: 'ex-stale-01', to: 'c-ghost', rel: 'PRACTICES' }]));
    expect(issues.some((i) => i.code === 'DANGLING_REF')).toBe(true);
  });
  it('detects missing nodes', () => {
    const issues = validateGraph(withEdges([{ from: 'ex-ghost', to: 'c-stock', rel: 'PRACTICES' }]));
    expect(issues.some((i) => i.code === 'MISSING_NODE')).toBe(true);
  });
  it('detects prerequisite cycles', () => {
    const issues = validateGraph(
      withEdges([{ from: 'les-risk-105', to: 'les-market-101', rel: 'PREREQUISITE_OF' }]),
    );
    expect(issues.some((i) => i.code === 'PREREQ_CYCLE')).toBe(true);
  });
  it('detects duplicate edges and invalid rel types', () => {
    const dup = base.edges[0];
    const issues = validateGraph(
      withEdges([dup, { from: 'c-stock', to: 'c-ttm', rel: 'INVENTED' as never }]),
    );
    expect(issues.some((i) => i.code === 'DUPLICATE_EDGE')).toBe(true);
    expect(issues.some((i) => i.code === 'INVALID_REL')).toBe(true);
  });
  it('detects orphan concepts', () => {
    const g2: KnowledgeGraph = {
      nodes: [...base.nodes, { id: 'c-orphan', kind: 'CONCEPT', title: 'Orphan' }],
      edges: [...base.edges],
    };
    expect(validateGraph(g2).some((i) => i.code === 'ORPHAN_CONCEPT')).toBe(true);
  });
  it('traversal is cycle-safe (bounded)', () => {
    const cyclic: KnowledgeGraph = withEdges([
      { from: 'les-risk-105', to: 'les-market-101', rel: 'PREREQUISITE_OF' },
    ]);
    const chain = prerequisitesOf(cyclic, 'les-market-101');
    expect(chain.length).toBeLessThan(1000);
    expect(new Set(chain).size).toBe(chain.length); // no repeats
  });
});
