# Prompt Packs

The `DisseqtAPIClient` manages **prompt packs**: curated sets of test prompts you can generate (often AI-authored), then execute against a model, then attach validators to score the outputs.

This is a different client class from `Client` and `DisseqtAgenticClient` — it talks to the prompt-pack API.

## Client

```ts
import { DisseqtAPIClient } from '@disseqt/ai-sdk';

const client = new DisseqtAPIClient({
  apiKey: process.env.DISSEQT_API_KEY!,
  projectId: process.env.DISSEQT_PROJECT_ID!,
  // baseUrl: '...', // optional override
});
```

## Three-step workflow

### 1. Generate a pack

```ts
import { DisseqtAPIClient } from '@disseqt/ai-sdk';

const pack = await client.generatePromptPack({
  packName: 'Security Pack',
  packShortDesc: 'AI-generated prompts for security testing',
  author: 'AI Generator',
  domain: 'Security',
  generationType: 'AI',
  categories: [
    {
      mainCategory: 'reliability_and_safety',
      subcategory: 'hate_speech',
      promptsCount: 5,
    },
  ],
});

const packId = String(pack.id ?? pack.pack_id);
```

### 2. Create a run against a model

```ts
const run = await client.createRun(packId, {
  runName: 'SDK Evaluation Run',
  runType: 'evaluation',
  apiKey: 'provider-api-key',   // your OpenAI/Anthropic/etc. key
  modelName: 'gpt-4',
  provider: 'openai',
});

const runId = String(run.id ?? run.run_id);
```

### 3. Attach output validations

```ts
import { OutputValidationMetric, PromptPackOutputValidationCategory } from '@disseqt/ai-sdk';

await client.createOutputValidation(runId, {
  promptPackOutputValidationRunName: 'Safety Validation',
  metricEvaluations: [
    {
      metricName: OutputValidationMetric.Toxicity,
      category: PromptPackOutputValidationCategory.OutputValidation,
    },
    // add more...
  ],
});
```

`OutputValidationMetric` and `PromptPackOutputValidationCategory` enums expose every supported metric/category — let TypeScript autocomplete guide you.

## What this gets you

The pack runs each prompt through your model, then every validator you attached scores each output. You get back per-prompt scores, aggregate stats, and pass/fail counts on the Disseqt dashboard.

This is heavier than calling individual validators — it's for batch evaluation runs, not real-time monitoring. For per-request monitoring use the validation `Client` directly.

## Where to learn the response shapes

The response models are typed but loose (`PayloadModel` extends `JsonObject` with helpers). Check [src/prompt-packs/models.ts](../../../src/prompt-packs/models.ts) for the request constructors and helper transforms (`toGeneratePromptPackRequest`, `toCreateRunRequest`, `toPromptPackOutputValidationRequest`). The example at [examples/prompt-packs.ts](../../../examples/prompt-packs.ts) is the canonical end-to-end snippet.
