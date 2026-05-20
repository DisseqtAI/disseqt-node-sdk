# Disseqt Node SDK TODO

This file should be updated with every meaningful commit. Keep completed items checked and add dated notes when scope changes.

## Commit Log Checklist

- [x] 2026-05-20 - Scaffold production-oriented TypeScript SDK project structure.
- [x] 2026-05-20 - Add shared HTTP transport, timeout handling, raw/JSON response handling, and SDK errors.
- [x] 2026-05-20 - Add validation domains, validator enums, and request model types from the Python SDK.
- [ ] Implement generic validation client matching Python routes, headers, payloads, and error behavior.
- [ ] Add typed validation convenience helpers for each domain.
- [ ] Add validation unit tests with mocked fetch.
- [ ] Implement Prompt Packs REST client.
- [ ] Add Prompt Packs unit tests.
- [ ] Add agentic trace/span core models and semantic attributes.
- [ ] Add agentic client, batching, flush, shutdown, and retry behavior.
- [ ] Add agentic helper APIs.
- [ ] Add agentic unit tests.
- [ ] Add examples for validation, composite score, prompt packs, and agentic tracing.
- [ ] Complete README usage docs and package publishing metadata.
- [ ] Run release checks: lint, typecheck, test, build, and npm pack dry run.

## Production Readiness Gates

- [ ] Public APIs are typed and documented.
- [ ] Network behavior is covered with deterministic unit tests.
- [ ] No live API calls run in default tests.
- [ ] Package exports work for ESM and CommonJS consumers.
- [ ] Errors expose status code, response body preview, and request context where useful.
- [ ] Timeouts use AbortController and clean up timers.
- [ ] Source maps and declaration files are emitted.
- [ ] README examples compile.
- [ ] npm package contents verified with `npm pack --dry-run`.

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
