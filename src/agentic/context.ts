import { AsyncLocalStorage } from 'node:async_hooks';

import type { DisseqtSpan } from './span.js';
import type { DisseqtTrace } from './trace.js';

interface ContextStore {
  trace: DisseqtTrace | null;
  span: DisseqtSpan | null;
}

// Each concurrent traced flow (see `runInIsolatedContext` below, consumed by
// TraceWrapper.run() in helpers.ts) gets its own ContextStore that follows
// that flow's `await` chain via Node's async_hooks, instead of one process-
// wide pointer. This mirrors Python's fix: swapping `threading.local()` for
// `contextvars.ContextVar`, which is itself tracked per-asyncio-Task rather
// than per-OS-thread. AsyncLocalStorage is the Node analogue: it isolates
// state per logical async execution chain rather than per OS thread.
const asyncLocalStorage = new AsyncLocalStorage<ContextStore>();

// Fallback store for code that constructs DisseqtTrace/DisseqtSpan directly
// without going through TraceWrapper.run() (e.g. existing tests, or any
// caller using the low-level API outside of an isolated context). This
// preserves the pre-existing single-global behavior for that usage pattern;
// it is not concurrency-safe, same as before this fix.
const rootStore: ContextStore = { trace: null, span: null };

function currentStore(): ContextStore {
  return asyncLocalStorage.getStore() ?? rootStore;
}

export function getCurrentTrace(): DisseqtTrace | null {
  return currentStore().trace;
}

export function setCurrentTrace(trace: DisseqtTrace | null): void {
  currentStore().trace = trace;
}

export function getCurrentSpan(): DisseqtSpan | null {
  return currentStore().span;
}

export function setCurrentSpan(span: DisseqtSpan | null): void {
  currentStore().span = span;
}

export function clearContext(): void {
  const store = currentStore();
  store.trace = null;
  store.span = null;
}

/**
 * Runs `fn` inside a fresh, isolated async-tracking context so that
 * concurrent invocations (e.g. two overlapping `startTrace(...).run(...)`
 * calls interleaving on the same event loop) never see or clobber each
 * other's current trace/span, even across `await` boundaries. Internal
 * helper consumed by `TraceWrapper.run()` (helpers.ts); it is additive and
 * does not change the signature or behavior of any existing exported
 * function above.
 */
export function runInIsolatedContext<T>(initialTrace: DisseqtTrace | null, fn: () => T): T {
  return asyncLocalStorage.run({ trace: initialTrace, span: null }, fn);
}
