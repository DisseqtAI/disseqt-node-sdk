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
import { type GenericValidationRequest, type Validatable, toValidatable } from './validators.js';

const DEFAULT_BASE_URL = 'https://production-monitoring-eu.disseqt.ai';

export interface ClientConfig extends DisseqtHttpTransportConfig {
  baseUrl?: string;
  timeout?: number;
}

export class Client {
  readonly projectId: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly input: InputValidationHelpers;
  readonly output: OutputValidationHelpers;
  readonly rag: RagGroundingHelpers;
  readonly agentic: AgenticBehaviorHelpers;
  readonly mcp: McpSecurityHelpers;
  readonly themes: ThemesClassifierHelpers;
  readonly composite: CompositeHelpers;

  private readonly transport: DisseqtHttpTransport;

  constructor(config: ClientConfig) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
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

  async validate(request: Validatable | GenericValidationRequest): Promise<JsonObject> {
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
