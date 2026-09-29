import { Buffer } from 'node:buffer';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AgenticAttributes,
  DisseqtAgenticClient,
  startTrace,
  traceLlmCall,
} from '../../src/index.js';

/**
 * Reproduces the Node-SDK analogue of the Python `threading.local()`
 * current-trace/current-span concurrency bug (disseqt_agentic_sdk/context/context.py).
 *
 * `src/agentic/context.ts` stores "current trace" / "current span" in plain
 * module-level `let` bindings, shared by the entire process. `DisseqtSpan`'s
 * constructor (src/agentic/span.ts) does an IMPLICIT parent-span lookup via
 * `getCurrentSpan()` when no explicit `parentSpanId` is supplied — this is
 * the implicit lookup path also used by the public `traceLlmCall` /
 * `traceAgentAction` / `traceToolCall` helpers (src/agentic/helpers.ts),
 * since they all funnel through `trace.startSpan()`.
 *
 * These tests never assert on SDK return values alone — they assert on the
 * JSON body actually received by a local `node:http` stub server, mirroring
 * exactly what a real Disseqt ingestion endpoint would see.
 */

interface StubServer {
  server: Server;
  port: number;
  requests: unknown[];
}

interface CustomTraceRequestBody {
  resource: { attributes: Record<string, unknown> };
  traces: {
    traceId: string;
    spans: {
      traceId: string;
      spanId: string;
      parentSpanId: string;
      name: string;
      spanKind: string;
      attributes?: Record<string, unknown>;
    }[];
  }[];
}

async function startStubServer(): Promise<StubServer> {
  const requests: unknown[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        requests.push(JSON.parse(raw));
      } catch {
        requests.push({ parseError: true, raw });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Bind to an OS-assigned ephemeral port (port 0) rather than a fixed
    // port in a "probably free" range: this makes a bind collision
    // structurally impossible instead of merely unlikely.
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, port: address.port, requests };
}

async function stopStubServer(stub: StubServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stub.server.close((err) => (err ? reject(err) : resolve()));
  });
}

function createClientFor(stub: StubServer): DisseqtAgenticClient {
  return new DisseqtAgenticClient({
    apiKey: 'fake-key',
    projectId: 'test-project',
    serviceName: 'context-concurrency-test',
    endpoint: `http://127.0.0.1:${stub.port}/agentic-monitoring/api/v1/traces`,
    // Large enough that nothing auto-flushes mid-test; we flush explicitly.
    flushIntervalMs: 60_000,
    maxBatchSize: 1_000,
  });
}

/**
 * One "logical request": starts a trace and, via the SDK's public
 * `traceLlmCall` helper (which internally calls `trace.startSpan()` and
 * relies on the implicit current-span lookup for parent linkage), creates
 * a parent span, awaits (yielding the event loop to any concurrently
 * running flow), then creates a nested child span the same way.
 */
async function runTracedFlow(
  client: DisseqtAgenticClient,
  label: string,
  delaysMs: [number, number],
): Promise<{ traceId: string; parentSpanId: string; childSpanId: string }> {
  return startTrace(client, `${label}-workflow`, { user_id: label }).run(async (trace) => {
    const parentSpan = traceLlmCall(trace, {
      name: `${label}-parent`,
      model_name: 'gpt-4',
      provider: 'openai',
      attributes: { flow: label },
    });

    await delay(delaysMs[0]);

    // Implicit nesting: no parentSpanId is passed, so this depends entirely
    // on getCurrentSpan() still pointing at `parentSpan` from this SAME
    // logical flow, even though another concurrent flow's spans may have
    // been created (and clobbered the shared module-level `currentSpan`)
    // during the `await` above.
    const childSpan = traceLlmCall(trace, {
      name: `${label}-child`,
      model_name: 'gpt-4',
      provider: 'openai',
      attributes: { flow: label },
    });

    await delay(delaysMs[1]);

    childSpan.close();
    parentSpan.close();

    return {
      traceId: trace.traceId,
      parentSpanId: parentSpan.spanId,
      childSpanId: childSpan.spanId,
    };
  });
}

describe('agentic context concurrency', () => {
  let stub: StubServer | undefined;

  afterEach(async () => {
    if (stub) {
      await stopStubServer(stub);
      stub = undefined;
    }
  });

  it('keeps nested span parent linkage correct within a single flow (no concurrency)', async () => {
    stub = await startStubServer();
    const client = createClientFor(stub);

    const result = await runTracedFlow(client, 'solo', [5, 5]);
    await client.flush();
    await client.shutdown();

    expect(stub.requests).toHaveLength(1);
    const body = stub.requests[0] as CustomTraceRequestBody;
    expect(body.traces).toHaveLength(1);

    const spans = body.traces[0]?.spans ?? [];
    expect(spans).toHaveLength(2);

    const childSpan = spans.find((s) => s.name === 'solo-child');
    const parentSpan = spans.find((s) => s.name === 'solo-parent');
    expect(parentSpan?.spanId).toBe(result.parentSpanId);
    expect(childSpan?.parentSpanId).toBe(result.parentSpanId);
    expect(childSpan?.traceId).toBe(result.traceId);
  });

  it('does not corrupt parent-span linkage or trace/span attribution across two concurrent overlapping flows', async () => {
    stub = await startStubServer();
    const client = createClientFor(stub);

    // Staggered delays force genuine interleaving: flow A creates its
    // parent span, yields; flow B creates ITS parent span (clobbering the
    // shared module-level `currentSpan`), yields; flow A resumes and
    // creates its child span while the shared pointer belongs to B.
    const [resultA, resultB] = await Promise.all([
      runTracedFlow(client, 'flow-a', [10, 15]),
      runTracedFlow(client, 'flow-b', [4, 20]),
    ]);

    await client.flush();
    await client.shutdown();

    expect(stub.requests.length).toBeGreaterThanOrEqual(1);
    // Merge every span from every request the stub received, in case the
    // two sendTrace() calls landed in separate buffer flushes.
    const allTraceEntries = (stub.requests as CustomTraceRequestBody[]).flatMap((r) => r.traces);

    expect(resultA.traceId).not.toBe(resultB.traceId);

    for (const result of [resultA, resultB]) {
      const traceEntry = allTraceEntries.find((t) => t.traceId === result.traceId);
      expect(traceEntry, `no request body contained trace ${result.traceId}`).toBeDefined();

      const spans = traceEntry?.spans ?? [];
      // Every span attributed to this trace must actually belong to it —
      // catches spans leaking into the wrong trace's bucket.
      for (const span of spans) {
        expect(span.traceId).toBe(result.traceId);
      }
      expect(spans).toHaveLength(2);

      const parentSpan = spans.find((s) => s.spanId === result.parentSpanId);
      const childSpan = spans.find((s) => s.spanId === result.childSpanId);
      expect(parentSpan).toBeDefined();
      expect(childSpan).toBeDefined();

      // The core assertion: the child span's recorded parentSpanId must be
      // THIS flow's parent span, not '' (lost link) and not the other
      // flow's span id (cross-flow corruption).
      expect(childSpan?.parentSpanId).toBe(result.parentSpanId);
      expect(childSpan?.parentSpanId).not.toBe('');

      // Attributes must not have been overwritten by the other flow either.
      expect(parentSpan?.attributes?.flow).toBe(result === resultA ? 'flow-a' : 'flow-b');
      expect(parentSpan?.attributes?.[AgenticAttributes.RequestModel]).toBe('gpt-4');
    }
  });
});
