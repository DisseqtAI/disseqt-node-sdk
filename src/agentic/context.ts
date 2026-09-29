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
// without going through TraceWrapper.run() or runInIsolatedContext()
// (e.g. existing tests, or any caller using the low-level API outside of
// an isolated context). This preserves the pre-existing single-global
// behavior for that usage pattern -- it is NOT concurrency-safe, same as
// before this fix. Two concurrent flows that both construct
// DisseqtTrace/DisseqtSpan directly (never calling startTrace(...).run(),
// and never wrapping their own code in runInIsolatedContext()) can still
// clobber each other's "current trace"/"current span" here exactly as
// they could before this fix. If your framework can't express a request
// as one wrapping callback (e.g. a trace started in one middleware, spans
// added in route handlers, ended in a later middleware), wrap that
// request's entire handling in runInIsolatedContext(null, () => { ... })
// yourself to get the same isolation TraceWrapper.run() provides.
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
 * other's current trace/span, even across `await` boundaries.
 *
 * `TraceWrapper.run()` (helpers.ts) calls this automatically for the
 * `startTrace(...).run(callback)` pattern. If your code manages a trace
 * imperatively instead -- constructing `DisseqtTrace`/`DisseqtSpan`
 * directly and starting/ending it across separate points in your own
 * code (e.g. HTTP middleware) rather than one wrapping callback -- call
 * this yourself, wrapping that logical flow's entire lifetime, to get
 * the same per-flow isolation. Without it, directly-constructed traces
 * and spans share a single unisolated store across all concurrent
 * flows (see `rootStore` above) -- exactly the pre-existing, not
 * concurrency-safe behavior.
 */
export function runInIsolatedContext<T>(initialTrace: DisseqtTrace | null, fn: () => T): T {
  return asyncLocalStorage.run({ trace: initialTrace, span: null }, fn);
}
