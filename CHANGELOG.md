# Changelog

## 0.2.0

### Added

- **Intent validators**: `intent-guard` (block list) and `intent-compliance`
  (allow list) on **both** the input and output domains — available via the typed
  helpers (`client.input.intentGuard` / `client.input.intentCompliance` and the
  `client.output.*` equivalents) and the `InputValidation` / `OutputValidation`
  enums. Mirrors `disseqt-ai-sdk` (Python) 0.4.0.
- **`SDKConfigInput.intents`**: optional `string[]` carried inside `config_input`
  for the intent validators. An empty/omitted list defers to the project's
  dashboard-configured intent list (server-side authoritative); a non-empty list
  is unioned with it. The validate response exposes `enforcement`
  ("blocking" | "advisory") for callers to gate on.

## 0.1.2

### Changed

- README no longer carries the themes-classifier "unsupported until the
  platform team enables the route" note. No code change — the validator is
  still exposed; the registry page just doesn't lead with the caveat.

## 0.1.1

### Changed

- **Default validation API endpoint**: `Client` default `baseUrl` updated from
  `https://production-monitoring-eu.disseqt.ai` to
  `https://api.disseqt.ai/realtime-validations`. Callers using the default will
  now target the new endpoint on upgrade. Pass `baseUrl` explicitly to opt out.
  Mirrors the Python SDK's [0.3.0] change.
- **`DisseqtAPIClient` default base URL**: changed from `http://localhost:8000`
  to `https://api.disseqt.ai` so prompt-pack calls hit the production gateway
  out of the box. Pass `baseUrl` explicitly to point at a local dev gateway or
  staging.
- README and TODO updated to reflect the new defaults.

### Removed

- The bundled Claude Code skill under `.claude/skills/disseqt-node-sdk/`
  is no longer shipped with the repo. It now lives on contributors'
  machines via the standard `~/.claude/skills/` lookup and is excluded
  via `.gitignore`. Source unchanged; only the distribution surface
  shrank.

## 0.1.0

- Initial Node.js SDK scaffold.
- Validation SDK with typed request models, routes, payloads, errors, and per-domain typed helpers.
- Prompt Packs REST client with generation, runs, output validations, CSV handling, pagination, and delete flows.
- Agentic tracing SDK with trace/span models, semantic attributes, batching, transport, client, and helper APIs.
- Examples, tests, ESM/CJS builds, and npm pack dry-run verification.
- `npm run smoke:all` / `npm run smoke:all:live` to exercise all validator slugs and agentic span kinds with one-line pass/fail logs.
