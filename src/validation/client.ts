import { DisseqtHttpTransport, type DisseqtHttpTransportConfig } from '../http/index.js';
import type { JsonObject } from '../http/types.js';
import { ValidatorDomain } from './enums.js';
import {
  AgenticBehaviorHelpers,
  CompositeHelpers,
  InputValidationHelpers,
  McpSecurityHelpers,
  OutputValidationHelpers,
  RagGroundingHelpers,
  ThemesClassifierHelpers,
} from './helpers.js';
import { CompositeScoreRequest, ThemesClassifierRequest } from './models.js';
import { buildValidatorUrl } from './routes.js';
import {
  isValidatable,
  toValidatable,
  type GenericValidationRequest,
  type Validatable,
} from './validators.js';

const DEFAULT_BASE_URL = 'https://api.disseqt.ai/realtime-validations';

/**
 * Anything that can serialize itself to the wire-shape `input_data` object
 * — every `validation/models` request class implements this, so a bare
 * model (e.g. `InputValidationRequest`) can be passed straight to
 * `Client.validate` together with `{ policies: [...] }`.
 */
export interface SupportsInputData {
  toInputData(): JsonObject;
}

export interface ClientConfig extends DisseqtHttpTransportConfig {
  baseUrl?: string;
  timeout?: number;
  /**
   * Logical name of the calling application (e.g. "checkout-bot").
   * REQUIRED to evaluate policies (a client-level `policies` default or a
   * per-call `validate(..., { policies: [...] })`) — the
   * `policy.validation.result.v1` ledger uses this to show which
   * application produced each decision. Mirrors `serviceName` on
   * `DisseqtAgenticClient`.
   */
  applicationName?: string;
  application_name?: string;
  /**
   * Base URL of the realtime-policy evaluate endpoint. Defaults to the
   * `/realtime-validations` gateway — the evaluate endpoint is served by
   * production-monitoring, the same service that hosts the validators
   * (the `/realtime-policies` gateway is the policy CRUD dashboard and
   * has no SDK routes). Kept separate from `baseUrl` so the two endpoints
   * can be mocked / routed independently — override for local testing
   * (e.g. `http://localhost:9010`) without disturbing `baseUrl` callers.
   */
  realtimePolicyBaseUrl?: string;
  realtime_policy_base_url?: string;
  /**
   * Optional default list of published policy ids. When set, EVERY
   * `validate()` call evaluates these policies unless the call passes its
   * own `{ policies: [...] }` (per-call always wins; there is no per-call
   * opt-out — use a second Client for ungoverned paths). Composite-score
   * and themes-classifier requests are incompatible with policies and run
   * classically, without the default. An empty list means "no default",
   * so env-driven config degrades naturally. The list is copied
   * defensively; later mutation of the caller's array does not affect the
   * client.
   */
  policies?: readonly string[];
}

export interface ValidateOptions {
  /**
   * Published policy ids to evaluate the input against; overrides the
   * client-level default. Composite-score and themes-classifier requests
   * cannot be combined with policies.
   */
  policies?: readonly string[];
}

/**
 * The stable envelope returned by `validate()` whenever policies apply:
 * the per-validator result (null when no validator ran) plus one policy
 * envelope per id, in order. Gate on it with `anyBlocking()`.
 */
export interface PolicyValidationResult extends JsonObject {
  validation: JsonObject | null;
  policies: JsonObject[];
}

