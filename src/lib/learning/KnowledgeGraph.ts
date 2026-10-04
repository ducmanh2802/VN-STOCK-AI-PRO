// KnowledgeGraph — LEARNING-12 derived knowledge graph. Pure + deterministic.
// The catalog remains the single source of truth; this module builds a typed
// node/edge VIEW over it (no duplicated content) that powers prerequisites,
// recommendations, navigation, assessment/project mapping, and tutor retrieval.
// Bounded algorithms only: no unbounded recursion (visited-sets everywhere).
import {
  ASSESSMENTS,
  CONCEPTS,
  DOMAINS,
  EXERCISES,
  LABS,
  LESSONS,
  PATHS,
  PREREQUISITES,
  PROJECTS,
  TOPICS,
} from './catalog';
import { SYSTEM_LINKS } from './systemLinks';

export type GraphNodeKind =
  | 'DOMAIN'
  | 'TOPIC'
  | 'CONCEPT'
  | 'LESSON'
  | 'EXERCISE'
  | 'LAB'
  | 'PROJECT'
  | 'ASSESSMENT'
  | 'SYSTEM_CAPABILITY';

export type GraphRel =
  | 'PREREQUISITE_OF'
  | 'DEPENDS_ON'
  | 'TEACHES'
  | 'PRACTICES'
  | 'ASSESSES'
  | 'APPLIED_IN'
  | 'RELATED_TO'
  | 'EXPANDS';

export const GRAPH_RELS: readonly GraphRel[] = [
  'PREREQUISITE_OF',
  'DEPENDS_ON',
  'TEACHES',
  'PRACTICES',
  'ASSESSES',
  'APPLIED_IN',
  'RELATED_TO',
  'EXPANDS',
];

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  title: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  rel: GraphRel;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function capId(name: string): string {
  return `cap:${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Build the full derived graph from the current catalog (deterministic order). */
export function buildGraph(): KnowledgeGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addNode = (n: GraphNode): void => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };
  const seenEdges = new Set<string>();
  const addEdge = (from: string, to: string, rel: GraphRel): void => {
    // Builder dedupes identical edges (lesson refs and system links may agree);
    // validateGraph stays strict for externally supplied graphs.
    const key = `${from}|${to}|${rel}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ from, to, rel });
  };

  for (const d of DOMAINS) addNode({ id: d.id, kind: 'DOMAIN', title: d.title });
  for (const t of TOPICS) {
    addNode({ id: t.id, kind: 'TOPIC', title: t.title });
    addEdge(t.id, t.domainId, 'RELATED_TO');
  }
  for (const c of CONCEPTS) {
    addNode({ id: c.id, kind: 'CONCEPT', title: c.title });
    addEdge(c.id, c.topicId, 'RELATED_TO');
  }
  const capTitle = new Map<string, string>();
  const capOf = (name: string | undefined): string | null => {
    if (!name || !name.trim()) return null;
    const id = capId(name);
    if (!capTitle.has(id)) {
      capTitle.set(id, name.trim());
      addNode({ id, kind: 'SYSTEM_CAPABILITY', title: name.trim() });
    }
    return id;
  };

  for (const l of LESSONS) {
    addNode({ id: l.id, kind: 'LESSON', title: l.title });
    for (const c of l.conceptIds) addEdge(l.id, c, 'TEACHES');
    for (const f of l.systemFeatureRefs ?? []) {
      const cap = capOf(f);
      if (cap) addEdge(l.id, cap, 'APPLIED_IN');
    }
  }
  for (const e of EXERCISES) {
    addNode({ id: e.id, kind: 'EXERCISE', title: e.question.slice(0, 80) });
    addEdge(e.id, e.lessonId, 'RELATED_TO');
    for (const c of e.conceptIds) addEdge(e.id, c, 'PRACTICES');
  }
  for (const lab of LABS) {
    addNode({ id: lab.id, kind: 'LAB', title: lab.title });
    // A lab expands the lesson that precedes it in each path (deterministic).
    for (const p of PATHS) {
      const items = p.items;
      const idx = items.findIndex((i) => i.kind === 'lab' && i.refId === lab.id);
      if (idx > 0) {
        const prevLessons = items.slice(0, idx).filter((i) => i.kind === 'lesson');
        const prev = prevLessons[prevLessons.length - 1];
        if (prev) addEdge(lab.id, prev.refId, 'EXPANDS');
      }
    }
  }
  for (const pr of PROJECTS) {
    addNode({ id: pr.id, kind: 'PROJECT', title: pr.title });
    for (const c of pr.conceptIds) addEdge(pr.id, c, 'PRACTICES');
    const cap = capOf(pr.systemFeature);
    if (cap) addEdge(pr.id, cap, 'APPLIED_IN');
  }
  for (const a of ASSESSMENTS) {
    addNode({ id: a.id, kind: 'ASSESSMENT', title: a.title });
    const concepts = new Set<string>();
    for (const exId of a.exerciseIds) {
      const ex = EXERCISES.find((e) => e.id === exId);
      if (ex) for (const c of ex.conceptIds) concepts.add(c);
    }
    for (const c of [...concepts].sort()) addEdge(a.id, c, 'ASSESSES');
  }
  for (const [lessonId, reqs] of Object.entries(PREREQUISITES)) {
    for (const r of reqs) addEdge(r, lessonId, 'PREREQUISITE_OF');
  }
  for (const link of SYSTEM_LINKS) {
    const cap = capOf(link.feature);
    if (cap) addEdge(link.lessonId, cap, 'APPLIED_IN');
  }

  nodes.sort((x, y) => x.id.localeCompare(y.id));
  edges.sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to) || x.rel.localeCompare(y.rel));
  return { nodes, edges };
}

