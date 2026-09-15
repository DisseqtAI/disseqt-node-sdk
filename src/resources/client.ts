import { DisseqtHttpTransport, type DisseqtHttpTransportConfig } from '../http/index.js';
import { CustomValidatorsClient } from './customValidators.js';
import {
  McpTargetsClient,
  MultiTurnClient,
  RagTargetsClient,
  VulnerabilitiesClient,
} from './misc.js';
import { PacksClient } from './packs.js';
import { RagValidationsClient } from './ragValidations.js';
import { RESOURCES_DEFAULT_BASE_URL, type ResourceClientConfig } from './base.js';
import { RunsClient } from './runs.js';
import { SessionsClient } from './sessions.js';
import { TargetsClient } from './targets.js';
import { ValidationsClient } from './validations.js';

export type DisseqtResourceClientConfig = ResourceClientConfig;

/**
 * Umbrella client exposing every direct-to-backend resource client the CLI
 * and SDK consumers use. Kept separate from `validation/Client` (which owns
 * validator helpers) and `prompt-packs/DisseqtAPIClient` (which uses the
 * `/sdk/prompt-packs/...` SDK prefix). All resource methods here hit raw
 * `/api/v1/...` paths.
 */
export class DisseqtResourceClient {
  readonly baseUrl: string;
  readonly transport: DisseqtHttpTransport;

  readonly targets: TargetsClient;
  readonly packs: PacksClient;
  readonly runs: RunsClient;
  readonly validations: ValidationsClient;
  readonly ragValidations: RagValidationsClient;
  readonly sessions: SessionsClient;
  readonly customValidators: CustomValidatorsClient;
  readonly ragTargets: RagTargetsClient;
  readonly mcpTargets: McpTargetsClient;
  readonly vulnerabilities: VulnerabilitiesClient;
  readonly mr: MultiTurnClient;

  constructor(config: DisseqtResourceClientConfig) {
    this.baseUrl = (config.baseUrl ?? RESOURCES_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    const transportConfig: DisseqtHttpTransportConfig = {
      apiKey: config.apiKey,
      projectId: config.projectId,
      timeoutMs,
    };
    if (config.fetch !== undefined) {
      transportConfig.fetch = config.fetch;
    }
    this.transport = new DisseqtHttpTransport(transportConfig);
    const shared = { transport: this.transport, baseUrl: this.baseUrl };
    this.targets = new TargetsClient(shared);
    this.packs = new PacksClient(shared);
    this.runs = new RunsClient(shared);
    this.validations = new ValidationsClient(shared);
    this.ragValidations = new RagValidationsClient(shared);
    this.sessions = new SessionsClient(shared);
    this.customValidators = new CustomValidatorsClient(shared);
    this.ragTargets = new RagTargetsClient(shared);
    this.mcpTargets = new McpTargetsClient(shared);
    this.vulnerabilities = new VulnerabilitiesClient(shared);
    this.mr = new MultiTurnClient(shared);
  }
}