/**
 * Disseqt SDK client for validator API calls.
 *
 * There are three ways to evaluate something with this client. Pick by
 * what you want the server to do:
 *
 * 1. **Run one specific validator** — use `validate()` with a validator
 *    instance (or a helper such as `client.input.toxicity(...)`). Hits
 *    `/api/v1/sdk/validators/{type}/{name}`. No policy involved. Choose
 *    this when you know the exact validator + threshold you want.
 *
 * 2. **Run a fixed bundle of validators** — use `CompositeScoreEvaluator`
 *    passed to `validate()`. Hits `/api/v1/validators/composite-score`.
 *    No policy involved.
 *
 * 3. **Run one or more published realtime policies** — pass
 *    `{ policies: [...] }` to `validate()`, with or without a validator:
 *
 *        const result = await client.validate(
 *          new InputValidationRequest({ prompt: 'user prompt here' }),
 *          { policies: ['b1f8…'] },
 *        );
 *        if (anyBlocking(result)) {
 *          ...  // at least one policy said BLOCK
 *        }
 *
 *    For each policy id, the server fetches the policy from
 *    disseqt-realtime-policies-service, runs every validator the policy
 *    specifies (with the policy's thresholds and decision strategy),
 *    aggregates a BLOCK/PASS verdict, and publishes the result to
 *    `policy.validation.result.v1` so it shows up on the Decisions
 *    dashboard. The policy endpoints live on their own base URL
 *    (`realtimePolicyBaseUrl`) so they can be mocked or pointed at a
 *    local server during tests without disturbing the validator base
 *    URL. Requires `applicationName` on the client.
 */
export class Client {
  readonly projectId: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly applicationName: string | null;
  readonly realtimePolicyBaseUrl: string;
  readonly policies: readonly string[] | null;
  readonly input: InputValidationHelpers;
  readonly output: OutputValidationHelpers;
  readonly rag: RagGroundingHelpers;
  readonly agentic: AgenticBehaviorHelpers;
  readonly mcp: McpSecurityHelpers;
  readonly themes: ThemesClassifierHelpers;
  readonly composite: CompositeHelpers;

  private readonly transport: DisseqtHttpTransport;

  constructor(config: ClientConfig) {
    const applicationName = config.applicationName ?? config.application_name ?? null;
    let defaultPolicies: readonly string[] | null = null;
    if (config.policies !== undefined) {
      // Normalize before the emptiness check — a Set or other iterable
      // must become an enforced default (as in Python), never a silently
      // ungated client.
      let copied: string[];
      try {
        copied = [...config.policies];
      } catch {
        throw new ValueError(
          'Client({ policies: [...] }) must be a list of policy-id strings ' +
            `(got ${JSON.stringify(config.policies)})`,
        );
      }
      if (copied.length > 0) {
        if (!copied.every(isNonBlankString)) {
          throw new ValueError(
            'Client({ policies: [...] }) must be a list of policy-id strings ' +
              `(got ${JSON.stringify(copied)})`,
          );
        }
        if (applicationName === null || applicationName.trim().length === 0) {
          throw new ValueError(
            'applicationName is required when Client({ policies: [...] }) is ' +
              'set — the Decisions ledger attributes each decision to the ' +
              'calling application',
          );
        }
        defaultPolicies = copied;
      }
    }
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    this.applicationName = applicationName;
    this.realtimePolicyBaseUrl =
      config.realtimePolicyBaseUrl ?? config.realtime_policy_base_url ?? DEFAULT_BASE_URL;
    this.policies = defaultPolicies;
    const transportConfig: DisseqtHttpTransportConfig = {
      apiKey: this.apiKey,
      projectId: this.projectId,
      timeoutMs: this.timeoutMs,
    };
    if (config.fetch !== undefined) {
      transportConfig.fetch = config.fetch;
    }
    this.transport = new DisseqtHttpTransport(transportConfig);
    this.input = new InputValidationHelpers(this);
    this.output = new OutputValidationHelpers(this);
    this.rag = new RagGroundingHelpers(this);
    this.agentic = new AgenticBehaviorHelpers(this);
    this.mcp = new McpSecurityHelpers(this);
    this.themes = new ThemesClassifierHelpers(this);
    this.composite = new CompositeHelpers(this);
  }

  _buildHeaders(): Record<string, string> {
    return this.transport.buildHeaders();
  }