/** Direct prerequisites of a lesson (graph-backed; same data as PREREQUISITES). */
export function getDirectPrerequisites(g: KnowledgeGraph, lessonId: string): string[] {
  return g.edges
    .filter((e) => e.rel === 'PREREQUISITE_OF' && e.to === lessonId)
    .map((e) => e.from)
    .sort();
}

/** Transitive prerequisite chain, cycle-safe (visited set), nearest-first. */
export function prerequisitesOf(g: KnowledgeGraph, lessonId: string): string[] {
  const out: string[] = [];
  const visited = new Set<string>([lessonId]);
  const queue = [...getDirectPrerequisites(g, lessonId)];
  for (const q of queue) visited.add(q);
  out.push(...queue);
  let head = 0;
  let guard = 0;
  while (head < queue.length && guard < 1000) {
    guard += 1;
    const cur = queue[head];
    head += 1;
    for (const p of getDirectPrerequisites(g, cur)) {
      if (visited.has(p)) continue;
      visited.add(p);
      queue.push(p);
      out.push(p);
    }
  }
  return out;
}

export function taughtBy(g: KnowledgeGraph, conceptId: string): string[] {
  return g.edges
    .filter((e) => e.rel === 'TEACHES' && e.to === conceptId)
    .map((e) => e.from)
    .sort();
}

export function practicedBy(g: KnowledgeGraph, conceptId: string): string[] {
  return g.edges
    .filter((e) => (e.rel === 'PRACTICES' || e.rel === 'ASSESSES') && e.to === conceptId)
    .map((e) => `${e.rel}:${e.from}`)
    .sort();
}

export interface GraphIssue {
  code:
    | 'MISSING_NODE'
    | 'DANGLING_REF'
    | 'PREREQ_CYCLE'
    | 'DUPLICATE_EDGE'
    | 'INVALID_REL'
    | 'ORPHAN_CONCEPT';
  detail: string;
}

/** Integrity validation: missing nodes, dangling refs, prereq cycles, dup edges, orphans. */
export function validateGraph(g: KnowledgeGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set(g.nodes.map((n) => n.id));
  const seenEdges = new Set<string>();
  for (const e of g.edges) {
    if (!GRAPH_RELS.includes(e.rel)) issues.push({ code: 'INVALID_REL', detail: `${e.from}->${e.to}:${e.rel}` });
    if (!ids.has(e.from)) issues.push({ code: 'MISSING_NODE', detail: `edge from unknown ${e.from}` });
    if (!ids.has(e.to)) issues.push({ code: 'DANGLING_REF', detail: `edge to unknown ${e.to} (${e.rel})` });
    const key = `${e.from}|${e.to}|${e.rel}`;
    if (seenEdges.has(key)) issues.push({ code: 'DUPLICATE_EDGE', detail: key });
    seenEdges.add(key);
  }
  // Cycle detection over PREREQUISITE_OF (iterative DFS, bounded).
  const succ = new Map<string, string[]>();
  for (const e of g.edges) {
    if (e.rel !== 'PREREQUISITE_OF') continue;
    const arr = succ.get(e.from) ?? [];
    arr.push(e.to);
    succ.set(e.from, arr);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const visit = (start: string): boolean => {
    const stack: [string, number][] = [[start, 0]];
    while (stack.length > 0) {
      const [node, idx] = stack[stack.length - 1];
      if ((color.get(node) ?? WHITE) === WHITE) color.set(node, GRAY);
      const next = succ.get(node) ?? [];
      if (idx < next.length) {
        stack[stack.length - 1][1] = idx + 1;
        const m = next[idx];
        const c = color.get(m) ?? WHITE;
        if (c === GRAY) return true;
        if (c === WHITE) stack.push([m, 0]);
      } else {
        color.set(node, BLACK);
        stack.pop();
      }
    }
    return false;
  };
  for (const id of [...succ.keys()].sort()) {
    if ((color.get(id) ?? WHITE) === WHITE && visit(id)) {
      issues.push({ code: 'PREREQ_CYCLE', detail: `cycle reachable from ${id}` });
      break;
    }
  }
  // Orphan concepts: no TEACHES/PRACTICES/ASSESSES edge touches them.
  for (const n of g.nodes) {
    if (n.kind !== 'CONCEPT') continue;
    const touched = g.edges.some(
      (e) => (e.rel === 'TEACHES' || e.rel === 'PRACTICES' || e.rel === 'ASSESSES') && e.to === n.id,
    );
    if (!touched) issues.push({ code: 'ORPHAN_CONCEPT', detail: n.id });
  }
  return issues;
}
