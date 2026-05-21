# Disseqt Node SDK TODO

This file should be updated with every meaningful commit. Keep completed items checked and add dated notes when scope changes.

## Commit Log Checklist

- [x] 2026-05-20 - Scaffold production-oriented TypeScript SDK project structure.
- [x] 2026-05-20 - Add shared HTTP transport, timeout handling, raw/JSON response handling, and SDK errors.
- [x] 2026-05-20 - Add validation domains, validator enums, and request model types from the Python SDK.
- [x] 2026-05-20 - Implement generic validation client matching Python routes, headers, payloads, and error behavior.
- [x] 2026-05-20 - Add typed validation convenience helpers for each domain.
- [x] 2026-05-21 - Add validation unit tests with mocked fetch.
- [x] 2026-05-21 - Implement Prompt Packs REST client.
- [x] 2026-05-21 - Add Prompt Packs unit tests.
- [x] 2026-05-21 - Add agentic trace/span core models and semantic attributes.
- [x] 2026-05-21 - Add agentic client, batching, flush, shutdown, and retry behavior.
- [x] 2026-05-21 - Add agentic helper APIs.
- [x] 2026-05-21 - Add agentic unit tests.
- [x] 2026-05-21 - Add examples for validation, composite score, prompt packs, and agentic tracing.
- [x] 2026-05-21 - Complete README usage docs and package publishing metadata.
- [x] 2026-05-21 - Run release checks: lint, typecheck, test, build, and npm pack dry run.
- [x] 2026-05-21 - Add all-validator and all-span smoke test script with one-line error logs.

## Production Readiness Gates

- [x] Public APIs are typed and documented.
- [x] Network behavior is covered with deterministic unit tests.
- [x] No live API calls run in default tests.
- [x] Package exports work for ESM and CommonJS consumers.
- [x] Errors expose status code, response body preview, and request context where useful.
- [x] Timeouts use AbortController and clean up timers.
- [x] Source maps and declaration files are emitted.
- [ ] README examples compile.
- [x] npm package contents verified with `npm pack --dry-run`.

## Python SDK Behavior To Mirror

- Validation package: `disseqt_sdk`
- Agentic package: `disseqt_agentic_sdk`
- Validation client method: `Client.validate(request)`
- Prompt Packs client: `DisseqtAPIClient`
- Agentic client: `DisseqtAgenticClient`
- Validation headers: `X-API-Key`, `X-Project-Id`, `Content-Type: application/json`
- Validation default base URL: `https://production-monitoring-eu.disseqt.ai`
- Validation endpoint: `/api/v1/sdk/validators/{domain}/{validator}`
- Prompt Packs default base URL: `http://localhost:8000`
- Prompt Packs path prefix: `/sdk/prompt-packs/api/v1/sdk/prompt-packs`
