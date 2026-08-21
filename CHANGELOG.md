# Changelog

## Unreleased

### Added

- **SDK version notification** — every API call (validation, policy
  evaluation, and prompt packs, via the shared HTTP transport) now
  identifies the SDK with `X-SDK-Version`, `X-SDK-Lang: node`, and
  `User-Agent: disseqt-node-sdk/<version>` request headers. When the
  server advertises a newer release on the response
  (`X-SDK-Latest-Version`, plus `X-SDK-Notice` below the supported
  floor), the SDK emits one `console.warn` per process per advertised
  version — fail-open (a malformed or missing header can never affect a
  call), with zero extra network requests. Opt out of the warning with
  `DISSEQT_SDK_DISABLE_VERSION_NOTICE=1` (the headers are still sent).
  Mirrors `disseqt-ai-sdk` (Python) 0.8.0; `X-SDK-Lang` tells the
  backend to compare against the Node release line, never the Python
  one.
- **`SDKVersionBlockedError`** — HTTP 426 (DSQ-4260, the version
  enforcement tier: a permanent cutoff or a scheduled brownout
  rehearsal) now rejects with this typed error instead of a generic
  `DisseqtHttpError`. It extends `DisseqtHttpError`, so existing
  handlers keep working; it carries `.latest`, `.notice`, and `.sunset`
  (RFC 8594 cutoff date), and its message is the server's
  self-explanatory refusal text. Named to match the Python SDK.
- **`SDK_VERSION` / `SDK_LANGUAGE` / `USER_AGENT`** exported from the
  package root; a drift-guard test pins `SDK_VERSION` to
  `package.json`.

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
