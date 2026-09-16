// AsyncLocalStorage-backed cost context — Node's answer to Python's
// `cost_accumulator()` contextmanager + `ContextVar`. A bucket bound
// inside `withCostContext(fn)` is visible to any async descendant of
// `fn` via `currentCostBucket()`, including nested awaits.

import { AsyncLocalStorage } from 'node:async_hooks';

import { CostBucket } from './bucket.js';

const storage = new AsyncLocalStorage<CostBucket>();

/**
 * Run `fn` with a fresh `CostBucket` bound to the current async context.
 * Any code executed transitively inside `fn` (including through awaits)
 * can call `currentCostBucket()` to attribute costs to this bucket.
 * The bucket is returned to the caller so totals can be inspected once
 * `fn` resolves.
 */
export function withCostContext<T>(fn: (bucket: CostBucket) => T): T {
  const bucket = new CostBucket();
  return storage.run(bucket, () => fn(bucket));
}

/** Return the active `CostBucket`, or `undefined` when no scope is bound. */
export function currentCostBucket(): CostBucket | undefined {
  return storage.getStore();
}
