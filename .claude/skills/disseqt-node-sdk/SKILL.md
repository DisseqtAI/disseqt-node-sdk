---
name: disseqt-node-sdk
description: Reference and recipes for using `@disseqt-ai/sdk` (the Disseqt Node.js / TypeScript SDK) — calling any of its ~66 validators (input/output/RAG/agentic/MCP/composite), setting up agentic tracing with spans for LLM and tool calls, generating and running prompt packs, plus internal scaffolding for adding new validator cases. Invoke this skill whenever the user mentions `@disseqt-ai/sdk`, the `disseqt-node-sdk` repo, the `Client` / `DisseqtAgenticClient` / `DisseqtAPIClient` classes, validator slugs like `toxicity` / `prompt-injection` / `factual-consistency` / `topic-adherence` / `prompt-injection`, the `validators:all` script, `startTrace` / `traceLlmCall` / `traceToolCall`, "composite score", "prompt pack", or asks how to wire Disseqt validation or tracing into a Node/TypeScript codebase — even if they don't name the SDK explicitly.
---

# Disseqt Node SDK Reference

This skill helps you use `@disseqt-ai/sdk` correctly without reading the source. It covers three product surfaces and the workflows that go with them.

## The three surfaces

The SDK exposes three independent client classes. They share the API-key/project-ID auth pattern but otherwise don't depend on each other.

| Class | Module | Purpose |
|---|---|---|
| `Client` (alias `DisseqtClient`) | `@disseqt-ai/sdk` | Run any of the ~66 individual validators or the Composite Score evaluator. Synchronous request/response. |
| `DisseqtAgenticClient` | `@disseqt-ai/sdk` | Emit OpenTelemetry-style traces of agent runs (LLM calls, tool calls, agent actions). Buffered, fire-and-forget. |
| `DisseqtAPIClient` | `@disseqt-ai/sdk` | Manage Prompt Packs: generate a pack, create a run against a model, attach output validations. |

If the user's question touches validators → load `references/validators.md`. Tracing → `references/tracing.md`. Composite scoring → `references/composite.md`. Prompt packs → `references/prompt-packs.md`. Anything about installation, auth, env vars, or first call → `references/quickstart.md`.

## When you need exact validator detail, use the introspection script

The SDK ships ~66 individual validators across 6 working domains. Rather than maintain a static list that drifts from the code, this skill bundles a script that reads the SDK's bundled type declarations (or source, when running inside the SDK repo) and prints exact signatures, payload shapes, and example calls.

Run it whenever the user asks "how do I call validator X?", "what fields does Y take?", "list all output validators", or you're scaffolding a new validator case and need the slug.

```bash
node <skill-path>/scripts/introspect.mjs list                          # all validators grouped by domain
node <skill-path>/scripts/introspect.mjs show input-validation toxicity # one validator: helper, payload, example
node <skill-path>/scripts/introspect.mjs show output-validation bleu-score
node <skill-path>/scripts/introspect.mjs tracing                       # tracing API surface
```

The script auto-locates the SDK in this order:
1. `$DISSEQT_SDK_ROOT` if set
2. `./node_modules/@disseqt-ai/sdk/dist` (consumer project)
3. `./src` and `./dist` (running inside `disseqt-node-sdk` repo)

If none resolve, it prints a clear error telling you to set `DISSEQT_SDK_ROOT` or `cd` into a project that depends on the SDK.

**Always prefer the script over guessing.** Validator slugs are kebab-case but helper method names are camelCase, and a few are non-obvious (`grammatical-correctness` slug → `grammarCorrectness()` helper). The script eliminates that translation step.

## Auth: same pattern across all three clients

Every client takes `apiKey` and `projectId`. Default base URLs point at production (`production-monitoring-eu.disseqt.ai` for validation, `api.disseqt.ai/agentic-monitoring/...` for tracing). Override `baseUrl` / `endpoint` for staging or self-hosted.

```ts
const client = new Client({ apiKey: process.env.DISSEQT_API_KEY!, projectId: process.env.DISSEQT_PROJECT_ID! });
```

Both snake_case and camelCase config keys are accepted (`apiKey` or `api_key`) — this is a deliberate parity with the Python SDK. Use camelCase in new TypeScript code; snake_case is there for users porting from Python.

## Two big things to know before you start

**1. The single-validator endpoint requires `{ input_data, config_input? }` wrapping.** Every standard validator wraps its body that way — the Client does this for you. The only one to watch is `themes-classifier`: it was missing the wrapper until recently (see [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts)), and currently the server returns 500 for it regardless. **Treat themes-classifier as unsupported until the server team fixes it.** That's why `EXPECTED_VALIDATOR_COUNT = 66` in the smoke script even though the SDK exposes 67 slugs.

**2. The agentic tracing client is fire-and-forget.** Spans go into an in-memory buffer that flushes on an interval. If your process exits before flush, traces are lost. Always `await client.flush()` and `await client.shutdown()` before exit, or use `startTrace(...).run(callback)` which closes and sends the trace when the callback resolves.

## Smoke-testing every validator

There's already a script that runs the full validator suite end-to-end:

```bash
DISSEQT_API_KEY=... DISSEQT_PROJECT_ID=... npm run validators:all
```

It lives at [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts) and is the canonical place to add a new case when a new validator slug ships. The case-builder functions there (`inputValidationCases`, `outputValidationCases`, etc.) are good copy-paste templates.

## Maintainer workflows

When the user is *inside* `disseqt-node-sdk/` and wants to:

- **Add a new validator slug to the smoke script**: open [scripts/run-all-validators.ts](../../../scripts/run-all-validators.ts), find the matching `*Cases()` function, append a case using the same shape as its neighbors, bump `EXPECTED_VALIDATOR_COUNT`.
- **Change a request payload shape**: the model class lives in [src/validation/models.ts](../../../src/validation/models.ts), the validator in [src/validation/validators.ts](../../../src/validation/validators.ts) (look at `toPayload()`), and the helper in [src/validation/helpers.ts](../../../src/validation/helpers.ts). Update all three plus the matching tests in [tests/validation/](../../../tests/validation/).
- **Debug a 4xx**: the server enforces the `{ input_data, config_input? }` envelope for `/api/v1/sdk/validators/{domain}/{slug}` and `{ input_data, options }` for `/api/v1/validators/composite/evaluate`. Compare what `toPayload()` returns against what the server's binding expects — that's how the themes-classifier 400 was caught.

## Things this skill deliberately does *not* cover

- The Python SDK (`disseqt-python-sdk`). When the user is doing Python, point them at the upstream docs at `/Users/sumit/Disseqt-AI-documentation/docs/disseqt-sdk/` instead.
- Server-side validator implementation in `disseqt-production-monitoring-service`. The skill stops at the SDK boundary.
- The themes-classifier endpoint while it's broken on the server. The introspection script will still list it for completeness, but flagged as unsupported.
