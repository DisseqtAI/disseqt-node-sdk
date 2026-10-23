# Changelog

## Unreleased

### Breaking

Relative to 0.3.0; everything else in this release is additive or fixes routes
that never worked.

- **BREAKING (types only):** `projectId` is now `string | undefined` on
  `DisseqtHttpTransport`, `Client`, `DisseqtAPIClient` and `DisseqtAuthConfig`.
  The API key alone identifies the project; code that reads `.projectId` as a
  `string` needs a guard. Runtime behaviour for callers that pass a project id
  is unchanged.
- **BREAKING:** `DisseqtAPIClient.listRunOutputValidations` /
  `list_run_output_validations` now take the **pack id**. The old
  `/runs/{runId}/output-validations` route was never registered (always 404);
  the call now hits `/{packId}/output-validations`. Deprecated in favour of
  `listPackOutputValidations`.

### Deprecated

- The realtime-policy surface — `Client({ policies, realtimePolicyBaseUrl })`,
  `validate(request, { policies })` and the `validation/policy` helpers
  (`anyBlocking`, `isBlocking`, `isAsync`, `parsePolicy`, `DECISION_*`, ...) —
  is kept for 0.3 compatibility but logs a one-time `console.warn`: the
  `POST /api/v1/sdk/policies/{id}/evaluate` route it targets is not served by
  any current backend. Removal is planned for the next major.
- `--target` on `redteam attack` / `vuln-test` / `vulnerability test` (use
  `--app`, `--integration` or `--endpoint`), and the `redteam run` YAML keys
  `packs` / `application_context` / `target_config` (use `prompt_packs` /
  `application` / `target`). Both still work and print a warning.

### Removed

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

- **`PacksClient.publish` sends the required `sharing_scope`.** The handler
  binds `sharing_scope` as
  `required,oneof=PRIVATE PROJECT ORGANIZATION PUBLIC`
  (`api/prompt_packs_handlers.go` `publishPromptPack`), so the bodiless
  `PATCH /:id/publish` the SDK used to send was an unconditional
  `400 {"external":"EOF","code":"InvalidInput"}`. New signature:
  `publish(id, sharingScope = 'PRIVATE')`, validated client-side against
  `PACK_SHARING_SCOPES`. `unpublish` is unchanged — `unpublishPromptPack`
  binds no body. CLI:
  `disseqt pack publish <id> --sharing-scope private|project|organization|public`
  (default `private`, case-insensitive, upper-cased on the wire; an unknown
  value exits 2).
- **Documented that pack-level `severity`, `interaction_mode` and `task_type`
  are ignored on create/update.** `createPromptPack` / `updatePromptPack` blank
  all three and re-derive them by aggregating the pack's prompts, so they never
  round-trip; the JSDoc on `PacksClient.create` / `update` and the
  `disseqt pack create` help now say so. Set them on the prompts instead.
- **`disseqt pack list` lists your own packs.** `GET /api/v1/sdk/prompt-packs`
  is the _marketplace_ listing, so a pack you had just created came back as
  `items: []`. The owner listing `GET /my-packs` (`getUserOwnedPacks`, on the
  same service-key mount) is now reachable as `PacksClient.listMine(params?)`
  and backs `disseqt pack list`; pass `--marketplace` for the public catalog.
- **Backend envelope is unwrapped for the resource clients only.**
  `DisseqtResourceClient` (and `disseqt scan`) return the `data` member of
  the dataset-backend's `{"status":"success","data":...}` envelope and throw
  `DisseqtApiError` (new, with `code` / `requestId`) when a 2xx body carries
  `{"status":"error"}`; this is opt-in per request (`unwrapEnvelope: true`),
  so `Client` and `DisseqtAPIClient` return the raw body exactly as in 0.3.
  Pollers stop mistaking the envelope's `"success"` for a terminal run state.
- **`redteam` request bodies match the Go structs** (`api/testing_types.go`,
  `pkg/testing/pipeline.go`, `api/mr_jailbreak_batch_automation.go`,
  `api/testing_bot_handlers.go`, `api/vulnerability_types.go`):
  - `attack --single-turn` / `run <yaml>` send
    `{name, application_context:{name, type}, target_config, testing_plan}`
    (an empty `application_context` left the session in `draft`) then
    `{run_name, trigger_metadata:{source:"disseqt-cli"}}`; the testing plan
    carries `config.techniques`. Single-turn needs at least one `--pack` and
    `--validator` (exit 2).
  - `attack --multi-turn` sends a `BatchAutomateJailbreakRequest`
    (`target_prompts` from repeatable `--prompt`, 1..10; the target as
    top-level `app_integration_id`, `jailbreak_config.application_id`, or a
    legacy `app_integration_template`; `ecid_prefix: "cli"`,
    `ecid_start_number: 1`), polls `/mr-jailbreak/jobs/{id}` for every
    returned job and prints `{batch, jobs}`.
  - `parse-curl` sends `{curl_command}`; `test-connection` sends the flat
    `{endpoint, provider, model, api_key, session_id?}`; `recommend packs`
    sends `{app_name, app_description}` and `recommend attacks|validators`
    send `{app_description}`.
  - `vuln-test` and `vulnerability test` send `{app_integration_id}`,
    `{application_id}` or `{llm_config}`; `project_id` / `organization_id`
    query params are sent only when known (the gateway injects them).
  - `status` / `results` fall back to mr-jailbreak only on a 404.
