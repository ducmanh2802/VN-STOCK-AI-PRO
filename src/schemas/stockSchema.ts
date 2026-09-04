import { z } from 'zod';

export const MarketExchangeSchema = z.enum(['HOSE', 'HNX', 'UPCOM']);
export const StockTrendSchema = z.enum(['UPTREND', 'DOWNTREND', 'SIDEWAY']);

export const StockSummarySchema = z.object({
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
  ceilingPrice: z.number().nonnegative(),
  floorPrice: z.number().nonnegative(),
  marketCap: z.number().nonnegative(),
  pe: z.number(),
  pb: z.number(),
  roe: z.number(),
  rsi: z.number(),
  trend: StockTrendSchema,
  aiScore: z.number().min(0).max(100),
  fairValue: z.number().nonnegative(),
  sparkline: z.array(z.number()),
  isDemo: z.literal(true),
});

export const TopMoverSchema = z.object({
  symbol: z.string().min(1).max(10),
  companyName: z.string(),
  exchange: MarketExchangeSchema,
  price: z.number().nonnegative(),
  change: z.number(),
  changePercent: z.number(),
  volume: z.number().nonnegative(),
  tradingValue: z.number().nonnegative(),
  isDemo: z.literal(true),
});

export const SectorHeatmapItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  changePercent: z.number(),
  marketCap: z.number().nonnegative(),
  leaderSymbol: z.string(),
  stocksCount: z.number().int().positive(),
  volume: z.number().nonnegative(),
  isDemo: z.literal(true),
});

export const IndexDataSchema = z.object({
  symbol: z.enum(['VN-INDEX', 'VN30', 'HNX-INDEX', 'UPCOM-INDEX']),
  displayName: z.string(),
  value: z.number().positive(),
  change: z.number(),
  changePercent: z.number(),
  totalVolume: z.number().nonnegative(),
  totalValue: z.number().nonnegative(),
  advances: z.number().int().nonnegative(),
  declines: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  ceilings: z.number().int().nonnegative(),
  floors: z.number().int().nonnegative(),
  status: z.enum(['TRADING', 'CLOSED']),
  sparkline: z.array(z.number()),
  isDemo: z.literal(true),
});

export const MarketStatusSchema = z.object({
  state: z.enum(['TRADING', 'CLOSED']),
  stateLabel: z.enum(['ĐANG GIAO DỊCH', 'ĐÓNG CỬA']),
  sessionName: z.enum(['Phiên sáng', 'Phiên chiều', 'Khớp lệnh liên tục', 'Phiên ATC', 'Đã đóng cửa']),
  timestamp: z.string(),
  isDemo: z.literal(true),
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
  isDemo: z.literal(true),
});
