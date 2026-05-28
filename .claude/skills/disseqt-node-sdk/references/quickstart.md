# Quickstart — `@disseqt/ai-sdk`

## Install

```bash
npm install @disseqt/ai-sdk
# or
pnpm add @disseqt/ai-sdk
# or
yarn add @disseqt/ai-sdk
```

Requires Node ≥ 18.18. ESM-first; the CommonJS build is bundled at `dist/index.cjs` for `require()` users.

## Auth

Every client takes an API key and project ID. Pull them from env vars to keep them out of source.

```
DISSEQT_API_KEY=...
DISSEQT_PROJECT_ID=...
# Optional overrides:
DISSEQT_VALIDATION_BASE_URL=https://production-monitoring-eu.disseqt.ai  # default
DISSEQT_AGENTIC_ENDPOINT=https://api.disseqt.ai/agentic-monitoring/api/v1/traces  # default
```

The smoke script also recognises `DISSEQT_TIMEOUT_SECONDS` and `DISSEQT_DEBUG=1`.

## First validator call

```ts
import { Client } from '@disseqt/ai-sdk';

const client = new Client({
  apiKey: process.env.DISSEQT_API_KEY!,
  projectId: process.env.DISSEQT_PROJECT_ID!,
});

const result = await client.input.toxicity(
  { prompt: 'You are absolutely worthless and should be ashamed of yourself.' },
  { threshold: 0.5, customLabels: ['Non Toxic', 'Toxic', 'Highly Toxic'], labelThresholds: [0.4, 0.7] },
);

console.log(result.score, result.threshold_validated_result);
```

`result` is a plain `JsonObject`. Common fields the server returns: `success`, `score`, `validator_type`, `validator_name`, `threshold_validated_result`, `duration`, `request_id`, `credit_details`.

## First trace

```ts
import { DisseqtAgenticClient, startTrace, traceLlmCall } from '@disseqt/ai-sdk';

const client = new DisseqtAgenticClient({
  apiKey: process.env.DISSEQT_API_KEY!,
  projectId: process.env.DISSEQT_PROJECT_ID!,
  serviceName: 'my-assistant',
});

await startTrace(client, 'chat_turn').run(async (trace) => {
  const llm = traceLlmCall(trace, {
    name: 'completion',
    modelName: 'gpt-4',
    provider: 'openai',
    inputMessages: [{ role: 'user', content: 'hi' }],
    outputMessages: [{ role: 'assistant', content: 'hello' }],
    inputTokens: 1,
    outputTokens: 1,
  });
  llm.close();
});

await client.flush();
await client.shutdown();
```

The `.run(callback)` pattern auto-closes and sends the trace when the callback resolves. Without it you must call `traceWrapper.close()` yourself.

## Smoke-test the full suite

```bash
DISSEQT_API_KEY=... DISSEQT_PROJECT_ID=... npm run validators:all
```

That runs [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts) — currently 66 cases. Use it as a template when adding new cases.

## Common pitfalls

- **Calling `Client.validate()` directly with an unknown domain** throws "config is required for standard validators". Pass the typed helper (`client.input.toxicity(...)`) instead, or supply `config` in the generic request.
- **Forgetting to flush the tracing client** silently drops in-flight spans on process exit. Always `await client.flush(); await client.shutdown();` before the process ends.
- **Themes classifier** returns HTTP 500 server-side right now — the SDK shape is correct but the server route isn't dispatching. Skip it.
- **Camel/snake mixing**: every config and request init accepts both `apiKey`/`api_key`, `projectId`/`project_id`, etc. Prefer camelCase in TypeScript; snake_case exists for Python parity.