  /**
   * Run a validator, one or more realtime policies, or both.
   *
   * Three call shapes, chosen by what you pass:
   *
   * 1. **Validator only** (unchanged classic behavior) — a validator
   *    instance or generic request object; runs that one validator and
   *    returns its validation response.
   *
   * 2. **Validator + policies** — the validator runs as usual AND the
   *    same input is evaluated against each policy id, server-side, with
   *    each policy's own rulesets, thresholds, and decision strategy:
   *
   *        const result = await client.validate(
   *          new InputValidator({ slug, data, config }),
   *          { policies: ['994ad00e-…', '1268faa4-…'] },
   *        );
   *
   * 3. **Policies only** — pass a bare request object (any
   *    `validation/models` request, no validator, no config); the
   *    policies decide everything:
   *
   *        const result = await client.validate(
   *          new InputValidationRequest({ prompt, response }),
   *          { policies: ['994ad00e-…'] },
   *        );
   *
   * When policies apply the return value is a stable envelope —
   * `{ validation: {...} | null, policies: [{...}, ...] }` — gate on it
   * with `anyBlocking()`. Each policy is one server-side evaluation
   * (billed per executed validator, one Decisions-ledger entry each);
   * policies are evaluated sequentially in the order given. Inputs a
   * policy's validator doesn't receive skip neutrally with
   * `missing_input:<fields>` — supply the union of fields the policies
   * need (see the policy detail endpoint's `required_input_fields`).
   *
   * **Client-level default.** A client constructed with
   * `Client({ policies: [...] })` applies that list to every `validate()`
   * call that doesn't pass its own `{ policies }` — the per-call value
   * always overrides the client default. Composite-score and
   * themes-classifier requests are incompatible with policies; they run
   * classically and the client default steps aside. Passing
   * `{ policies: [] }` explicitly is always an error — an accidentally
   * empty list must fail loudly rather than silently ungate the call.
   *
   * Without policies anywhere, behavior is exactly as before.
   *
   * Throws `DisseqtHttpError` if any API request fails (unknown or
   * unpublished policies answer 404 DSQ-4040) and `ValueError` on invalid
   * combinations (bare request without policies anywhere, empty
   * `policies` list, missing `applicationName`, explicit policies with
   * composite/themes).
   */
  async validate(
    request: Validatable | GenericValidationRequest | SupportsInputData,
    options: ValidateOptions & { policies: readonly string[] },
  ): Promise<PolicyValidationResult>;
  async validate(
    request: Validatable | GenericValidationRequest | SupportsInputData,
    options?: ValidateOptions,
  ): Promise<JsonObject>;
  async validate(
    request: Validatable | GenericValidationRequest | SupportsInputData,
    options?: ValidateOptions,
  ): Promise<JsonObject> {
    if (options?.policies !== undefined) {
      return this.validateWithPolicies(request, options.policies);
    }
    if (this.policies !== null && !isPolicyIncompatible(request)) {
      // Composite/themes can't be policy-evaluated. An explicit per-call
      // combination throws (caller error), but a client-wide default must
      // not make those endpoints unusable — it steps aside for them.
      return this.validateWithPolicies(request, this.policies);
    }
    if (!isValidatable(request) && !isGenericValidationRequest(request)) {
      throw new ValueError(
        'A bare request object needs { policies: [...] } — pass a validator ' +
          'instance to run a single validator, or add { policies: [...] } to ' +
          'evaluate this input against realtime policies',
      );
    }
    return this.runValidator(request);
  }

