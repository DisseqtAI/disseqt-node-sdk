import type { FetchLike } from '../http/types.js';
import { TraceBuffer } from './buffer.js';
import type { DisseqtTrace } from './trace.js';
import { AgenticHTTPTransport } from './transport.js';

const DEFAULT_ENDPOINT = 'https://api.disseqt.ai/agentic-monitoring/api/v1/traces';

export interface DisseqtAgenticClientConfig {
  apiKey: string;
  api_key?: string;
  projectId?: string;
  project_id?: string;
  serviceName?: string;
  service_name?: string;
  /** AI System (application) UUID, sent as X-Application-Id when set (Python parity). */
  applicationId?: string;
  application_id?: string;
  endpoint?: string;
  serviceVersion?: string;
  service_version?: string;
  environment?: string;
  maxBatchSize?: number;
  max_batch_size?: number;
  flushIntervalMs?: number;
  flush_interval_ms?: number;
  flushInterval?: number;
  flush_interval?: number;
  maxRetries?: number;
  max_retries?: number;
  fetch?: FetchLike;
}

export class DisseqtAgenticClient {
  static readonly SDK_NAME = 'disseqt-agentic-sdk';
  static readonly SDK_VERSION = '0.1.0';

  readonly apiKey: string;
  readonly projectId: string;
  readonly serviceName: string;
  readonly applicationId: string | undefined;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly endpoint: string;
  readonly transport: AgenticHTTPTransport;
  readonly buffer: TraceBuffer;

  constructor(config: DisseqtAgenticClientConfig) {
    const apiKey = config.apiKey ?? config.api_key;
    const projectId = config.projectId ?? config.project_id;
    const serviceName = config.serviceName ?? config.service_name;
    const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    const environment = config.environment ?? 'production';

    assertNonEmpty('api_key', apiKey);
    assertNonEmpty('project_id', projectId);
    assertNonEmpty('service_name', serviceName);
    assertNonEmpty('endpoint', endpoint);
    assertNonEmpty('environment', environment);

    this.apiKey = apiKey;
    this.projectId = projectId;
    this.serviceName = serviceName;
    this.applicationId = parseApplicationId(config.applicationId ?? config.application_id);
    this.serviceVersion = config.serviceVersion ?? config.service_version ?? '1.0.0';
    this.environment = environment;
    this.endpoint = endpoint;

    const transportConfig = {
      endpoint,
      apiKey,
      maxRetries: config.maxRetries ?? config.max_retries ?? 3,
      ...(this.applicationId !== undefined ? { applicationId: this.applicationId } : {}),
    };
    this.transport = new AgenticHTTPTransport(
      config.fetch === undefined ? transportConfig : { ...transportConfig, fetch: config.fetch },
    );
    this.buffer = new TraceBuffer({
      transport: this.transport,
      maxBatchSize: config.maxBatchSize ?? config.max_batch_size ?? 100,
      flushIntervalMs:
        config.flushIntervalMs ??
        config.flush_interval_ms ??
        secondsToMilliseconds(config.flushInterval ?? config.flush_interval ?? 1),
    });
  }

  sendTrace(trace: DisseqtTrace): void {
    this.buffer.addSpans(trace.toEnrichedSpans());
  }

  send_trace(trace: DisseqtTrace): void {
    this.sendTrace(trace);
  }

  async flush(): Promise<void> {
    await this.buffer.flush();
  }

  async shutdown(): Promise<void> {
    await this.buffer.stop();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseApplicationId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  if (!UUID_RE.test(trimmed))
    throw new ValueError(`application_id must be a UUID (got "${trimmed}")`);
  return trimmed;
}

function secondsToMilliseconds(seconds: number): number {
  return seconds * 1_000;
}

function assertNonEmpty(name: string, value: string | undefined): asserts value is string {
  if (value === undefined || value.trim().length === 0) {
    throw new ValueError(`${name} is required and cannot be empty`);
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
