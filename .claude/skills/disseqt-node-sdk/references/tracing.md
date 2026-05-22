# Agentic Tracing

The tracing client is **separate** from the validation `Client`. They share auth conventions but talk to different endpoints and serve different purposes — validation is synchronous request/response, tracing is fire-and-forget telemetry.

## Mental model

- A **trace** represents one logical workflow (one chat turn, one agent run, one cron tick).
- A trace contains **spans**: nested timed events. `SpanKind.AgentExec`, `SpanKind.ModelExec`, `SpanKind.ToolExec`, etc.
- Spans are appended to a per-client **buffer**, which flushes to the Disseqt ingest endpoint on an interval or when full.
- Buffered means: if your process exits without flushing, those spans are gone. **Always `await client.flush()` and `await client.shutdown()` before exit.**

## Client setup

```ts
import { DisseqtAgenticClient } from '@disseqt/ai-sdk';

const client = new DisseqtAgenticClient({
  apiKey: process.env.DISSEQT_API_KEY!,
  projectId: process.env.DISSEQT_PROJECT_ID!,
  serviceName: 'my-assistant',     // logical name of your service in dashboards
  serviceVersion: '1.0.0',         // default '1.0.0'
  environment: 'production',       // default 'production'
  endpoint: '...',                 // default 'https://api.disseqt.ai/agentic-monitoring/api/v1/traces'
  maxBatchSize: 100,               // flush when buffer hits this many spans
  flushIntervalMs: 1000,           // OR flush every N ms (whichever first)
  maxRetries: 3,
});
```

## Three idiomatic patterns

### 1. Block scope: `startTrace(...).run(callback)` (recommended)

```ts
import { startTrace, traceLlmCall } from '@disseqt/ai-sdk';

await startTrace(client, 'chat_turn', { intentId: 'q1' }).run(async (trace) => {
  const llm = traceLlmCall(trace, {
    name: 'completion',
    modelName: 'gpt-4',
    provider: 'openai',
    inputMessages: [{ role: 'user', content: 'Hi' }],
    outputMessages: [{ role: 'assistant', content: 'Hello' }],
    inputTokens: 5,
    outputTokens: 3,
  });
  llm.close();
});
```

The `.run()` wrapper closes the trace and sends it to the buffer when the callback resolves *or throws* — no manual bookkeeping. This is the safest pattern.

### 2. Function decorator: `traceFunction`

For wrapping an existing handler in one call:

```ts
import { traceFunction, SpanKind } from '@disseqt/ai-sdk';

const handleChatTurn = traceFunction(
  client,
  async (msg: string) => {
    // ... do work
    return 'response';
  },
  { name: 'handle_chat_turn', kind: SpanKind.AgentExec },
);

await handleChatTurn('Hi');
```

Each call opens its own trace. Exceptions are recorded on the span as errors and then re-thrown.

### 3. Manual trace lifecycle

If you need to thread a trace across boundaries that the `.run()` shape can't model (e.g. an event loop, multiple async batches):

```ts
import { startTrace } from '@disseqt/ai-sdk';

const wrapper = startTrace(client, 'long_running_workflow');
const span = wrapper.trace.startSpan('step_1', SpanKind.Internal);
span.setAttribute('items_processed', 42);
span.close();
wrapper.close();   // sends the trace
```

Don't forget the final `wrapper.close()` — without it nothing leaves the buffer.

## Specialised span helpers

These build spans with the right attributes for common operation types so dashboards render them correctly.

### `traceLlmCall(trace, options)`

```ts
const llm = traceLlmCall(trace, {
  name: 'chat_completion',
  modelName: 'gpt-4',                                    // required
  provider: 'openai',                                    // required
  inputMessages: [{ role: 'user', content: '...' }],     // optional
  outputMessages: [{ role: 'assistant', content: '...' }],
  inputTokens: 120,                                      // pair: both or neither
  outputTokens: 45,
  temperature: 0.7,                                      // optional
  maxTokens: 1024,                                       // optional
  attributes: { 'custom.tag': 'experiment-a' },
});
llm.close();
```

### `traceToolCall(trace, options)`

```ts
const tool = traceToolCall(trace, {
  name: 'search_web',
  toolName: 'search_engine',         // required
  callId: 'call-abc123',             // optional, matches OpenAI tool-call IDs
  toolDefinitions: [/* JSON schemas */],
});
tool.close();
```

### `traceAgentAction(trace, options)`

```ts
const action = traceAgentAction(trace, {
  name: 'plan_step',
  agentName: 'planner',              // required
  agentId: 'planner-v2',             // optional
  agentVersion: '1.3.0',             // optional
  operation: 'planning',             // optional, free-form
});
action.close();
```

## SpanKind enum

Run `node <skill-path>/scripts/introspect.mjs tracing` for the up-to-date list. Typical values: `AgentExec`, `ModelExec`, `ToolExec`, `McpExec`, `Internal`, `Client`, `Server`, `Producer`, `Consumer`.

## Global client pattern

If your codebase wants ambient access (the way OpenTelemetry's global tracer works), set a singleton:

```ts
import { setClient, getCurrentClient, isInitialized } from '@disseqt/ai-sdk';

setClient(new DisseqtAgenticClient({ /* config */ }));

// anywhere downstream:
const client = getCurrentClient();   // throws if not initialised
if (isInitialized()) { /* ... */ }
```

`shutdown()` clears the global too.

## Trace IDs and metadata

```ts
await startTrace(client, 'workflow', {
  traceId: '...',         // optional, auto-generated if omitted
  intentId: 'help-user',  // links to your intent taxonomy
  workflowId: 'wf-42',
  userId: 'user-1',
}).run(async (trace) => { /* ... */ });
```

## Exit cleanup

```ts
await client.flush();      // forces any pending spans out
await client.shutdown();   // stops the background flush loop
```

In long-running services, you don't need to flush after every trace — let the buffer do its job. But always shut down cleanly on `SIGINT`/`SIGTERM`.

```ts
process.on('SIGTERM', async () => {
  await client.shutdown();
  process.exit(0);
});
```
