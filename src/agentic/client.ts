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
  applicationId?: string;
  application_id?: string;
  serviceName?: string;
  service_name?: string;
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
  readonly applicationId: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly endpoint: string;
  readonly transport: AgenticHTTPTransport;
  readonly buffer: TraceBuffer;

  constructor(config: DisseqtAgenticClientConfig) {
    const apiKey = config.apiKey ?? config.api_key;
    const projectId = config.projectId ?? config.project_id;
    const applicationId = config.applicationId ?? config.application_id;
    const serviceName = config.serviceName ?? config.service_name;
    const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    const environment = config.environment ?? 'production';

    assertNonEmpty('api_key', apiKey);
    assertNonEmpty('project_id', projectId);
    assertNonEmpty('service_name', serviceName);
    assertNonEmpty('endpoint', endpoint);
    assertNonEmpty('environment', environment);
    // Required, matching the Python SDK: without X-Application-Id a trace
    // cannot be tied to an application, and Kong's traces-auth plugin
    // rejects it once require_application_verify is on.
    assertNonEmpty(
      'application_id',
      applicationId,
      'See https://docs.disseqt.ai/docs/disseqt-sdk/agentic-observability/applications-registry ' +
        'for how to obtain one.',
    );

    this.apiKey = apiKey;
    this.projectId = projectId;
    this.applicationId = applicationId;
    this.serviceName = serviceName;
    this.serviceVersion = config.serviceVersion ?? config.service_version ?? '1.0.0';
    this.environment = environment;
    this.endpoint = endpoint;

    const transportConfig = {
      endpoint,
      apiKey,
      applicationId: this.applicationId,
      maxRetries: config.maxRetries ?? config.max_retries ?? 3,
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

function secondsToMilliseconds(seconds: number): number {
  return seconds * 1_000;
}

function assertNonEmpty(
  name: string,
  value: string | undefined,
  hint?: string,
): asserts value is string {
  if (value === undefined || value.trim().length === 0) {
    const message = `${name} is required and cannot be empty`;
    throw new ValueError(hint ? `${message}. ${hint}` : message);
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
