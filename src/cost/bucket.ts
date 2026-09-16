// Running cost totals attached to a `withCostContext` scope.
// Mirrors Python's `CostBucket` (telemetry.py). Fields are additive;
// callers add per-call figures with `addSimulation` / `addEvaluation`.

export interface CostEntry {
  readonly label: string;
  readonly simulationCost: number;
  readonly evaluationCost: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface CostTokens {
  promptTokens?: number;
  completionTokens?: number;
  label?: string;
}

export interface CostTotals {
  simulationCost: number;
  evaluationCost: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
}

export class CostBucket {
  simulationCost = 0;
  evaluationCost = 0;
  promptTokens = 0;
  completionTokens = 0;
  private readonly _entries: CostEntry[] = [];

  /** Immutable view of recorded entries. */
  get entries(): readonly CostEntry[] {
    return this._entries;
  }

  get totalCost(): number {
    return this.simulationCost + this.evaluationCost;
  }

  addSimulation(costUsd: number, tokens: CostTokens = {}): void {
    this.record({
      label: tokens.label ?? 'simulation',
      simulationCost: costUsd,
      evaluationCost: 0,
      promptTokens: tokens.promptTokens ?? 0,
      completionTokens: tokens.completionTokens ?? 0,
    });
  }

  addEvaluation(costUsd: number, tokens: CostTokens = {}): void {
    this.record({
      label: tokens.label ?? 'evaluation',
      simulationCost: 0,
      evaluationCost: costUsd,
      promptTokens: tokens.promptTokens ?? 0,
      completionTokens: tokens.completionTokens ?? 0,
    });
  }

  totals(): CostTotals {
    return {
      simulationCost: this.simulationCost,
      evaluationCost: this.evaluationCost,
      totalCost: this.totalCost,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
    };
  }

  /** Deep copy suitable for logging/serialisation; safe to mutate. */
  snapshot(): CostTotals & { entries: CostEntry[] } {
    return {
      ...this.totals(),
      entries: this._entries.map((entry) => ({ ...entry })),
    };
  }

  private record(entry: CostEntry): void {
    this.simulationCost += entry.simulationCost;
    this.evaluationCost += entry.evaluationCost;
    this.promptTokens += entry.promptTokens;
    this.completionTokens += entry.completionTokens;
    this._entries.push(entry);
  }
}
