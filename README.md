# @disseqt-ai/sdk

[![npm version](https://img.shields.io/npm/v/@disseqt-ai/sdk.svg)](https://www.npmjs.com/package/@disseqt-ai/sdk)
[![Node](https://img.shields.io/node/v/@disseqt-ai/sdk.svg)](https://nodejs.org)
[![Types](https://img.shields.io/npm/types/@disseqt-ai/sdk.svg)](https://www.npmjs.com/package/@disseqt-ai/sdk)
[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)

The official **Node.js / TypeScript SDK** for the [Disseqt AI](https://disseqt.ai) platform. Validate LLM inputs and outputs, score RAG and agentic workflows, run prompt packs, and emit OpenTelemetry-style traces — all from a single package, with first-class TypeScript types for ESM and CommonJS consumers.

**[Documentation](https://docs.disseqt.ai)** · **[API Reference](https://docs.disseqt.ai)** · **[Examples](./examples)** · **[Changelog](./CHANGELOG.md)**

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Validation](#validation)
  - [Composite Scoring](#composite-scoring)
  - [Agentic Tracing](#agentic-tracing)
  - [Prompt Packs](#prompt-packs)
- [Configuration](#configuration)
- [Available Validators](#available-validators)
- [Request Models](#request-models)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Two API Styles](#two-api-styles)
- [Defaults and Wire Conventions](#defaults-and-wire-conventions)
- [Smoke Testing](#smoke-testing)
- [Development](#development)
- [License](#license)

---

## Features

The package exposes three independent clients that share the same auth conventions but otherwise serve different product surfaces.

| Client                               | Purpose                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Client`** (alias `DisseqtClient`) | Synchronous request/response validation — 70 validators across 6 domains plus the composite scorer.                                          |
| **`DisseqtAgenticClient`**           | Fire-and-forget tracing. Emits OpenTelemetry-style spans for LLM calls, tool calls, and agent actions, with automatic batching and flushing. |
| **`DisseqtAPIClient`**               | Prompt-pack lifecycle: generate, run, attach output validations, download results.                                                           |

Shared traits:

- **TypeScript-first**, with hand-written types for every request and response shape.
- **Dual-module build** — ESM (`import`) and CommonJS (`require`) consumers both supported, types ship in `dist/`.
- **Zero runtime dependencies.**
- **Snake_case and camelCase** are both accepted on every config and request init.

---

## Installation

```bash
npm install @disseqt-ai/sdk
```

Requires **Node 18.18 or newer**. Works under any modern bundler (Vite, esbuild, webpack, Next.js, Remix, etc.).

---

## Quick Start

### Validation

```ts
import { Client } from '@disseqt-ai/sdk';

const client = new Client({
  projectId: 'your-project-id',
  apiKey: 'your-api-key',
});

const result = await client.input.toxicity(
  { prompt: 'You are absolutely worthless and should be ashamed.' },
  { threshold: 0.5, customLabels: ['Safe', 'Toxic'], labelThresholds: [0.5] },
);

console.log(result.score); // 0.9994
console.log(result.threshold_validated_result); // "Fail"
```

Every domain has a typed accessor on `Client`:

```ts
await client.input.promptInjection(data, config);
await client.output.factualConsistency(data, config);
await client.rag.contextRelevance(data, config);
await client.agentic.topicAdherence(data, config);
await client.mcp.dataLeakage(data, config);
await client.themes.classify(data); // no config
await client.composite.evaluate(data); // no config
```

See [Two API Styles](#two-api-styles) for the equivalent low-level `client.validate(validator)` form.

### Composite Scoring

Aggregates many validators into one weighted score:

```ts
const result = await client.composite.evaluate({
  llmInputQuery: 'What is the capital of France?',
  llmOutput: 'The capital of France is Paris.',
  llmInputContext: 'France is a country in Europe.',
  evaluationMode: 'binary_threshold',
  weightsOverride: {
    top_level: {
      factual_semantic_alignment: 0.5,
      language: 0.25,
      safety_security_integrity: 0.25,
    },
    submetrics: {
      /* per-metric weights, see examples/composite-score.ts */
    },
  },
});

console.log(result.overall_confidence.score);
console.log(result.overall_confidence.label);
```

### Agentic Tracing

```ts
import {
  DisseqtAgenticClient,
  SpanKind,
  startTrace,
  traceLlmCall,
  traceToolCall,
} from '@disseqt-ai/sdk';

const tracing = new DisseqtAgenticClient({
  projectId: 'your-project-id',
  apiKey: 'your-api-key',
  serviceName: 'assistant-service',
});

await startTrace(tracing, 'agent_workflow', { intentId: 'help-user' }).run(async (trace) => {
  const agent = trace.startSpan('agent_execution', SpanKind.AgentExec);
  agent.setAgentInfo('assistant', 'agent-001');

  const llm = traceLlmCall(trace, {
    name: 'chat_completion',
    modelName: 'gpt-4',
    provider: 'openai',
    inputMessages: [{ role: 'user', content: 'Hi' }],
    outputMessages: [{ role: 'assistant', content: 'Hello' }],
    inputTokens: 10,
    outputTokens: 5,
  });
  llm.close();

  const tool = traceToolCall(trace, { name: 'lookup', toolName: 'search', callId: 'call-1' });
  tool.close();

  agent.close();
});

// Always flush + shut down before process exit so buffered spans get sent.
await tracing.flush();
await tracing.shutdown();
```

`startTrace(...).run(callback)` is the safest pattern: the wrapper closes the trace and sends it to the buffer when the callback resolves or throws. For a function-decorator style, see `traceFunction` in [src/agentic/helpers.ts](./src/agentic/helpers.ts).

### Prompt Packs

```ts
import {
  DisseqtAPIClient,
  OutputValidationMetric,
  PromptPackOutputValidationCategory,
} from '@disseqt-ai/sdk';

const api = new DisseqtAPIClient({
  projectId: 'your-project-id',
  apiKey: 'your-api-key',
});

// 1. Generate a pack.
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

// 2. Run it against a model.
const run = await api.createRun(String(pack.id ?? pack.pack_id), {
  runName: 'SDK Evaluation Run',
  runType: 'evaluation',
  apiKey: 'provider-api-key',
  modelName: 'gpt-4',
  provider: 'openai',
});

// 3. Attach output validations.
await api.createOutputValidation(String(run.id ?? run.run_id), {
  promptPackOutputValidationRunName: 'Safety Validation',
  metricEvaluations: [
    {
      metricName: OutputValidationMetric.Toxicity,
      category: PromptPackOutputValidationCategory.OutputValidation,
    },
  ],
});
```

Snake_case method aliases (`generate_prompt_pack`, `create_run`, `download_pack_csv`, …) are exposed alongside their camelCase counterparts.

---

## Configuration

All three clients accept a config object passed directly into the constructor — no environment-variable lookups happen inside the SDK.

### `Client` (validation)

```ts
const client = new Client({
  projectId: 'your-project-id', // required
  apiKey: 'your-api-key', // required
  baseUrl: 'https://api.disseqt.ai/realtime-validations', // default; override for staging
  timeout: 30, // seconds; default 30
});
```

### `DisseqtAgenticClient` (tracing)

```ts
const tracing = new DisseqtAgenticClient({
  projectId: 'your-project-id', // required
  apiKey: 'your-api-key', // required
  serviceName: 'my-service', // required; shown on dashboards
  serviceVersion: '1.0.0', // optional
  environment: 'production', // optional
  endpoint: 'https://api.disseqt.ai/agentic-monitoring/api/v1/traces', // default
  maxBatchSize: 100, // optional buffer settings
  flushIntervalMs: 1000,
  maxRetries: 3,
});
```

### `DisseqtAPIClient` (prompt packs)

```ts
const api = new DisseqtAPIClient({
  projectId: 'your-project-id', // required
  apiKey: 'your-api-key', // required
  baseUrl: 'https://api.disseqt.ai', // default
  timeout: 30, // seconds
});
```

### `SDKConfigInput`

Every standard validator accepts a config block with these fields:

```ts
{
  threshold: number;                    // required; 0..1
  customLabels?: string[];              // optional, e.g. ['Safe', 'Risk', 'Critical']
  labelThresholds?: number[];           // optional; must have customLabels.length - 1 entries
}
```

`themes` and `composite` validators ignore this config.

---

## Available Validators

The SDK ships **70 validator slugs** across six working domains. Use the typed helper on `Client` (e.g. `client.input.toxicity(...)`) or the generic surface (see [Two API Styles](#two-api-styles)).

### Input Validation (`client.input.*`)

`toxicity` · `bias` · `prompt-injection` · `intersectionality` · `racial-bias` · `gender-bias` · `political-bias` · `self-harm` · `violence` · `terrorism` · `sexual-content` · `hate-speech` · `nsfw` · `invisible-text` · `child-safety` · `intent-guard` · `intent-compliance`

### Output Validation (`client.output.*`)

`factual-consistency` · `answer-relevance` · `conceptual-similarity` · `grammatical-correctness` · `response-tone` · `clarity` · `coherence` · `creativity` · `readability` · `diversity` · `narrative-continuity` · `bias` · `gender-bias` · `racial-bias` · `political-bias` · `intersectionality` · `toxicity` · `nsfw` · `terrorism` · `violence` · `self-harm` · `sexual-content` · `hate-speech` · `child-safety` · `data-leakage` · `insecure-output` · `intent-guard` · `intent-compliance` · `bleu-score` · `rouge-score` · `meteor-score` · `cosine-similarity` · `fuzzy-score` · `compression-score`

### RAG Grounding (`client.rag.*`)

`context-relevance` · `context-recall` · `context-precision` · `context-entities-recall` · `noise-sensitivity` · `response-relevancy` · `faithfulness`

### Agentic Behavior (`client.agentic.*`)

`topic-adherence` · `tool-call-accuracy` · `tool-failure-rate` · `plan-optimality` · `agent-goal-accuracy` · `intent-resolution` · `plan-coherence` · `fallback-rate`

### MCP Security (`client.mcp.*`)

`prompt-injection` · `data-leakage` · `insecure-output`

### Composite Score (`client.composite.evaluate`)

Single endpoint that aggregates many validators with configurable weights. Hits `/api/v1/validators/composite/evaluate` (no `/sdk/` prefix). See [examples/composite-score.ts](./examples/composite-score.ts).

---

## Request Models

Each validation domain has a typed request shape. Pass a plain object or an instance — both work.

| Model                     | Fields                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputValidationRequest`  | `prompt` (required), `context?`, `response?`                                                                                                                     |
| `OutputValidationRequest` | `prompt?`, `context?`, `response?`                                                                                                                               |
| `RagGroundingRequest`     | `prompt?`, `context?`, `response?` (context is usually required by the semantics)                                                                                |
| `AgenticBehaviourRequest` | `conversationHistory?`, `toolCalls?`, `agentResponses?`, `referenceData?`                                                                                        |
| `McpSecurityRequest`      | `prompt?`, `context?`, `response?`                                                                                                                               |
| `ThemesClassifierRequest` | `text` (required), `returnSubthemes?` (default `true`), `maxThemes?` (default `3`)                                                                               |
| `CompositeScoreRequest`   | `llmInputQuery` (required), `llmOutput` (required), `llmInputContext?`, `evaluationMode?`, `weightsOverride?`, `labelsThresholdsOverride?`, `overallConfidence?` |

All models accept both `camelCase` and `snake_case` field names. On the wire, the SDK serialises everything to `snake_case`.

---

## Response Format

Standard validator responses are plain JSON objects with this common shape:

```ts
{
  success: boolean;
  validator_type: string;       // domain, e.g. "input-validation"
  validator_name: string;       // slug, e.g. "toxicity"
  result: {
    data: {
      metric_name: string;
      actual_value: number;
      actual_value_type: 'float';
      metric_labels: string[];
      threshold: ['Pass' | 'Fail'];
      threshold_score: number;
      others: Record<string, unknown>;
    };
    status: { code: string; message: string };
  };
  score: number;
  threshold_validated_result: string;   // first matching custom_label
  duration: string;
  request_id: string;
  credit_details?: { /* ... */ };
}
```

The composite scorer returns a different envelope; see [`CompositeScoreResponse`](./src/validation/models.ts).

---

## Error Handling

The SDK throws structured errors so you can branch on them cleanly:

```ts
import { Client, DisseqtHttpError, DisseqtJsonError } from '@disseqt-ai/sdk';

const client = new Client({ projectId, apiKey });

try {
  const result = await client.input.toxicity({ prompt: '...' }, { threshold: 0.5 });
} catch (err) {
  if (err instanceof DisseqtHttpError) {
    console.error(`HTTP ${err.statusCode} ${err.method} ${err.url}`);
    console.error(`body: ${err.responseBody}`);
  } else if (err instanceof DisseqtJsonError) {
    console.error(`server returned non-JSON: ${err.responseText}`);
  } else {
    throw err;
  }
}
```

| Error class        | Raised when                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `DisseqtHttpError` | Server returned a non-2xx status; `statusCode`, `responseBody`, `method`, `url` are populated. |
| `DisseqtJsonError` | Response body wasn't valid JSON; `responseText` is populated.                                  |
| `DisseqtError`     | Base class; useful when you want a single `instanceof` check.                                  |

---

## Two API Styles

Every validation call has two equivalent forms. Use whichever fits your code.

**Typed helpers** (recommended for new code) — TypeScript catches slug typos at compile time:

```ts
await client.input.toxicity({ prompt: 'Hello' }, { threshold: 0.5 });
```

**Generic surface** — useful when the slug is dynamic at runtime, or when porting code from another SDK:

```ts
import { InputValidator, InputValidation, SDKConfigInput } from '@disseqt-ai/sdk';

await client.validate(
  new InputValidator({
    slug: InputValidation.Toxicity,
    data: { prompt: 'Hello' },
    config: new SDKConfigInput({ threshold: 0.5 }),
  }),
);
```

Both go through the same HTTP transport and produce identical results. The typed helpers are thin wrappers around `client.validate(...)`.

---

## Defaults and Wire Conventions

Defaults used when you don't override them:

| Setting                         | Value                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| Validation base URL             | `https://api.disseqt.ai/realtime-validations`                 |
| Validation route                | `POST /api/v1/sdk/validators/{domain}/{validator}`            |
| Composite route                 | `POST /api/v1/validators/composite/evaluate`                  |
| Prompt-packs base URL           | `https://api.disseqt.ai`                                      |
| Prompt-packs path prefix        | `/sdk/prompt-packs/api/v1/sdk/prompt-packs`                   |
| Agentic tracing endpoint        | `https://api.disseqt.ai/agentic-monitoring/api/v1/traces`     |
| Auth headers                    | `X-API-Key`, `X-Project-Id`, `Content-Type: application/json` |
| Default timeout                 | 30 seconds                                                    |
| Buffer flush interval (tracing) | 1000 ms                                                       |
| Buffer max size (tracing)       | 100 spans                                                     |

To target staging instead of production, pass `baseUrl: 'https://stage-api.disseqt.ai/realtime-validations'` (or the equivalent staging URL for tracing / prompt-packs).

---

## Smoke Testing

Bundled scripts for verifying the SDK works against your environment.

**Mocked**, no credentials required:

```bash
npm run smoke:all
```

**Live**, requires credentials:

```bash
DISSEQT_API_KEY=... DISSEQT_PROJECT_ID=... npm run smoke:all:live
```

**End-to-end against the live validation gateway** (70 validators, ~50 seconds):

```bash
DISSEQT_API_KEY=... DISSEQT_PROJECT_ID=... npm run validators:all
```

Optional overrides:

```bash
DISSEQT_VALIDATION_BASE_URL=https://api.disseqt.ai/realtime-validations
DISSEQT_AGENTIC_ENDPOINT=https://api.disseqt.ai/agentic-monitoring/api/v1/traces
DISSEQT_TIMEOUT_SECONDS=30
```

Each script prints one-line `[PASS]` / `[FAIL]` entries and exits non-zero if any case fails.

---

## Development

```bash
# Clone and set up
git clone https://github.com/DisseqtAI/disseqt-node-sdk.git
cd disseqt-node-sdk
npm install

# Run the gates locally before pushing
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format:check  # Prettier
npm test              # Vitest, 78+ unit tests
npm run build         # tsup, produces dist/
```

### Repository layout

```
src/
  validation/    # Client, validators, request models, helpers
  agentic/       # DisseqtAgenticClient, trace, span, buffer, transport
  prompt-packs/  # DisseqtAPIClient, request models
  http/          # Shared transport + types
examples/        # Runnable .ts snippets per surface
scripts/         # Smoke runners
tests/           # Vitest specs (one per source folder)
```

---

## License

Proprietary — Copyright © Disseqt AI Limited. All rights reserved. See [LICENSE](./LICENSE) for terms.

Support and licensing inquiries: **support@disseqt.ai**
