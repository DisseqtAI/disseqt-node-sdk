# Composite Score

The composite scorer aggregates multiple individual metrics into a single score with configurable weights. It lives at a **different endpoint** than the other validators:

- Standard validators: `POST /api/v1/sdk/validators/{domain}/{slug}` (envelope: `{ input_data, config_input }`)
- Composite: `POST /api/v1/validators/composite/evaluate` (envelope: `{ input_data, options }`)

The SDK handles the routing — you call `client.composite.evaluate(data)` and the right URL + payload shape are used.

## Minimal call

```ts
import { Client } from '@disseqt-ai/sdk';

const client = new Client({
  apiKey: process.env.DISSEQT_API_KEY!,
  projectId: process.env.DISSEQT_PROJECT_ID!,
});

const result = await client.composite.evaluate({
  llmInputQuery: 'What is the capital of France?',
  llmOutput: 'The capital of France is Paris.',
  llmInputContext: 'France is a country in Europe.',   // optional
  evaluationMode: 'binary_threshold',                  // default
});
```

## With weight overrides

The defaults are domain-tuned, but you can override:

```ts
await client.composite.evaluate({
  llmInputQuery: '...',
  llmOutput: '...',
  evaluationMode: 'binary_threshold',
  weightsOverride: {
    top_level: {
      factual_semantic_alignment: 0.5,
      language: 0.25,
      safety_security_integrity: 0.25,
    },
    submetrics: {
      factual_semantic_alignment: {
        factual_consistency: 0.7,
        answer_relevance: 0.05,
        conceptual_similarity: 0.05,
        compression_score: 0.05,
        rouge_score: 0.05,
        cosine_similarity: 0.02,
        bleu_score: 0.02,
        fuzzy_score: 0.02,
        meteor_score: 0.04,
      },
      language: { clarity: 0.4, readability: 0.3, response_tone: 0.3 },
      safety_security_integrity: {
        toxicity: 0.3,
        gender_bias: 0.15,
        racial_bias: 0.15,
        hate_speech: 0.2,
        data_leakage: 0.15,
        insecure_output: 0.05,
      },
    },
  },
  labelsThresholdsOverride: {
    // optional — see scripts/run-all-validators.ts compositeScoreCase() for the full shape
  },
});
```

The top-level weights must sum to ~1.0 across the three categories; each submetric block must sum to ~1.0 within its parent. The server is forgiving but consistency matters for interpretable scores.

For a complete working example with all override fields populated, see `compositeScoreCase()` in [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts).

## Response shape

```jsonc
{
  "score": 0.32,
  "threshold_validated_result": "Low Confidence",
  // ... per-metric breakdowns under nested keys
}
```

The smoke runner's pretty-print at the top of `run-all-validators.ts` shows which fields to expect (`score`, `label`, `metrics` count).