- `RedteamClient.listAgents` (`redteam list-attacks --kind agents`,
  `list-personas`) sends the `page_id=1&page-size=100` query the backend
  requires (`ListJailbreakAgentsRequest`, kebab-case `page-size`) instead of
  getting a 400; it accepts optional paging/filter params, and
  `list-personas --attack-type` is forwarded server-side.
- **`disseqt scan` no longer 404s on every batch.** The judge route
  `POST /api/v1/sdk/validators/input-validation/{validator}` serves only
  `llm-judge-*` metrics; the defaults are now `llm-judge-bfla`, `-bola`,
  `-rbac`, `-shell-injection`, `-debug-access`, `-intellectual-property`,
  and user-supplied names (`--validator`, `.disseqt-code-scan.yaml`) are
  normalised (`llm-judge-` prefix added when missing, `_` → `-`). The
  route's disseqt-go compat envelope
  (`{data:{metric_name, actual_value, metric_labels, threshold,
threshold_score, others}}`) is turned into one finding per chunk when
  `actual_value` reaches `threshold_score`, with severity from a severity
  label or the 0–1 score; a `findings[]` list is still honoured.
- **`disseqt scan` no longer turns a failed judge call into findings.** The
  judge route reports failures inside an HTTP 200
  (`{data:{…zeros}, status:{code:"402", message:"insufficient credits…"}}`);
  that used to become one LOW finding per chunk and "N batches ok". Now
  `status.code != "200"` raises the same `DisseqtHttpError` the HTTP path
  uses, counts the batch as failed, and 401/402/403 stop the scan.
  `actual_value <= 0` never yields a finding and `threshold_score <= 0` /
  missing falls back to 0.5. Every judge request now carries `project_id`
  - `organization_id` (both bound `required` by `sdk_judge_handlers.go`);
    `DISSEQT_ORGANIZATION_ID` is required for `disseqt scan` (exit 2 when
    missing).
- `disseqt scan` exits 1 when no validator request succeeded or any batch
  failed (config errors stay exit 2), prints the first failure, and stops
  after the first 401/403 instead of replaying it for every batch.
- `RedteamClient.validate` returns the real `TestingValidateResponse`
  (`results[]` with `validator_name/score/failed/rule_status/explanation/error`,
  `aggregate_decision` `PASS|BORDERLINE|BLOCK`, `processed_at`); the old
  `overall_verdict` / `input` / `output` fields never existed. `RedteamRun`
  models `stop_reason`, and `stopped` is a terminal status for every poller.
- Testing list endpoints are read as `{items, pagination}` (sessions, run
  results); `redteam report` now renders every row instead of nothing.
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
- **Auth contract.** The SDK and CLI send `X-API-Key` and, only when one is
  configured, `X-Project-Id`; the gateway derives project / org / user from
  the key. No service-key header is ever set client-side.
- Credentials resolve as constructor args > `DISSEQT_API_KEY` /
  `DISSEQT_PROJECT_ID` > `~/.disseqt/config.json` (Python parity). An env key
  is never paired with a stored project id. `disseqt login --project-id` is
  optional.
- `redteam attack --multi-turn` defaults `--max-depth` to 5 and testing plans
  default `max_total_prompts` to 0 (unlimited), matching the Python CLI.
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
- `DisseqtResourceClient.whoami()` and `disseqt whoami [--json]`:
  `GET /api/v1/whoami` → `{project_id, organization_id, user_id}`; while that
  route is not deployed (404) it reports the locally configured values with
  `source: "local"`.
- Target flags on every red-team entry point — `redteam attack` (single and
  multi-turn), `redteam vuln-test`, `vulnerability test`, `run create`
  (alias `pp-run`) and `plan-run create`: exactly one of `--app <ai-system>`,
  `--integration <app-integration>` or `--endpoint <url>` (multi-turn: a
  legacy template); zero or several exit 2. `run create` / `plan-run create`
  accept a target flag instead of, or merged into, `--body`.
- `disseqt app list` (policy-mgmt `GET /api/v1/applications`, base URL from
  `DISSEQT_POLICIES_BASE_URL`), `app link <id> --integration <id> [--role]`
  and `app unlink <id>` (`/api/v1/llm/application-links`), plus
  `client.applications` / `client.applicationLinks`.
- `redteam session list` / `results` take `--page`, `--page-size` and `--all`.
- Ctrl-C or a `--max-wait` timeout while a CLI command polls cancels the
  testing / pack / plan run or output validation, prints how to inspect it,
  and exits 1 (multi-turn jobs have no cancel route and only get the hint).
- `DisseqtAgenticClient({ applicationId })` sends `X-Application-Id`
  (UUID-validated; omitted when unset), matching the Python client.
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
