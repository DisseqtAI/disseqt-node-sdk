import {
  Client,
  InputValidation,
  InputValidationRequest,
  InputValidator,
  anyBlocking,
  isAsync,
  parsePolicy,
} from '../src/index.js';

// A realtime policy is a named, versioned bundle of validators — with
// thresholds and a decision strategy — authored in the Disseqt dashboard and
// evaluated by policy id. Only *published* policies are visible to the SDK.
const POLICY_ID = 'your-policy-uuid';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  // Required to evaluate policies — the Decisions ledger attributes each
  // decision to this application.
  applicationName: 'example-app',
});

// Shape 3 — policies only. Pass a bare request model (no validator, no
// config); the policy owns thresholds and the decision strategy.
const result = await client.validate(new InputValidationRequest({ prompt: 'user prompt here' }), {
  policies: [POLICY_ID],
});

if (anyBlocking(result)) {
  // At least one policy said BLOCK — do not pass this input downstream.
}

// Each entry in result.policies is one policy verdict; parsePolicy() turns
// it into a typed decision with the per-rule breakdown.
const decision = parsePolicy(result.policies[0]);
void decision?.decision; // 'BLOCK' | 'PASS'
void decision?.enforcement; // 'sync' | 'async'
for (const ruleset of decision?.rulesets ?? []) {
  for (const rule of ruleset.rules) {
    // Per-rule breakdown: rule.validator, rule.status, rule.score, rule.threshold
    void rule;
  }
}

// Async policies return without a final decision — the verdict lands on the
// realtime-validations dashboard once background processing completes.
if (isAsync(result.policies[0])) {
  // Record and move on; don't gate on isBlocking here.
}

// Shape 2 — validator + policies. The validator runs with your config AND
// the same input is evaluated against each policy.
const combined = await client.validate(
  new InputValidator({
    slug: InputValidation.Toxicity,
    data: new InputValidationRequest({ prompt: 'user prompt here' }),
    config: { threshold: 0.5 },
  }),
  { policies: [POLICY_ID] },
);

void combined.validation; // the toxicity result (your config applies to it)
void combined.policies; // one full-policy verdict per id, in order

// Client-level default — every validate() call is policy-checked unless the
// call passes its own { policies } (per-call always wins).
const governed = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  applicationName: 'example-app',
  policies: [POLICY_ID],
});

const governedResult = await governed.validate(
  new InputValidationRequest({ prompt: 'user prompt here' }),
);

void anyBlocking(governedResult);
