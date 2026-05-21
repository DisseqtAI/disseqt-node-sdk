import type { DisseqtSpan } from './span.js';
import type { DisseqtTrace } from './trace.js';

let currentTrace: DisseqtTrace | null = null;
let currentSpan: DisseqtSpan | null = null;

export function getCurrentTrace(): DisseqtTrace | null {
  return currentTrace;
}

export function setCurrentTrace(trace: DisseqtTrace | null): void {
  currentTrace = trace;
}

export function getCurrentSpan(): DisseqtSpan | null {
  return currentSpan;
}

export function setCurrentSpan(span: DisseqtSpan | null): void {
  currentSpan = span;
}

export function clearContext(): void {
  currentTrace = null;
  currentSpan = null;
}
