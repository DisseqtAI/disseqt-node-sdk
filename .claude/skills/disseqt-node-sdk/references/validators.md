# Validators — How they work

The SDK groups validators by **domain**. Each domain is exposed as a field on `Client`, with one helper method per validator slug. The pattern is consistent enough that once you know one domain, you know them all — the variation is in the request body fields.

## Anatomy of a validator call

```ts
await client.<domain>.<helper>(data, config);
```

- `<domain>`: one of `input`, `output`, `rag`, `agentic`, `mcp`, `themes`, `composite`
- `<helper>`: camelCase of the slug (e.g. `prompt-injection` → `promptInjection`, `grammatical-correctness` → `grammarCorrectness`)
- `data`: a request init object — shape depends on the domain (see below)
- `config`: `{ threshold, customLabels?, labelThresholds? }` — required for every domain *except* `themes` and `composite`

`data` and `config` accept either camelCase or snake_case keys. The SDK normalises to snake_case on the wire.

## Domain summary

| Domain | Validators | Data shape | Config? | Endpoint |
|---|---|---|---|---|
| `input-validation` | 15 | `{ prompt }` (+ optional `context`, `response`) | yes | `/api/v1/sdk/validators/input-validation/{slug}` |
| `output-validation` | 32 | `{ prompt?, context?, response? }` | yes | `/api/v1/sdk/validators/output-validation/{slug}` |
| `rag-grounding` | 7 | `{ prompt?, context?, response? }` (context usually required by the validator semantically) | yes | `/api/v1/sdk/validators/rag-grounding/{slug}` |
| `agentic-behavior` | 8 | `{ conversationHistory?, toolCalls?, agentResponses?, referenceData? }` | yes | `/api/v1/sdk/validators/agentic-behavior/{slug}` |
| `mcp-security` | 3 | `{ prompt?, context?, response? }` | yes | `/api/v1/sdk/validators/mcp-security/{slug}` |
| `themes-classifier` | 1 (`classify`) | `{ text, returnSubthemes?, maxThemes? }` | no | `/api/v1/sdk/validators/themes-classifier/classify` — ⚠️ currently broken server-side |
| `composite` | 1 (`evaluate`) | `{ llmInputQuery, llmOutput, llmInputContext?, evaluationMode?, weightsOverride?, labelsThresholdsOverride?, overallConfidence? }` | no | `/api/v1/validators/composite/evaluate` (note: **no `/sdk/`**) |

## Per-validator detail: use the introspection script

Don't memorise slug→method translations or payload field names. Run:

```bash
node <skill-path>/scripts/introspect.mjs list
node <skill-path>/scripts/introspect.mjs show <domain> <slug>
```

`show` outputs:
- the exact helper method name on `Client`
- the enum value (e.g. `InputValidation.PromptInjection`)
- the request model class
- whether a `config` is required
- the full data field signature
- a copy-pasteable example call
- the wire payload the server actually receives

Example:
```bash
node scripts/introspect.mjs show output-validation grammatical-correctness
# → tells you the helper is client.output.grammarCorrectness (not grammaticalCorrectness)
```

## Wire envelope — what the SDK wraps for you

The SDK takes your `data` + `config` and assembles the body the server expects. You normally never need to touch this, but knowing the shape helps debug 4xx errors.

**Standard validators** (every domain except composite, and now themes too):
```json
{
  "input_data": { /* domain-specific fields, snake_case */ },
  "config_input": { "threshold": 0.5, "custom_labels": [...], "label_thresholds": [...] }
}
```

**Composite**:
```json
{
  "input_data": { "llm_input_query": "...", "llm_output": "...", "llm_input_context": "..." },
  "options": { "evaluation_mode": "binary_threshold", "weights_override": {...}, "labels_thresholds_override": {...} }
}
```

If the server returns "Invalid request format", the `input_data` wrapper is missing or the field names don't match. The themes-classifier 400 caught at the time of writing was exactly this — `ClassifyValidator.toPayload()` was returning the inner fields directly.

## Adding a new validator case to the smoke script

When a new slug ships, append a case to the matching `*Cases()` function in [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts):

```ts
{
  label: 'Input 16/16 NewValidator',
  domain: ValidatorDomain.InputValidation,
  slug: InputValidation.NewSlug,
  data: new InputValidationRequest({ prompt: 'realistic test input that should trigger the validator' }),
  config: config(0.5, ['Safe', 'Risk'], [0.5]),
},
```

Then bump `EXPECTED_VALIDATOR_COUNT`. The `config()` helper at the bottom of that file is just a shorthand constructor — pass `(threshold, labels, labelThresholds)`.

## When to use the generic `client.validate()` instead of helpers

You almost never need to. But for code that loops over a dynamic list of `(domain, slug, data)` triples, the generic form is convenient:

```ts
import { Client, ValidatorDomain, OutputValidation, OutputValidationRequest } from '@disseqt/ai-sdk';

await client.validate({
  domain: ValidatorDomain.OutputValidation,
  slug: OutputValidation.AnswerRelevance,
  data: new OutputValidationRequest({ prompt: 'q', response: 'a' }),
  config: { threshold: 0.5 },
});
```

The typed helper (`client.output.answerRelevance(...)`) is preferred for hand-written code because TypeScript catches typos in the slug name.
