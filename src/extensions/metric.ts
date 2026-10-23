// Named metric (Python `BaseMetric`): criteria + threshold + labels. `name` must equal the
// server-side `control.MetricName` for control-test wiring to fire.
export interface BaseMetricOptions {
  criteria?: string;
  labels?: readonly string[];
  lowerIsBetter?: boolean;
}

export class BaseMetric {
  readonly name: string;
  readonly threshold: number;
  readonly criteria: string;
  readonly labels: readonly string[];
  readonly lowerIsBetter: boolean;

  constructor(name: string, threshold: number, opts: BaseMetricOptions = {}) {
    this.name = name;
    this.threshold = threshold;
    this.criteria = opts.criteria ?? '';
    this.labels = opts.labels ?? [];
    this.lowerIsBetter = opts.lowerIsBetter ?? true;
  }
}
