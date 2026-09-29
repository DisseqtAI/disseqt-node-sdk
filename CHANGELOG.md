# Changelog

## Unreleased

### Removed

- **Server-side realtime-policy evaluation surface.** The
  `Client.validate(request, { policies: [...] })` shape (and the
  `{ raiseOnAsync: true }` option on `Client.validateSync`, which is kept
  as a plain alias of `validate()`), the
  `Guardrails` class + `BaseGuard` extension, `BlockedError`, the
  policy helpers module (`anyBlocking`, `isBlocking`, `isAsync`,
  `parsePolicy`, `PolicyDecision`, `PolicyRule`, `PolicyRuleset`,
  `DECISION_BLOCK/BORDERLINE/PASS`), and the `realtimePolicyBaseUrl` /
  `policies` ctor options have been removed. The runtime evaluate
  endpoint they targeted (`POST /api/v1/sdk/policies/{id}/evaluate`) is
  not currently served by any in-scope backend; keeping the shape
  without a working transport would silently 404 on the first live
  call. Class-based validators (`Client.validate(new InputValidator(...))`
  and the composite/themes paths) are unaffected.
- **`disseqt redteam eval-csv` and `disseqt redteam eval-single-turn`**, with
  `RedteamClient.evaluateCsv` / `evaluateCsvJob` / `singleTurnEvaluate`.
  Their `/api/v1/jailbreak/evaluate-csv*` and `/single-turn-evaluate` routes
  are not part of the deepteam-parity surface; the remaining `redteam`
  verbs cover the same flows through testing sessions and mr-jailbreak.
- `disseqt logout --local-only`. Logout is now local-only by definition
  (see Changed); revoke keys from the dashboard.
- **`RagValidationsClient` (`client.ragValidations`) and the
  `disseqt rag-validation` CLI group.** The rag-validation routes exist only
  on the browser-session mount (`/api/v1/prompt-packs/...`); there is no
  service-key (`/api/v1/sdk/...`) mount, so API-key callers always got
  `ErrAuthHeaderRequired`.
- `PacksClient.restore` / `importStatus` and `RunsClient.retrievalTraces`:
  not registered on the `/api/v1/sdk/prompt-packs` mount.

### Fixed

- **Backend envelope is unwrapped once, in the transport.** Every
  `requestJson` / `requestJsonAny` call now returns the `data` member of
  the dataset-backend's `{"status":"success","data":...}` envelope and
  throws `DisseqtApiError` (new, with `code` / `requestId`) when a 2xx body
  carries `{"status":"error"}`. Pollers stop mistaking the envelope's
  `"success"` for a terminal run state, and `disseqt run --wait` /
  `plan-run --wait` / `redteam attack` exit non-zero when the deadline
  passes instead of printing a still-running payload as if it were final.
- **`redteam` request bodies match the Go structs** (`api/testing_types.go`,
  `pkg/testing/pipeline.go`, `api/mr_jailbreak_batch_automation.go`,
  `api/testing_bot_handlers.go`, `api/vulnerability_types.go`):
  - `attack --single-turn` / `run <yaml>` send
    `{name, application_context, target_config:{application_id}, testing_plan}`
    then `{run_name?, trigger_metadata, application_id?}`.
  - `attack --multi-turn` sends a `BatchAutomateJailbreakRequest`
    (`target_prompts` from repeatable `--prompt`, 1..10;
    `app_integration_template` from `--target <file>`; `jailbreak_config`;
    `ecid_prefix: "cli"`, `ecid_start_number: 1`) and polls
    `/mr-jailbreak/jobs/{id}` for every returned job.
  - `parse-curl` sends `{curl_command}`; `test-connection` sends the flat
    `{endpoint, provider, model, api_key, session_id?}`; `recommend packs`
    sends `{app_name, app_description}` and `recommend attacks|validators`
    send `{app_description}`.
  - `vuln-test` and `vulnerability test` send `{app_integration_id}` (or
    `--llm-config`) with `?project_id&organization_id`.
  - `status` / `results` fall back to mr-jailbreak only on a 404.
- `disseqt scan` exits 1 when no validator request succeeded or any batch
  failed (config errors stay exit 2), prints the first failure, and stops
  after the first 401/403 instead of replaying it for every batch.
