import { resolveAuthSync } from '../auth/resolve.js';
import {
  DisseqtHttpTransport,
  type DisseqtHttpTransportConfig,
  stripTrailingSlashes,
} from '../http/index.js';
import { CustomValidatorsClient } from './customValidators.js';
import { McpTargetsClient, RagTargetsClient, VulnerabilitiesClient } from './misc.js';
import { PacksClient } from './packs.js';
import { PlanRunsClient } from './planRuns.js';
import { PlansClient } from './plans.js';
import { RagValidationsClient } from './ragValidations.js';
import { RedteamClient } from './redteam.js';
import { RESOURCES_DEFAULT_BASE_URL, type ResourceClientConfig } from './base.js';
import { RunsClient } from './runs.js';
import { SessionsClient } from './sessions.js';
import { TargetsClient } from './targets.js';
import { ValidationsClient } from './validations.js';

/**
 * Constructor config for `DisseqtResourceClient`. `apiKey` / `projectId`
 * are optional — when omitted, they resolve from `~/.disseqt/config.json`
 * (written by `disseqt login`) and then from `DISSEQT_API_KEY` /
 * `DISSEQT_PROJECT_ID`. `AuthMissingError` fires only when every source
 * comes up empty.
 */
export type DisseqtResourceClientConfig = Omit<ResourceClientConfig, 'apiKey' | 'projectId'> & {
  apiKey?: string;
  projectId?: string;
};

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
  readonly plans: PlansClient;
  readonly planRuns: PlanRunsClient;
  readonly redteam: RedteamClient;

  constructor(config: DisseqtResourceClientConfig = {}) {
    const overrides: Parameters<typeof resolveAuthSync>[0] = {};
    if (config.apiKey !== undefined) overrides.apiKey = config.apiKey;
    if (config.projectId !== undefined) overrides.projectId = config.projectId;
    if (config.baseUrl !== undefined) overrides.baseUrl = config.baseUrl;
    const resolved = resolveAuthSync(overrides);
    this.baseUrl = stripTrailingSlashes(resolved.baseUrl ?? RESOURCES_DEFAULT_BASE_URL);
    const timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    const transportConfig: DisseqtHttpTransportConfig = {
      apiKey: resolved.apiKey,
      projectId: resolved.projectId,
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
    this.plans = new PlansClient(shared);
    this.planRuns = new PlanRunsClient(shared);
    this.redteam = new RedteamClient(shared);
  }
}
