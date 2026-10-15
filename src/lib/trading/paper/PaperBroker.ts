export class PaperBroker {
  private balance: number = 100_000_000;
  private positions: any[] = [];

  getAccount() {
    return {
      balance: this.balance,
      equity: this.balance,
      positions: this.positions,
    };
  }

  getPositions() {
    return this.positions;
  }
}