- `~/.disseqt/config.json` is `chmod 0600` after every write, not only on
  create; the masked key prefix shown by `login` is capped at 8 chars.

- **`CreateRunRequest`'s `runName` now actually reaches the server.** Since
  this SDK's first release, `toPayload()` sent the run name under the key
  `"run_name"`, but the backend has only ever bound
  `"prompt_pack_run_name"`. Every `runName` a caller supplied was silently
  ignored — no error, no warning — and the backend fell back to its own
  auto-generated name. If your runs have shown auto-generated names
  regardless of what you passed as `runName`, this was why. **No code
  change is required on your part** — the constructor argument is still
  `runName`/`run_name`; only the wire key changed. Runs you create after
  upgrading will use the name you actually give them. If anything of
  yours (a dashboard, a script, a test) keys off the auto-generated name
  pattern, expect that to change.
- `CreateRunRequest`'s `runType` is no longer sent to the server. The
  backend has never had a matching field — verified against its full git
  history back to this endpoint's first commit — and always computes its
  own run type server-side. This argument (now marked `@deprecated` in its
  JSDoc) has done nothing since it was introduced; it remains a required
  constructor argument so no existing caller breaks, but is now omitted
  from the payload rather than sent as dead weight. No observable
  behavior change from the caller's side of a successful call.

### Changed

- **Prompt-pack resources moved to the service-key mount.** `PacksClient`,
  `RunsClient` and `ValidationsClient` (and the `disseqt pack` / `run` /
  `validation` verbs) now call `/api/v1/sdk/prompt-packs/...` instead of
  `/api/v1/prompt-packs/...`. The latter is the browser-session mount
  (`externalAuthMiddleware`) and rejects `X-API-Key` callers with
  `ErrAuthHeaderRequired`; the sdk mount (`sdkPromptPackRoutes` in
  `api/server.go`) carries the same packs / prompts / runs /
  output-validations surface. Targets, rag/mcp targets, custom validators,
  vulnerabilities, plans and plan-runs keep their current paths.
- **Auth contract.** The SDK and CLI send only `X-API-Key` + `X-Project-Id`;
  the gateway injects the service key and identity. No service-key header
  is ever set client-side.
- `disseqt login` smoke-tests credentials with
  `GET {DISSEQT_BASE_URL}/api/v1/testing/attack-techniques` (401/403 =
  bad key or project) and honours `DISSEQT_BASE_URL` when `--base-url` is
  absent. `disseqt logout` only clears the local config file.
- `DisseqtResourceClient` (and every `disseqt` resource / `redteam` verb)
  defaults to `https://api.disseqt.ai/dataset`. `disseqt scan` reads
  `DISSEQT_VALIDATORS_BASE_URL` (default
  `https://api.disseqt.ai/realtime-validations`).
- `redteam report --format csv` takes `--session <id>`; json/markdown still
  take the run id positionally.
- `redteam test-connection` takes `--endpoint/--provider/--model/--api-key/
--api-key-env`; `recommend` takes `--app-name/--app-description`
  (`--context` and `DISSEQT_REDTEAM_TARGET` are gone).
- `prepack` runs `clean && lint && typecheck && build && test`.

### Added

- `disseqt` CLI: `login` / `logout`, `redteam` (list-attacks,
  list-techniques, list-personas, attack, session, vuln-test, run,
  validate, status, cancel, results, report, analytics, recommend,
  parse-curl, test-connection), `scan` (SARIF / JSON / Markdown code
  scanner with `--diff`), and resource verbs (`run`, `plan-run`,
  `vulnerability`, targets, packs, ...). See the README's CLI section.
- `DisseqtApiError` for 2xx `{status:"error"}` envelopes.
- `CreateRunRequest` (prompt packs) gained an optional `applicationId` /
  `application_id` field. When set and none of `llm_id`/
  `app_integration_id`/`custom_llm_id` is otherwise supplied, the backend
  auto-resolves it to that Application's ("AI System") one linked
  integration. Omitted from the request payload entirely when unset —
  existing callers see no change on the wire.

## 0.3.0

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
