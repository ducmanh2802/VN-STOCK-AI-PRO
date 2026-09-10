import { describe, it, expect } from 'vitest';
import type { BrokerAdapter } from '../execution/BrokerAdapter.ts';
import { PaperBroker } from '../paper/PaperBroker.ts';

describe('Phase 18.3 — BrokerAdapter Contract', () => {
  it('verifies PaperBroker fulfills the BrokerAdapter contract', async () => {
    const broker: BrokerAdapter = new PaperBroker({
      initialCash: 50_000_000,
      skipSessionValidation: true,
    });

    expect(broker.name).toBe('PaperBroker');
    expect(broker.isSimulation).toBe(true);
    expect(typeof broker.submitOrder).toBe('function');
    expect(typeof broker.cancelOrder).toBe('function');
    expect(typeof broker.getOrder).toBe('function');
    expect(typeof broker.getOpenOrders).toBe('function');
    expect(typeof broker.getPosition).toBe('function');
    expect(typeof broker.getPositions).toBe('function');
    expect(typeof broker.getAccount).toBe('function');

    const account = await broker.getAccount();
    expect(account.cash).toBe(50_000_000);
    expect(account.availableCash).toBe(50_000_000);
    expect(account.reservedCash).toBe(0);
    expect(account.positions).toEqual([]);
    expect(account.openOrders).toEqual([]);
  });
});
