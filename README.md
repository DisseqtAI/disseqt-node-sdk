# Disseqt SDK for Node.js

Node.js SDK for Disseqt AI validation, prompt packs, and agentic tracing.

The SDK is authored in TypeScript and published as JavaScript with type declarations for both ESM and CommonJS consumers.

## Installation

```bash
npm install @disseqt-ai/sdk
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Smoke Test

Run every validator slug and every agentic span kind in mocked mode:

```bash
npm run smoke:all
```

Run the same script against live services:

```bash
DISSEQT_API_KEY=... DISSEQT_PROJECT_ID=... npm run smoke:all:live
```

Optional live overrides:

```bash
DISSEQT_VALIDATION_BASE_URL=https://api.disseqt.ai/realtime-validations
DISSEQT_AGENTIC_ENDPOINT=https://api.disseqt.ai/agentic-monitoring/api/v1/traces
```

The smoke script prints one-line `[PASS]` / `[FAIL]` entries and exits non-zero if any validator or span check fails.

## Run All Validators Locally

Create a `.env` file or export credentials:

```bash
DISSEQT_API_KEY=...
DISSEQT_PROJECT_ID=...
DISSEQT_VALIDATION_BASE_URL=https://api.disseqt.ai/realtime-validations
DISSEQT_TIMEOUT_SECONDS=30
```

Run the TypeScript validator walkthrough:

```bash
npm run validators:all
```

The script at `scripts/run-all-validators.ts` runs every supported validator case against the live Disseqt API, logs one line per pass/fail, continues after errors, and exits non-zero when any validator fails.

## Validation

```ts
import { Client } from '@disseqt-ai/sdk';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const result = await client.input.toxicity(
  { prompt: 'What do you think about politics?' },
  { threshold: 0.5 },
);
```

A lower-level generic surface is also available when you want to drive validators by domain and slug at runtime:

```ts
import { InputValidation, InputValidator, SDKConfigInput } from '@disseqt-ai/sdk';

await client.validate(
  new InputValidator({
    slug: InputValidation.Toxicity,
    data: { prompt: 'Hello' },
    config: new SDKConfigInput({ threshold: 0.5 }),
  }),
);
```

## Prompt Packs

```ts
import {
  DisseqtAPIClient,
  OutputValidationMetric,
  PromptPackOutputValidationCategory,
} from '@disseqt-ai/sdk';

const api = new DisseqtAPIClient({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const pack = await api.generatePromptPack({
  packName: 'Security Pack',
  packShortDesc: 'AI-generated prompts for security testing',
  author: 'AI Generator',
  domain: 'Security',
  generationType: 'AI',
  categories: [
    { mainCategory: 'reliability_and_safety', subcategory: 'hate_speech', promptsCount: 5 },
  ],
});
```

Snake_case method aliases such as `generate_prompt_pack`, `create_run`, and `download_pack_csv` are exposed alongside their camelCase counterparts so either naming style works.

## Agentic Tracing

```ts
import { DisseqtAgenticClient, SpanKind, startTrace, traceLlmCall } from '@disseqt-ai/sdk';

const agentic = new DisseqtAgenticClient({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  serviceName: 'assistant-service',
});

await startTrace(agentic, 'agent_workflow').run(async (trace) => {
  const span = trace.startSpan('agent_execution', SpanKind.AgentExec);
  span.setAgentInfo('assistant', 'agent-001');

  const llmSpan = traceLlmCall(trace, {
    name: 'chat_completion',
    modelName: 'gpt-4',
    provider: 'openai',
    inputTokens: 10,
    outputTokens: 5,
  });
  llmSpan.close();
  span.close();
});

await agentic.flush();
await agentic.shutdown();
```

## Defaults and Wire Conventions

Default endpoints and headers used by the clients:

- Headers: `X-API-Key`, `X-Project-Id`, and `Content-Type: application/json`
- Validation default base URL: `https://api.disseqt.ai/realtime-validations`
- Validation path: `/api/v1/sdk/validators/{domain}/{validator}`
- Composite path: `/api/v1/validators/composite/evaluate`
- Prompt Packs default base URL: `https://api.disseqt.ai`
- Prompt Packs path prefix: `/sdk/prompt-packs/api/v1/sdk/prompt-packs`
- Agentic endpoint: `https://api.disseqt.ai/agentic-monitoring/api/v1/traces`

See [examples](./examples) for more complete usage.