  /**
   * Orchestrate shape 2/3 of `validate()` (`{ policies: [...] }`).
   *
   * Every client-side rule is checked — and throws `ValueError` — BEFORE
   * any network call is made.
   */
  private async validateWithPolicies(
    request: Validatable | GenericValidationRequest | SupportsInputData,
    policies: readonly string[],
  ): Promise<PolicyValidationResult> {
    // Normalize first: a one-shot iterable (generator) would otherwise be
    // exhausted by validation and silently evaluate zero policies.
    let policyIds: string[];
    try {
      policyIds = [...policies];
    } catch {
      throw new ValueError(
        `policies must be a list of policy-id strings (got ${JSON.stringify(policies)})`,
      );
    }
    if (policyIds.length === 0 || !policyIds.every(isNonBlankString)) {
      throw new ValueError(
        'policies must be a non-empty list of policy-id strings ' +
          `(got ${JSON.stringify(policyIds)})`,
      );
    }
    if (isPolicyIncompatible(request)) {
      throw new ValueError(
        '{ policies: [...] } is not supported with composite-score or ' +
          'themes-classifier requests — those endpoints have their own ' +
          'aggregation and are never policy-evaluated',
      );
    }
    const applicationName = this.applicationName;
    if (applicationName === null || applicationName.trim().length === 0) {
      throw new ValueError(
        'applicationName is required to evaluate policies — set ' +
          'new Client({ applicationName: ... }) so the Decisions ledger can ' +
          'attribute each decision to your application',
      );
    }

    // Both shapes carry the input on an object that knows its wire form.
    // A validator's payload already contains the renamed input_data; bare
    // models serialize themselves.
    let validator: Validatable | null = null;
    let inputData: JsonObject;
    if (isValidatable(request) || isGenericValidationRequest(request)) {
      validator = toValidatable(request);
      const payload = validator.toPayload() as { input_data?: JsonObject };
      inputData = { ...(payload.input_data ?? {}) };
    } else if (hasToInputData(request)) {
      inputData = request.toInputData();
    } else {
      throw new ValueError(
        'request must be a validator instance or a validation request ' +
          `model, got ${describeType(request)}`,
      );
    }
    if (Object.keys(inputData).length === 0) {
      throw new ValueError(
        'the request carries no input fields — set prompt/context/response ' +
          '(or agentic fields) so the policies have something to evaluate',
      );
    }

    // All guards passed — now (and only now) touch the network.
    const validation = validator === null ? null : await this.runValidator(validator);
    const envelopes: JsonObject[] = [];
    for (const policyId of policyIds) {
      envelopes.push(await this.postPolicyEvaluate(policyId, inputData, applicationName));
    }
    return { validation, policies: envelopes };
  }

  /** Run a single validator request (the classic validate() body). */
  private async runValidator(request: Validatable | GenericValidationRequest): Promise<JsonObject> {
    const validator = toValidatable(request);
    const url = buildValidatorUrl(
      this.baseUrl,
      validator.domain,
      validator.slug,
      validator.pathTemplate,
    );

    return this.transport.requestJson({
      method: 'POST',
      url,
      json: validator.toPayload(),
    });
  }

  /**
   * POST one policy-evaluation request and decode the envelope.
   *
   * Transport for `validate()` (`{ policies: [...] }`). Throws
   * `DisseqtHttpError` on any non-2xx (unknown/unpublished policies
   * answer 404 DSQ-4040) and `DisseqtJsonError` on an undecodable body.
   */
  private async postPolicyEvaluate(
    policyId: string,
    inputData: JsonObject,
    applicationName: string,
  ): Promise<JsonObject> {
    const base = this.realtimePolicyBaseUrl.replace(/\/+$/, '');
    const url = `${base}/api/v1/sdk/policies/${encodeURIComponent(policyId)}/evaluate`;
    return this.transport.requestJson({
      method: 'POST',
      url,
      json: {
        input_data: inputData,
        application_name: applicationName,
      },
      errorMessage: 'Policy evaluation failed',
    });
  }
}

export { Client as DisseqtClient };

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isGenericValidationRequest(value: unknown): value is GenericValidationRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'domain' in value &&
    'slug' in value &&
    'data' in value
  );
}

/**
 * Composite-score and themes-classifier requests are never
 * policy-evaluated — their endpoints have their own aggregation. True for
 * both the validator wrappers (matched by domain) and the bare request
 * models.
 */
function isPolicyIncompatible(request: unknown): boolean {
  if (request instanceof ThemesClassifierRequest || request instanceof CompositeScoreRequest) {
    return true;
  }
  if (typeof request === 'object' && request !== null && 'domain' in request) {
    const domain = (request as { domain: unknown }).domain;
    return domain === ValidatorDomain.ThemesClassifier || domain === ValidatorDomain.Composite;
  }
  return false;
}

function hasToInputData(value: unknown): value is SupportsInputData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toInputData' in value &&
    typeof (value as { toInputData: unknown }).toInputData === 'function'
  );
}

function describeType(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return value.constructor?.name ?? 'Object';
  }
  return typeof value;
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
