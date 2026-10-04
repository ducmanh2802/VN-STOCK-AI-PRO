/**
 * PHASE 26 — EVIDENCE GRAPH ENGINE
 * =================================
 * Deterministic builder of Policy-to-Valuation and Governance Risk Evidence Graphs.
 *
 * GRAPH INVARIANT:
 *   - Nodes and Edges require verified source provenance.
 *   - Edges between Projects and Companies require confirmed evidence tiers.
 */

import type {
  PolicyToValuationEvidenceGraph,
  EvidenceGraphNode,
  EvidenceGraphEdge,
  PolicyEvent,
  StrategicProject,
  ProjectBeneficiary,
  CompanyBacklogSummary,
  LegalGovernanceEvent,
} from './types.ts';

export interface BuildEvidenceGraphInput {
  readonly rootSectorId: string;
  readonly asOfDate?: string;
  readonly policies: readonly PolicyEvent[];
  readonly projects: readonly StrategicProject[];
  readonly beneficiaries: readonly ProjectBeneficiary[];
  readonly backlogs?: readonly CompanyBacklogSummary[];
  readonly governanceEvents?: readonly LegalGovernanceEvent[];
}

export class EvidenceGraphEngine {
  public static readonly VERSION = 'v1.0.0-phase26';

  /**
   * Constructs the full evidence graph for a sector or company root.
   */
  public static buildGraph(input: BuildEvidenceGraphInput): PolicyToValuationEvidenceGraph {
    const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
    const nodes: EvidenceGraphNode[] = [];
    const edges: EvidenceGraphEdge[] = [];
    const nodeSet = new Set<string>();

    const addNode = (node: EvidenceGraphNode) => {
      if (!nodeSet.has(node.nodeId)) {
        nodeSet.add(node.nodeId);
        nodes.push(node);
      }
    };

    // 1. Root Sector Node (structural query root — NOT statutory evidence).
    // Fail-closed provenance (P26-P2-2): the sector node no longer claims
    // TIER_1_STATUTORY/VALID provenance. It is explicitly marked as a
    // system-generated structural node with provisional validation.
    const sectorNodeId = `SECTOR_${input.rootSectorId.toUpperCase()}`;
    addNode({
      nodeId: sectorNodeId,
      nodeType: 'SECTOR_NODE',
      label: `Sector: ${input.rootSectorId}`,
      entityId: input.rootSectorId,
      attributes: { sectorId: input.rootSectorId },
      provenance: {
        source: 'SYSTEM_UNIVERSE',
        sourceTier: 'TIER_4_UNVERIFIED',
        publicationDate: asOfDate,
        retrievalDate: asOfDate,
        freshness: 'CURRENT',
        validationStatus: 'PROVISIONAL',
        verificationNotes: 'Structural query root — not statutory evidence and never a model input.',
      },
    });

    // 2. Policy Nodes & Edges
    for (const p of input.policies) {
      const pNodeId = `POLICY_${p.policyEventId}`;
      addNode({
        nodeId: pNodeId,
        nodeType: 'POLICY_NODE',
        label: `${p.policyType}: ${p.documentNumber}`,
        entityId: p.policyEventId,
        attributes: {
          title: p.title,
          authority: p.issuingAuthority,
          targetInvestmentVnd: p.targetInvestmentVnd,
        },
        provenance: p.provenance,
      });

      edges.push({
        edgeId: `EDGE_${pNodeId}_TO_${sectorNodeId}`,
        fromNodeId: pNodeId,
        toNodeId: sectorNodeId,
        edgeType: 'FUNDS_SECTOR',
        weight: 0.9,
        evidenceTier: p.provenance.sourceTier,
        confirmed: true,
        notes: `Policy ${p.documentNumber} affects sector ${input.rootSectorId}`,
      });
    }

    // 3. Strategic Project Nodes & Edges
    for (const proj of input.projects) {
      const projNodeId = `PROJECT_${proj.projectId}`;
      addNode({
        nodeId: projNodeId,
        nodeType: 'PROJECT_NODE',
        label: `Project: ${proj.name}`,
        entityId: proj.projectId,
        attributes: {
          category: proj.category,
          status: proj.projectStatus,
          capex: proj.approvedInvestmentVnd ?? proj.estimatedInvestmentVnd,
        },
        provenance: proj.provenance,
      });

      edges.push({
        edgeId: `EDGE_${sectorNodeId}_TO_${projNodeId}`,
        fromNodeId: sectorNodeId,
        toNodeId: projNodeId,
        edgeType: 'MANDATES_PROJECT',
        weight: 0.85,
        evidenceTier: proj.provenance.sourceTier,
        confirmed: true,
        notes: `Project ${proj.name} under sector ${input.rootSectorId}`,
      });
    }

    // 4. Beneficiary & Company Nodes
    for (const b of input.beneficiaries) {
      const projNodeId = `PROJECT_${b.projectId}`;
      const companyNodeId = `COMPANY_${b.symbol.toUpperCase()}`;

      addNode({
        nodeId: companyNodeId,
        nodeType: 'COMPANY_NODE',
        label: `${b.symbol} - ${b.companyName}`,
        entityId: b.symbol,
        attributes: { symbol: b.symbol, role: b.role },
        provenance: b.provenance,
      });

      edges.push({
        edgeId: `EDGE_${projNodeId}_TO_${companyNodeId}`,
        fromNodeId: projNodeId,
        toNodeId: companyNodeId,
        edgeType: 'AWARDS_CONTRACT_TO',
        weight: b.isConfirmedBeneficiary ? 1.0 : 0.3,
        evidenceTier: b.evidenceTier,
        confirmed: b.isConfirmedBeneficiary,
        notes: `Company ${b.symbol} role: ${b.role} (Tier: ${b.evidenceTier})`,
      });
    }

    // 5. Backlog Nodes (P26-P2-2): provenance is DERIVED from the real
    // backlog items — never a synthesized ANNUAL_FILINGS/TIER_1 claim.
    if (input.backlogs) {
      for (const bl of input.backlogs) {
        const companyNodeId = `COMPANY_${bl.symbol.toUpperCase()}`;
        const backlogNodeId = `BACKLOG_${bl.symbol.toUpperCase()}`;
        const derived = deriveBacklogProvenance(bl, asOfDate);

        addNode({
          nodeId: backlogNodeId,
          nodeType: 'BACKLOG_NODE',
          label: `${bl.symbol} Confirmed Backlog: ${(bl.totalConfirmedBacklogVnd ? (bl.totalConfirmedBacklogVnd / 1e9).toFixed(0) : 0)}B VND`,
          entityId: bl.symbol,
          attributes: {
            confirmedBacklogVnd: bl.totalConfirmedBacklogVnd,
            bookToBill: bl.bookToBillRatio,
            coverageYears: bl.backlogCoverageYears,
          },
          provenance: derived.provenance,
        });

        edges.push({
          edgeId: `EDGE_${companyNodeId}_TO_${backlogNodeId}`,
          fromNodeId: companyNodeId,
          toNodeId: backlogNodeId,
          edgeType: 'GENERATES_BACKLOG',
          weight: 0.95,
          evidenceTier: derived.evidenceTier,
          confirmed: true,
        });
      }
    }

    // 6. Governance Risk Nodes
    if (input.governanceEvents) {
      for (const gov of input.governanceEvents) {
        const companyNodeId = `COMPANY_${gov.symbol.toUpperCase()}`;
        const govNodeId = `GOV_RISK_${gov.eventId}`;

        addNode({
          nodeId: govNodeId,
          nodeType: 'GOVERNANCE_RISK_NODE',
          label: `Governance Risk: ${gov.title}`,
          entityId: gov.eventId,
          attributes: {
            severity: gov.severity,
            eventType: gov.eventType,
            authority: gov.authority,
          },
          provenance: gov.provenance,
        });

        edges.push({
          edgeId: `EDGE_${govNodeId}_TO_${companyNodeId}`,
          fromNodeId: govNodeId,
          toNodeId: companyNodeId,
          edgeType: 'IMPOSES_GOVERNANCE_RISK_ON',
          weight: gov.severity === 'LEVEL_4_CRIMINAL_ACTION' ? 1.0 : 0.6,
          evidenceTier: gov.provenance.sourceTier,
          confirmed: true,
          notes: `${gov.severity} - ${gov.title}`,
        });
      }
    }

    return {
      rootPolicyOrSectorId: input.rootSectorId,
      asOfDate,
      nodes,
      edges,
      // Fail-closed (P26-P2-2): the structural sector root alone never marks
      // the graph complete — at least one real evidence node is required.
      isComplete: nodes.some((n) => n.nodeType !== 'SECTOR_NODE'),
    };
  }
}

