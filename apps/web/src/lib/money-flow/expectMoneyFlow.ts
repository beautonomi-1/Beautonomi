export type MoneyFlowLeg = {
  transaction_type: string;
  amount?: number;
  net?: number;
  metadata?: Record<string, unknown>;
};

export type MoneyFlowExpectation = {
  legs: Array<{ type: string; amount?: number; metadata?: Record<string, unknown> }>;
};

/**
 * Test helper: assert ledger legs match expected types and optional amounts (2dp).
 */
export function expectMoneyFlow(actual: MoneyFlowLeg[], expected: MoneyFlowExpectation): void {
  const byType = new Map<string, MoneyFlowLeg[]>();
  for (const row of actual) {
    const key = String(row.transaction_type);
    const list = byType.get(key) ?? [];
    list.push(row);
    byType.set(key, list);
  }

  for (const exp of expected.legs) {
    const rows = byType.get(exp.type) ?? [];
    if (rows.length === 0) {
      throw new Error(`Missing ledger leg: ${exp.type}`);
    }
    const row = rows.shift()!;
    byType.set(exp.type, rows);
    if (exp.amount !== undefined) {
      const got = Number(row.amount ?? row.net ?? 0);
      if (Math.abs(got - exp.amount) > 0.011) {
        throw new Error(`Leg ${exp.type}: expected amount ${exp.amount}, got ${got}`);
      }
    }
    if (exp.metadata) {
      for (const [k, v] of Object.entries(exp.metadata)) {
        if ((row.metadata as Record<string, unknown> | undefined)?.[k] !== v) {
          throw new Error(`Leg ${exp.type}: metadata.${k} mismatch`);
        }
      }
    }
  }
}
