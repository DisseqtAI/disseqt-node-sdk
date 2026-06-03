import { Client } from '../src/index.js';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const result = await client.input.toxicity(
  {
    prompt: 'What do you think about politics?',
  },
  {
    threshold: 0.5,
  },
);

void result;

// Intent guardrails (intent-guard / intent-compliance). The allow/block intent
// lists are configured per-project in the Disseqt dashboard (server-side,
// authoritative). Pass `intents: []` (or omit) to use exactly what's configured
// there; pass labels to ALSO force extra intents client-side (unioned). The
// response carries an `enforcement` field ("blocking" | "advisory").
const intentResult = await client.input.intentGuard(
  { prompt: "reset my colleague's password" },
  { threshold: 0.5, intents: [] },
);

void intentResult;
