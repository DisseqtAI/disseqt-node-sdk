import { resolveAuthSync } from '../auth/resolve.js';
import {
  DisseqtHttpError,
  DisseqtHttpTransport,
  type DisseqtHttpTransportConfig,
  stripTrailingSlashes,
} from '../http/index.js';
import {
  ApplicationLinksClient,
  ApplicationsClient,
  POLICIES_DEFAULT_BASE_URL,
} from './applications.js';
import { CustomValidatorsClient } from './customValidators.js';
import { McpTargetsClient, RagTargetsClient, VulnerabilitiesClient } from './misc.js';
import { PacksClient } from './packs.js';
import { PlanRunsClient } from './planRuns.js';
import { PlansClient } from './plans.js';
import { RedteamClient } from './redteam.js';
import { RESOURCES_DEFAULT_BASE_URL, type ResourceClientConfig } from './base.js';
import { RunsClient } from './runs.js';
import { SessionsClient } from './sessions.js';
import { TargetsClient } from './targets.js';
import { ValidationsClient } from './validations.js';

/** Identity the API key resolves to (`whoami()`); `source: 'local'` when the server route is absent. */
export interface DisseqtIdentity {
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  source: 'server' | 'local';
}

/**
 * Constructor config for `DisseqtResourceClient`. Omitted credentials resolve from
 * `DISSEQT_API_KEY` / `DISSEQT_PROJECT_ID`, then `~/.disseqt/config.json`. Only the key is required.
 */
export type DisseqtResourceClientConfig = Omit<ResourceClientConfig, 'apiKey' | 'projectId'> & {
  apiKey?: string;
  projectId?: string;
  /** policy-mgmt base for `applications` (default env `DISSEQT_POLICIES_BASE_URL`, then production). */
  policiesBaseUrl?: string;
};

/** Umbrella over every resource client the CLI uses; all hit raw `/api/v1/...` paths. */
export class DisseqtResourceClient {
  readonly baseUrl: string;
  readonly transport: DisseqtHttpTransport;

  readonly targets: TargetsClient;
  readonly packs: PacksClient;
  readonly runs: RunsClient;
  readonly validations: ValidationsClient;
  readonly sessions: SessionsClient;
  readonly customValidators: CustomValidatorsClient;
  readonly ragTargets: RagTargetsClient;
  readonly mcpTargets: McpTargetsClient;
  readonly vulnerabilities: VulnerabilitiesClient;
  readonly plans: PlansClient;
  readonly planRuns: PlanRunsClient;
  readonly redteam: RedteamClient;
  readonly applications: ApplicationsClient;
  readonly applicationLinks: ApplicationLinksClient;

  constructor(config: DisseqtResourceClientConfig = {}) {
    const overrides: Parameters<typeof resolveAuthSync>[0] = {};
    if (config.apiKey !== undefined) overrides.apiKey = config.apiKey;
    if (config.projectId !== undefined) overrides.projectId = config.projectId;
    if (config.baseUrl !== undefined) overrides.baseUrl = config.baseUrl;
    const resolved = resolveAuthSync(overrides);
    this.baseUrl = stripTrailingSlashes(resolved.baseUrl ?? RESOURCES_DEFAULT_BASE_URL);
    const timeoutMs =
      config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);
    const transportConfig: DisseqtHttpTransportConfig = { apiKey: resolved.apiKey, timeoutMs };
    if (resolved.projectId !== undefined) transportConfig.projectId = resolved.projectId;
    if (config.fetch !== undefined) {
      transportConfig.fetch = config.fetch;
    }
    this.transport = new DisseqtHttpTransport(transportConfig);
    const shared = { transport: this.transport, baseUrl: this.baseUrl };
    this.targets = new TargetsClient(shared);
    this.packs = new PacksClient(shared);
    this.runs = new RunsClient(shared);
    this.validations = new ValidationsClient(shared);
    this.sessions = new SessionsClient(shared);
    this.customValidators = new CustomValidatorsClient(shared);
    this.ragTargets = new RagTargetsClient(shared);
    this.mcpTargets = new McpTargetsClient(shared);
    this.vulnerabilities = new VulnerabilitiesClient(shared);
    this.plans = new PlansClient(shared);
    this.planRuns = new PlanRunsClient(shared);
    this.redteam = new RedteamClient(shared);
    this.applicationLinks = new ApplicationLinksClient(shared);
    const policiesBase =
      config.policiesBaseUrl ??
      process.env['DISSEQT_POLICIES_BASE_URL'] ??
      POLICIES_DEFAULT_BASE_URL;
    this.applications = new ApplicationsClient({
      transport: this.transport,
      baseUrl: policiesBase,
    });
  }

  /**
   * GET /api/v1/whoami — the project/org/user the gateway derives from the API key.
   * Falls back to locally configured values (`source: 'local'`) while the route 404s.
   */
  async whoami(): Promise<DisseqtIdentity> {
    try {
      const data = await this.transport.requestJson({
        method: 'GET',
        url: `${this.baseUrl}/api/v1/whoami`,
        unwrapEnvelope: true,
      });
      return {
        project_id: strOrNull(data['project_id']),
        organization_id: strOrNull(data['organization_id']),
        user_id: strOrNull(data['user_id']),
        source: 'server',
      };
    } catch (error) {
      if (!(error instanceof DisseqtHttpError) || error.statusCode !== 404) throw error;
      return {
        project_id: this.transport.projectId ?? null,
        organization_id: strOrNull(process.env['DISSEQT_ORGANIZATION_ID']),
        user_id: null,
        source: 'local',
      };
    }
  }
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
