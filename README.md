# Disseqt SDK for Node.js

Node.js SDK for Disseqt AI validation, prompt packs, and agentic tracing.

The SDK is authored in TypeScript and published as JavaScript with type declarations for both ESM and CommonJS consumers.

## Installation

```bash
npm install @disseqt/ai-sdk
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Validation

```ts
import { Client } from '@disseqt/ai-sdk';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const result = await client.input.toxicity(
  { prompt: 'What do you think about politics?' },
  { threshold: 0.5 },
);
```

The generic Python-compatible surface is also available:

```ts
import { InputValidation, InputValidator, SDKConfigInput } from '@disseqt/ai-sdk';

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
} from '@disseqt/ai-sdk';

const api = new DisseqtAPIClient({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  baseUrl: 'http://localhost:8000',
});

const pack = await api.generatePromptPack({
  packName: 'Security Pack',
  packShortDesc: 'AI-generated prompts for security testing',
  author: 'AI Generator',
  domain: 'Security',
  generationType: 'AI',
  categories: [{ mainCategory: 'reliability_and_safety', subcategory: 'hate_speech', promptsCount: 5 }],
});
```

Python-compatible method names such as `generate_prompt_pack`, `create_run`, and `download_pack_csv` are available alongside camelCase aliases.

## Agentic Tracing

```ts
import { DisseqtAgenticClient, SpanKind, startTrace, traceLlmCall } from '@disseqt/ai-sdk';

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

## Compatibility

The Node SDK mirrors the Python SDK wire behavior:

- Headers: `X-API-Key`, `X-Project-Id`, and `Content-Type: application/json`
- Validation default base URL: `https://production-monitoring-eu.disseqt.ai`
- Validation path: `/api/v1/sdk/validators/{domain}/{validator}`
- Composite path: `/api/v1/validators/composite/evaluate`
- Prompt Packs default base URL: `http://localhost:8000`
- Prompt Packs path prefix: `/sdk/prompt-packs/api/v1/sdk/prompt-packs`
- Agentic endpoint: `https://api.disseqt.ai/agentic-monitoring/api/v1/traces`

See [examples](./examples) for more complete usage.