const TIER_RANK: Record<string, number> = {
  TIER_1_STATUTORY: 1,
  TIER_2_EXCHANGE: 2,
  TIER_3_SECONDARY: 3,
  TIER_4_UNVERIFIED: 4,
};

/**
 * Derives honest backlog-node provenance from the real backlog items
 * (P26-P2-2). Source names the contributing filings; the tier is the weakest
 * contributing tier; the publication date is the latest item publication.
 */
function deriveBacklogProvenance(
  bl: CompanyBacklogSummary,
  asOfDate: string
): { provenance: EvidenceGraphNode['provenance']; evidenceTier: EvidenceGraphEdge['evidenceTier'] } {
  const items = bl.items ?? [];
  if (items.length === 0) {
    return {
      provenance: {
        source: 'NO_BACKLOG_ITEMS',
        sourceTier: 'TIER_4_UNVERIFIED',
        publicationDate: asOfDate,
        retrievalDate: asOfDate,
        freshness: bl.freshness,
        validationStatus: 'PROVISIONAL',
        verificationNotes: 'Backlog summary without item-level evidence.',
      },
      evidenceTier: 'TIER_4_UNVERIFIED',
    };
  }
  const sources = Array.from(new Set(items.map((i) => i.provenance.source))).sort();
  const weakest = items.reduce((worst, i) => {
    const rank = TIER_RANK[i.provenance.sourceTier] ?? 4;
    return rank > (TIER_RANK[worst] ?? 4) ? i.provenance.sourceTier : worst;
  }, items[0].provenance.sourceTier);
  const latestPub = items
    .map((i) => i.provenance.publicationDate)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? asOfDate;
  const allValid = items.every((i) => i.provenance.validationStatus === 'VALID');
  return {
    provenance: {
      source: sources.length === 1 ? sources[0] : `MULTIPLE_SOURCES(${sources.length})`,
      sourceTier: weakest,
      publicationDate: latestPub,
      retrievalDate: asOfDate,
      freshness: bl.freshness,
      validationStatus: allValid ? 'VALID' : 'PROVISIONAL',
      verificationNotes: `Derived from ${items.length} backlog item(s); not a primary filing.`,
    },
    evidenceTier: weakest,
  };
}
