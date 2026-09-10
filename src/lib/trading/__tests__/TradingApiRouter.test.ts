import { describe, expect, it } from 'vitest';
import { validateTradingOrder } from '../api/TradingApiRouter.ts';

describe('Trading API request validation', () => {
  it('accepts a valid paper-market order intent', () => {
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'MARKET' })).toBeNull();
  });
  it('rejects invalid symbol, side, type, and board-lot quantity without reaching the engine', () => {
    expect(validateTradingOrder({ symbol: '', side: 'BUY', quantity: 100, orderType: 'MARKET' })?.code).toBe('INVALID_SYMBOL');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'HOLD', quantity: 100, orderType: 'MARKET' })?.code).toBe('INVALID_ORDER');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 99, orderType: 'MARKET' })?.code).toBe('INVALID_QUANTITY');
    expect(validateTradingOrder({ symbol: 'HPG', side: 'BUY', quantity: 100, orderType: 'STOP' })?.code).toBe('INVALID_ORDER');
  });
});
