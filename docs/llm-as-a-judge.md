# LLM-as-a-Judge

Grade any paired validator with a **certified LLM judge** running on your own
LLM account, instead of Disseqt's classic ML model.

The division of labor: **you bring the model** (OpenAI, Anthropic, Bedrock, or
any OpenAI-compatible endpoint — your key, your bill, your data agreement);
**Disseqt brings the rubric** — versioned, certified grading criteria, a fixed
scoring formula, and a verdict traceable to the exact rubric version that
produced it.

## Prerequisites

1. **An LLM Integration in your project** — Dashboard → AI Inventory →
   LLM Integrations → _Add Custom LLM_. Integrations are **per project, per
   environment**.
2. **Its Integration ID** — the table's **ID** column (and the row's view
   modal) has one-click copy. This UUID is what you pass as `llmId`.
   - It is the **integration's** id, not a model name.
   - Only **Permanent** integrations have a usable id; Temporary models are
     session-only.

## Quickstart

```ts
import { Client, InputValidation, InputValidator } from '@disseqt/sdk';

const client = new Client({ projectId: 'proj_123', apiKey: 'dsk_...' });

const result = await client.validate(
  new InputValidator({
    slug: InputValidation.Toxicity,
    data: { prompt: 'have a lovely day' },
    config: {
      threshold: 0.5,
      llmAsAJudge: true,
      llmId: '25dc0684-a394-4389-ad59-90b27138badf', // copied from the dashboard
    },
  }),
);

console.log(result.score); // 0.0082
console.log(result.threshold_validated_result); // "Pass"
console.log(result.result.data.others.model); // which LLM judged
```

`llmId` is **mandatory** with `llmAsAJudge: true`, enforced at construction —
a missing id throws immediately, on your machine, instead of a server error
after the request is in flight. The mirror rule also throws: `llmId` without
the flag would be a silent no-op. Snake_case aliases (`llm_as_a_judge`,
`llm_id`) are accepted, matching the Python SDK.

## Choosing which LLM judges

Selection is always **explicit** — with several integrations in a project,
the id you pass is the whole answer. There is no "first one" or "most recent".

Per-call overrides via the `judge` object (power users):

```ts
config: {
  threshold: 0.7,
  llmAsAJudge: true,
  llmId: GPT5_INTEGRATION_ID,
  judge: {
    model: 'gpt-5-mini',   // override the integration's pinned model
    criteria: 'Penalize any answer that does not cite a source.',
  },
}
```

| Key             | Effect                                                          |
| --------------- | --------------------------------------------------------------- |
| `model`         | Overrides the integration's pinned model for this call          |
| `criteria`      | Extra grading guidance — **quality judges only**                |
| `custom_llm_id` | Legacy spelling of the integration id; `llmId` wins on conflict |

Not choosable per call: the provider, endpoint, and API key always come from
the stored integration — server-authoritative, so a request can never
redirect your decrypted key.

## Reading the result

Read the receipts in `result.result.data.others` — never assume which model ran:

| Field              | Meaning                                                      |
| ------------------ | ------------------------------------------------------------ |
| `engine`           | `"llm-judge"` — a judge (not the ML model) produced this     |
| `model`            | The model that actually judged                               |
| `rubric_version`   | The certified rubric version (e.g. `"v17"`)                  |
| `reasoning`        | The judge's written justification                            |
| `severity`         | Safety judges: the 1–10 severity behind the score            |
| `scoring_path`     | Quality judges: `"logprob_weighted"` \| `"rating_fallback"`  |
| `criteria_ignored` | Present when `criteria` was sent to a certified safety judge |

Top level: `validator_name` (what ran, e.g. `"llm-judge-toxicity"`) and
`origin_validator` (what you asked for, when the reroute renamed the run).

## Safety vs quality judges

|                   | Safety (toxicity, hate speech, …)                       | Quality (helpfulness, coherence, …) |
| ----------------- | ------------------------------------------------------- | ----------------------------------- |
| Score means       | Higher = **worse**                                      | Higher = **better**                 |
| Default threshold | 0.5 — fails **at/above**                                | 0.7 — passes **at/above**           |
| `criteria`        | **Ignored** (frozen rubric; `criteria_ignored` stamped) | Applied                             |

`customLabels` / `labelThresholds` are display-only relabels — order them
along the judge's score axis (for safety, higher is worse).

## Parallel multi-model runs

Each request is independent down the whole chain; run different integrations
concurrently and compare using the receipts. Keep concurrency modest (the
platform caps concurrent judge dispatches; sustained bursts are rate limited),
remember parallel judges share **your** provider quota — and never compare raw
scores across models as a shared scale (`scoring_path` can differ per
provider). Compare verdicts and disagreement rates instead.

## Billing & errors

One Disseqt credit per run, deducted **before** dispatch; the inference itself
bills on your provider account. Config errors (unknown integration, missing
key) are rejected before billing and are free; post-dispatch failures consume
the credit.

| Error                                          | Meaning                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Error: llmAsAJudge: true requires llmId …`    | Thrown at construction — pass `llmId`                                                                                                                           |
| `Error: llmId is only used with llmAsAJudge …` | Thrown at construction — set the flag or drop the id                                                                                                            |
| HTTP 400                                       | Integration not in this project / no stored key                                                                                                                 |
| HTTP 402 / 403 / 429                           | Credits / plan gate / rate limit                                                                                                                                |
| HTTP 502                                       | Judge backend or **your provider** failed — including your key being rejected or throttled. Check the integration's connection test and your provider dashboard |
