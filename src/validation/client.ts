import { resolveAuthSync } from '../auth/resolve.js';
import { DisseqtHttpTransport, type DisseqtHttpTransportConfig } from '../http/index.js';
import type { JsonObject } from '../http/types.js';
import {
  AgenticBehaviorHelpers,
  CompositeHelpers,
  InputValidationHelpers,
  McpSecurityHelpers,
  OutputValidationHelpers,
  RagGroundingHelpers,
  ThemesClassifierHelpers,
} from './helpers.js';
import { buildValidatorUrl } from './routes.js';
import {
  isValidatable,
  toValidatable,
  type GenericValidationRequest,
  type Validatable,
} from './validators.js';

const DEFAULT_BASE_URL = 'https://api.disseqt.ai/realtime-validations';

export interface ClientConfig extends Omit<DisseqtHttpTransportConfig, 'apiKey' | 'projectId'> {
  /** Optional — falls back to `~/.disseqt/config.json` then `DISSEQT_API_KEY`. */
  apiKey?: string;
  /** Optional — falls back to `~/.disseqt/config.json` then `DISSEQT_PROJECT_ID`. */
  projectId?: string;
  baseUrl?: string;
  timeout?: number;
  /**
   * Logical name of the calling application (e.g. "checkout-bot").
   * Recorded on outbound requests for observability. Mirrors
   * `serviceName` on `DisseqtAgenticClient`.
   */
  applicationName?: string;
  application_name?: string;
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
 * The prior `{ policies: [...] }` shape (server-side realtime-policy
 * evaluation) is not exposed in this release — the runtime evaluate
 * endpoint it targeted is not currently served by any in-scope backend.
 * Class-based validators are unaffected.
 */
export class Client {
  readonly projectId: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly applicationName: string | null;
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
    const overrides: Parameters<typeof resolveAuthSync>[0] = {};
    if (config.apiKey !== undefined) overrides.apiKey = config.apiKey;
    if (config.projectId !== undefined) overrides.projectId = config.projectId;
    const resolved = resolveAuthSync(overrides);
    this.projectId = resolved.projectId;
    this.apiKey = resolved.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    this.applicationName = applicationName;
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
   * Run a single validator (or composite/themes) and return its response.
   *
   * The historical `{ policies: [...] }` shape targeted an aspirational
   * server-side policy-evaluate endpoint that no in-scope backend
   * registers, so it was removed. This method now only runs the
   * validator classes exposed under `validation/validators`.
   */
  async validate(
    request: Validatable | GenericValidationRequest,
  ): Promise<JsonObject> {
    if (!isValidatable(request) && !isGenericValidationRequest(request)) {
      throw new ValueError(
        'request must be a validator instance or a validation request ' +
          `model, got ${describeType(request)}`,
      );
    }
    return this.runValidator(request);
  }

  /**
   * Alias for `validate()` retained for API stability.
   *
   * Historical block-on-verdict semantics were tied to the removed
   * server-side policy-evaluate path and no longer apply. Now a
   * one-line delegator so existing callers keep working.
   */
  async validateSync(
    request: Validatable | GenericValidationRequest,
  ): Promise<JsonObject> {
    return this.validate(request);
  }

  /** Run a single validator request. */
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
}

export { Client as DisseqtClient };

function isGenericValidationRequest(value: unknown): value is GenericValidationRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'domain' in value &&
    'slug' in value &&
    'data' in value
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
