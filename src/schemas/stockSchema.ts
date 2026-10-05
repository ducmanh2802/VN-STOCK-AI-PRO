import { z } from 'zod';

export const MarketExchangeSchema = z.enum(['HOSE', 'HNX', 'UPCOM']);
export const StockTrendSchema = z.enum(['UPTREND', 'DOWNTREND', 'SIDEWAY']);
export const StockSummaryDataStatusSchema = z.enum(['AVAILABLE', 'PARTIAL', 'UNAVAILABLE']);
export const DataFreshnessStatusSchema = z.enum(['CURRENT', 'STALE', 'UNAVAILABLE', 'INVALID']);

/**
 * P0-02 SCHEMA-LEVEL ENFORCEMENT.
 * A payload may claim `dataFreshness: 'CURRENT'` only when it carries a real
 * source timestamp. `CURRENT` + a missing/null `sourceTimestamp` is exactly the
 * P0-02 defect and is now rejected at the boundary rather than merely discouraged.
 */
const FreshnessProvenanceRefinement = <T extends { dataFreshness?: unknown; sourceTimestamp?: unknown }>(
  value: T,
  ctx: z.RefinementCtx
): void => {
  if (value.dataFreshness === 'CURRENT') {
    const ts = value.sourceTimestamp;
    const present = ts !== undefined && ts !== null && String(ts).trim() !== '';
    if (!present) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "dataFreshness 'CURRENT' requires a real sourceTimestamp; a missing or null source timestamp must resolve to 'UNAVAILABLE'.",
        path: ['sourceTimestamp'],
      });
    }
  }
};

export const StockSummarySchema = z
  .object({
  symbol: z.string().min(1).max(10),
  companyName: z.string().min(1),
  exchange: MarketExchangeSchema,
  sector: z.string(),
  price: z.number().nonnegative(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number().nonnegative(),
  tradingValue: z.number().nonnegative(),
  open: z.number().nonnegative(),
  high: z.number().nonnegative(),
  low: z.number().nonnegative(),
  refPrice: z.number().nonnegative(),
  ceilingPrice: z.number().nonnegative().nullable(),
  floorPrice: z.number().nonnegative().nullable(),
  /** P0-03: `null` means UNAVAILABLE — never a fabricated value, never `0`. */
  marketCap: z.number().nonnegative().nullable(),
  pe: z.number().nonnegative().nullable(),
  pb: z.number().nonnegative().nullable(),
  roe: z.number().nullable(),
  rsi: z.number().min(0).max(100).nullable(),
  trend: StockTrendSchema,
  aiScore: z.number().min(0).max(100),
  fairValue: z.number().nonnegative().nullable(),
  sparkline: z.array(z.number()),
  isDemo: z.boolean().optional(),
  dataStatus: StockSummaryDataStatusSchema.optional(),
  dataFreshness: DataFreshnessStatusSchema.optional(),
  fetchedAt: z.string().optional(),
  sourceTimestamp: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .superRefine(FreshnessProvenanceRefinement);

export const TopMoverSchema = z.object({
  symbol: z.string().min(1).max(10),
  companyName: z.string(),
  exchange: MarketExchangeSchema,
  price: z.number().nonnegative(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number().nonnegative(),
  tradingValue: z.number().nonnegative(),
  isDemo: z.boolean().optional(),
});

export const SectorHeatmapItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  changePercent: z.number(),
  /** P0-03: `null` when no constituent has an authoritative market cap. */
  marketCap: z.number().nonnegative().nullable(),
  leaderSymbol: z.string(),
  stocksCount: z.number().int().positive(),
  volume: z.number().nonnegative(),
  isDemo: z.boolean().optional(),
});

export const IndexDataSchema = z.object({
  symbol: z.enum(['VN-INDEX', 'VN30', 'HNX-INDEX', 'UPCOM-INDEX']),
  displayName: z.string(),
  /**
   * P0-03: nullable. A level is only present when an authoritative index feed
   * backs it; otherwise `levelSource` must be 'UNAVAILABLE' and the level is null.
   */
  value: z.number().positive().nullable(),
  change: z.number().nullable(),
  changePercent: z.number(),
  totalVolume: z.number().nonnegative(),
  totalValue: z.number().nonnegative(),
  advances: z.number().int().nonnegative(),
  declines: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  ceilings: z.number().int().nonnegative(),
  floors: z.number().int().nonnegative(),
  status: z.enum(['TRADING', 'CLOSED']),
  sparkline: z.array(z.number()).nullable(),
  isDemo: z.boolean().optional(),
  levelSource: z.enum(['AUTHORITATIVE_INDEX_FEED', 'UNAVAILABLE', 'DEMO']),
  levelProvenance: z.string(),
});

export const MarketStatusSchema = z.object({
  state: z.enum(['TRADING', 'CLOSED']),
  stateLabel: z.enum(['ĐANG GIAO DỊCH', 'ĐÓNG CỬA']),
  sessionName: z.enum(['Phiên sáng', 'Phiên chiều', 'Khớp lệnh liên tục', 'Phiên ATC', 'Đã đóng cửa']),
  timestamp: z.string(),
  isDemo: z.boolean().optional(),
});

export const AIMarketSummarySchema = z.object({
  trend: z.enum(['TÍCH CỰC', 'TRUNG TÍNH', 'TIÊU CỰC']),
  trendScore: z.number().min(0).max(100),
  moneyFlow: z.string(),
  strongSectors: z.array(z.string()),
  weakSectors: z.array(z.string()),
  riskAlerts: z.array(z.string()),
  overallComment: z.string(),
  disclaimer: z.string(),
  updatedAt: z.string(),
  isDemo: z.boolean().optional(),
});
