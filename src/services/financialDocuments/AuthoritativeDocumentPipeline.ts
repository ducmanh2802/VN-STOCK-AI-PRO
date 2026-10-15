/**
 * PHASE 19.6 — AUTHORITATIVE FINANCIAL DOCUMENT PIPELINE COORDINATOR
 * ==================================================================
 * End-to-end production-ready pipeline for discovering, parsing, extracting,
 * reconciling, and validating authoritative Vietnamese financial statements.
 * 
 * Pipeline Phases:
 * 1. Document Discovery: HOSE / HNX / SSC / Issuer IR portals.
 * 2. Format & Metadata Ingestion: PDF / HTML / XLS with unit & audit verification.
 * 3. Deterministic Extraction: CFO, CAPEX, Actual Cash Dividends Paid, Revenue, Net Profit.
 * 4. Cross-Source Reconciliation: Verification against secondary structured feeds (KBS, VPS, VNDIRECT).
 * 5. Fail-Closed Emission: Full provenance retention with zero mock/synthetic data.
 */

import { DocumentDiscoveryEngine, type DiscoveryQuery } from './DocumentDiscoveryEngine.ts';
import { FinancialDocumentParser, type RawDocumentPayload } from './FinancialDocumentParser.ts';
import { CrossSourceReconciler, type ReconciliationOptions } from './CrossSourceReconciler.ts';
import type {
  DiscoveredFinancialDocument,
  DocumentPipelineResult,
  ExtractedFinancialMetric,
  MetricReconciliationResult,
  SecondarySourceMetric,
} from './types.ts';

export interface PipelineExecutionOptions {
  discoveryQuery: DiscoveryQuery;
  rawPayload?: RawDocumentPayload;
  secondarySources?: Record<string, SecondarySourceMetric[]>; // Keyed by metric name (e.g., 'CFO', 'NET_REVENUE')
  reconciliationOptions?: ReconciliationOptions;
}

export class AuthoritativeDocumentPipeline {
  private readonly discoveryEngine: DocumentDiscoveryEngine;
  private readonly documentParser: FinancialDocumentParser;
  private readonly reconciler: CrossSourceReconciler;

  constructor(
    discoveryEngine?: DocumentDiscoveryEngine,
    parser?: FinancialDocumentParser,
    reconciler?: CrossSourceReconciler
  ) {
    this.discoveryEngine = discoveryEngine ?? new DocumentDiscoveryEngine();
    this.documentParser = parser ?? new FinancialDocumentParser();
    this.reconciler = reconciler ?? new CrossSourceReconciler();
  }

  public getDiscoveryEngine(): DocumentDiscoveryEngine {
    return this.discoveryEngine;
  }

  public getParser(): FinancialDocumentParser {
    return this.documentParser;
  }

  public getReconciler(): CrossSourceReconciler {
    return this.reconciler;
  }

  /**
   * Execute the end-to-end financial document pipeline.
   */
  public execute(options: PipelineExecutionOptions): DocumentPipelineResult {
    const executedAt = new Date().toISOString();
    const query = options.discoveryQuery;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Discover Authoritative Document
    let doc: DiscoveredFinancialDocument | null = null;
    if (options.rawPayload) {
      doc = options.rawPayload.document;
    } else {
      doc = this.discoveryEngine.discoverDocument(query);
    }

    if (!doc) {
      // Missing authoritative source document -> fail closed
      const emptyDoc: DiscoveredFinancialDocument = {
        documentId: 'DOC_NOT_FOUND',
        symbol: query.symbol.toUpperCase(),
        title: `Financial Statement ${query.period}`,
        source: 'HOSE',
        format: 'PDF',
        url: '',
        publishedAt: executedAt,
        period: query.period,
        fiscalYear: query.fiscalYear,
        periodEnd: '',
        reportType: query.reportType ?? 'CONSOLIDATED',
        auditStatus: 'UNAUDITED',
        checksum: '',
      };

      const unavailableMetrics: Record<string, ExtractedFinancialMetric> = {};
      const targetMetrics = ['CFO', 'CAPEX', 'CASH_DIVIDEND_PAID', 'NET_REVENUE', 'NET_PROFIT'];

      for (const m of targetMetrics) {
        unavailableMetrics[m] = {
          symbol: query.symbol.toUpperCase(),
          metric: m,
          value: null,
          currency: 'VND',
          unit: 'VND',
          period: query.period,
          periodEnd: '',
          statementType: 'CASH_FLOW_INDIRECT',
          reportType: query.reportType ?? 'CONSOLIDATED',
          audited: false,
          sourceUrl: '',
          sourceDocumentId: 'DOC_NOT_FOUND',
          sourcePublishedAt: executedAt,
          extractedAt: executedAt,
          extractionMethod: 'NATIVE_TABLE_PARSER',
          confidence: 0,
          validationStatus: 'UNAVAILABLE',
          unavailableReason: 'MISSING_SOURCE_DOCUMENT',
          notes: `No authoritative filing document found for ${query.symbol} period ${query.period}.`,
        };
      }

      return {
        symbol: query.symbol.toUpperCase(),
        period: query.period,
        fiscalYear: query.fiscalYear,
        reportType: query.reportType ?? 'CONSOLIDATED',
        audited: false,
        document: emptyDoc,
        metrics: unavailableMetrics,
        reconciliations: {},
        pipelineStatus: 'FAILED',
        errors: [`No authoritative filing document discovered for ${query.symbol} in period ${query.period}.`],
        warnings: [],
        executedAt,
      };
    }

    // Step 2: Extraction
    let extractedMetrics: Record<string, ExtractedFinancialMetric> = {};
    if (options.rawPayload) {
      extractedMetrics = this.documentParser.extractMetrics(options.rawPayload);
    } else {
      // In the absence of raw table rows in query, fail closed with required line missing
      errors.push('Raw document payload not provided to parser for extraction.');
    }

    // Step 3: Cross-Source Reconciliation
    const reconciliations: Record<string, MetricReconciliationResult> = {};
    const finalMetrics: Record<string, ExtractedFinancialMetric> = {};
    const secondaryData = options.secondarySources ?? {};

    for (const [metricKey, metricObj] of Object.entries(extractedMetrics)) {
      const secondaries = secondaryData[metricKey] ?? [];
      const reconResult = this.reconciler.reconcileMetric(metricObj, secondaries);
      reconciliations[metricKey] = reconResult;
      finalMetrics[metricKey] = reconResult.primaryMetric;

      if (reconResult.status === 'CONFLICT') {
        warnings.push(`Cross-source conflict for metric ${metricKey}: ${reconResult.notes}`);
      } else if (reconResult.status === 'REJECTED') {
        errors.push(`Metric ${metricKey} rejected: ${reconResult.notes}`);
      }
    }

    // Determine overall pipeline status
    const metricList = Object.values(finalMetrics);
    const validCount = metricList.filter((m) => m.value !== null && (m.validationStatus === 'VALIDATED' || m.validationStatus === 'RECONCILED')).length;
    const pipelineStatus =
      errors.length > 0 && validCount === 0
        ? 'FAILED'
        : validCount === metricList.length && errors.length === 0
        ? 'SUCCESS'
        : 'PARTIAL';

    return {
      symbol: doc.symbol,
      period: doc.period,
      fiscalYear: doc.fiscalYear,
      reportType: doc.reportType,
      audited: doc.auditStatus === 'AUDITED',
      document: doc,
      metrics: finalMetrics,
      reconciliations,
      pipelineStatus,
      errors,
      warnings,
      executedAt,
    };
  }
}
