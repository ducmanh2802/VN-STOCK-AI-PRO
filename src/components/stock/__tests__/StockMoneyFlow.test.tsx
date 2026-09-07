import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockMoneyFlow } from '../StockMoneyFlow.tsx';
import type { MoneyFlowData } from '../../../types/stockDetail';
import type {
  ForeignFlowResult,
  MoneyFlowResult,
} from '../../../lib/analysis/moneyFlow/MoneyFlowEngine';

const NO_FOREIGN_MESSAGE =
  'Không có dữ liệu giao dịch khối ngoại phiên này (hệ thống không suy đoán khi thiếu dữ liệu).';

const MOCK_MONEY_FLOW: MoneyFlowData = {
  largeOrderPercent: 10,
  mediumOrderPercent: 40,
  smallOrderPercent: 50,
  foreignNetValue: 0,
  foreignBuyValue: 0,
  foreignSellValue: 0,
  propTradingNetValue: 0,
  activeBuyVolume: 1000000,
  activeSellVolume: 800000,
  netFlowVolume: 200000,
  orderPressureRatio: 1.25,
};

function fullAnalysis(foreignFlow: ForeignFlowResult): MoneyFlowResult {
  return {
    score: 50,
    trend: 'NEUTRAL',
    foreignFlow,
    volumeSignal: {
      currentVolume: 1000000,
      volumeSMA20: 800000,
      volumeRatio: 1.25,
      status: 'ABOVE_AVERAGE',
      interpretation: 'Khối lượng trên trung bình.',
    },
    accumulationSignal: {
      status: 'NEUTRAL',
      moneyFlowMultiplier: 0,
      adTrend: 'FLAT',
      cmf20: null,
      description: '',
    },
    priceVolumeRelationship: {
      pattern: 'NEUTRAL',
      priceChangePct: 0,
      volumeRatio: 1.25,
      description: '',
    },
    tradingValue: 0,
    institutionalFlow: {
      hasData: false,
      largeOrdersBuy: null,
      largeOrdersSell: null,
      netBigMoney: null,
      description: '',
    },
    reasons: [],
    warnings: [],
  };
}

const NO_DATA_FOREIGN: ForeignFlowResult = {
  buy: null,
  sell: null,
  net: null,
  foreignBuy: null,
  foreignSell: null,
  foreignNet: null,
  buyValue: null,
  sellValue: null,
  netValue: null,
  signal: 'NO_DATA',
  percentageOfTotalVolume: null,
  description: 'Không có dữ liệu giao dịch khối ngoại (không suy đoán).',
};

const NET_BUY_FOREIGN: ForeignFlowResult = {
  buy: 500000,
  sell: 200000,
  net: 300000,
  foreignBuy: 500000,
  foreignSell: 200000,
  foreignNet: 300000,
  buyValue: 60000000000,
  sellValue: 24000000000,
  netValue: 36000000000,
  signal: 'NET_BUY',
  percentageOfTotalVolume: 8.75,
  description: 'Khối ngoại mua ròng 300.000 cổ phiếu.',
};

describe('StockMoneyFlow — regression: undefined / NO_DATA foreign flow must never crash', () => {
  it('renders the unavailable foreign-flow state when analysis is undefined (the production 500 crash case)', () => {
    const html = renderToStaticMarkup(
      <StockMoneyFlow moneyFlow={MOCK_MONEY_FLOW} analysis={undefined} />
    );
    expect(html).toContain(NO_FOREIGN_MESSAGE);
  });

  it('renders the unavailable foreign-flow state when analysis.foreignFlow.signal is NO_DATA', () => {
    const html = renderToStaticMarkup(
      <StockMoneyFlow moneyFlow={MOCK_MONEY_FLOW} analysis={fullAnalysis(NO_DATA_FOREIGN)} />
    );
    expect(html).toContain(NO_FOREIGN_MESSAGE);
    // The foreign grid (with buy/sell columns) must NOT be rendered when there is no data.
    expect(html).not.toContain('Foreign Buy');
  });

  it('renders real foreign buy/sell values from validated engine data when available', () => {
    const html = renderToStaticMarkup(
      <StockMoneyFlow moneyFlow={MOCK_MONEY_FLOW} analysis={fullAnalysis(NET_BUY_FOREIGN)} />
    );
    expect(html).toContain('Mua ròng');
    expect(html).toContain('Foreign Buy');
    expect(html).not.toContain(NO_FOREIGN_MESSAGE);
  });
});