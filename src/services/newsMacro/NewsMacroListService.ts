import { NewsMacroRepository, type NewsMacroQuery } from '../../lib/db/NewsMacroRepository.ts';

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

export type NewsMacroKind = 'NEWS' | 'POLICY_EVENT' | 'EARNINGS_EVENT' | 'MACRO_OBSERVATION';

export interface NewsMacroListParams {
  limit?: string | null;
  cursor?: string | null;
  symbol?: string | null;
  metricCode?: string | null;
  policyType?: string | null;
  status?: string | null;
}

export class NewsMacroListError extends Error {
  constructor(message: string, readonly code: string = 'INVALID_REQUEST') {
    super(message);
    this.name = 'NewsMacroListError';
  }
}

export class NewsMacroUnavailableError extends Error {
  constructor(message: string, readonly code: string = 'DATA_UNAVAILABLE') {
    super(message);
    this.name = 'NewsMacroUnavailableError';
  }
}

export interface NewsMacroDataSource {
  listNews(q: NewsMacroQuery): Promise<any[]>;
  listPolicyEvents(q: NewsMacroQuery): Promise<any[]>;
  listEarningsCalendar(q: NewsMacroQuery): Promise<any[]>;
  listMacroObservations(q: NewsMacroQuery): Promise<any[]>;
}

export class NewsMacroListService {
  constructor(private readonly dataSource: NewsMacroDataSource = NewsMacroRepository) {}

  private parseLimit(limitParam?: string | null): number {
    if (!limitParam) return DEFAULT_LIST_LIMIT;
    const n = parseInt(limitParam, 10);
    if (isNaN(n) || n < 1 || n > MAX_LIST_LIMIT || String(n) !== limitParam.trim()) {
      throw new NewsMacroListError('limit must be an integer between 1 and 100', 'INVALID_LIMIT');
    }
    return Math.max(20, Math.min(n, MAX_LIST_LIMIT));
  }

  private parseCursor(cursorParam?: string | null) {
    if (!cursorParam) return null;
    const parts = cursorParam.split('#');
    if (parts.length !== 2) throw new NewsMacroListError('cursor format is invalid', 'INVALID_CURSOR');
    const id = parseInt(parts[1], 10);
    if (isNaN(id)) throw new NewsMacroListError('cursor id is invalid', 'INVALID_CURSOR');
    return { ts: parts[0], id };
  }

  private validateSymbol(symbol?: string | null): string | undefined {
    if (!symbol) return undefined;
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9_.]{1,20}$/.test(clean)) {
      throw new NewsMacroListError(`Invalid symbol: "${symbol}"`, 'INVALID_FILTER');
    }
    return clean;
  }

  private wrapQuery(params: NewsMacroListParams): NewsMacroQuery {
    return {
      limit: this.parseLimit(params.limit),
      cursor: this.parseCursor(params.cursor),
      symbol: this.validateSymbol(params.symbol),
      metricCode: params.metricCode || undefined,
      policyType: params.policyType || undefined,
    };
  }

  private formatItem(kind: NewsMacroKind, item: any): any {
    const rawTs = item.publishedAt || item.eventDate || item.observationDate || item.date || item.createdAt || new Date();
    const canonicalTimestamp = new Date(rawTs).toISOString();

    let key = `${kind.toLowerCase()}:${item.id}`;
    if (kind === 'NEWS' && item.url) {
      const cleanUrl = String(item.url).replace(/^https?:\/\//, '');
      key = `news:url:${cleanUrl}`;
    }

    return {
      ...item,
      key,
      canonicalTimestamp,
    };
  }

  private formatResponse(kind: NewsMacroKind, items: any[], limit: number) {
    const formatted = items.map((it) => this.formatItem(kind, it));
    return {
      kind,
      items: formatted,
      count: formatted.length,
      limit,
      maxLimit: MAX_LIST_LIMIT,
      nextCursor: null,
      dataStatus: 'OK',
      retrievedAt: new Date().toISOString(),
    };
  }

  async listNews(params: NewsMacroListParams) {
    const q = this.wrapQuery(params);
    try {
      const items = await this.dataSource.listNews(q);
      return this.formatResponse('NEWS', items, q.limit);
    } catch (err: any) {
      throw new NewsMacroUnavailableError(err?.message, 'DATA_UNAVAILABLE');
    }
  }

  async listPolicyEvents(params: NewsMacroListParams) {
    const q = this.wrapQuery(params);
    try {
      const items = await this.dataSource.listPolicyEvents(q);
      return this.formatResponse('POLICY_EVENT', items, q.limit);
    } catch (err: any) {
      throw new NewsMacroUnavailableError(err?.message, 'DATA_UNAVAILABLE');
    }
  }

  async listEarningsCalendar(params: NewsMacroListParams) {
    const q = this.wrapQuery(params);
    try {
      const items = await this.dataSource.listEarningsCalendar(q);
      return this.formatResponse('EARNINGS_EVENT', items, q.limit);
    } catch (err: any) {
      throw new NewsMacroUnavailableError(err?.message, 'DATA_UNAVAILABLE');
    }
  }

  async listMacroObservations(params: NewsMacroListParams) {
    const q = this.wrapQuery(params);
    try {
      const items = await this.dataSource.listMacroObservations(q);
      return this.formatResponse('MACRO_OBSERVATION', items, q.limit);
    } catch (err: any) {
      throw new NewsMacroUnavailableError(err?.message, 'DATA_UNAVAILABLE');
    }
  }
}

let defaultService: NewsMacroListService | null = null;

export function getNewsMacroListService(): NewsMacroListService {
  if (!defaultService) {
    defaultService = new NewsMacroListService();
  }
  return defaultService;
}
