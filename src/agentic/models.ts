import type { JsonObject } from '../http/types.js';

export interface EnrichedSpanInit {
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  name?: string;
  kind?: string;
  root?: boolean;
  start_time_unix_nano?: number;
  end_time_unix_nano?: number;
  duration_ns?: number;
  status_code?: string;
  status_message?: string;
  org_id?: string;
  project_id?: string;
  user_id?: string;
  service_name?: string;
  service_version?: string;
  environment?: string;
  dt?: Date | string | null;
  attributes_json?: string;
  resource_attributes_json?: string;
  events_json?: string;
  scope_name?: string;
  scope_version?: string;
  ingestion_time?: Date | string | null;
}

export interface EnrichedSpanDict extends JsonObject {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  kind: string;
  root: boolean;
  start_time_unix_nano: number;
  end_time_unix_nano: number;
  duration_ns: number;
  status_code: string;
  status_message: string;
  org_id: string;
  project_id: string;
  user_id: string;
  service_name: string;
  service_version: string;
  environment: string;
  dt: string | null;
  attributes_json: string;
  resource_attributes_json: string;
  events_json: string;
  scope_name: string;
  scope_version: string;
  ingestion_time: string | null;
}

export class EnrichedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly kind: string;
  readonly root: boolean;
  readonly startTimeUnixNano: number;
  readonly endTimeUnixNano: number;
  readonly durationNs: number;
  readonly statusCode: string;
  readonly statusMessage: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly dt: Date | null;
  readonly attributesJson: string;
  readonly resourceAttributesJson: string;
  readonly eventsJson: string;
  readonly scopeName: string;
  readonly scopeVersion: string;
  readonly ingestionTime: Date | null;

  constructor(input: EnrichedSpanInit) {
    this.traceId = input.trace_id;
    this.spanId = input.span_id;
    this.parentSpanId = input.parent_span_id ?? null;
    this.name = input.name ?? '';
    this.kind = input.kind ?? '';
    this.root = input.root ?? false;
    this.startTimeUnixNano = input.start_time_unix_nano ?? 0;
    this.endTimeUnixNano = input.end_time_unix_nano ?? 0;
    this.durationNs = input.duration_ns ?? 0;
    this.statusCode = input.status_code ?? 'OK';
    this.statusMessage = input.status_message ?? '';
    this.orgId = input.org_id ?? '';
    this.projectId = input.project_id ?? '';
    this.userId = input.user_id ?? '';
    this.serviceName = input.service_name ?? '';
    this.serviceVersion = input.service_version ?? '1.0.0';
    this.environment = input.environment ?? 'production';
    this.dt = parseDate(input.dt);
    this.attributesJson = input.attributes_json ?? '{}';
    this.resourceAttributesJson = input.resource_attributes_json ?? '{}';
    this.eventsJson = input.events_json ?? '[]';
    this.scopeName = input.scope_name ?? '';
    this.scopeVersion = input.scope_version ?? '';
    this.ingestionTime = parseDate(input.ingestion_time);
  }

  toDict(): EnrichedSpanDict {
    return {
      trace_id: this.traceId,
      span_id: this.spanId,
      parent_span_id: this.parentSpanId ?? '',
      name: this.name,
      kind: this.kind,
      root: this.root,
      start_time_unix_nano: this.startTimeUnixNano,
      end_time_unix_nano: this.endTimeUnixNano,
      duration_ns: this.durationNs,
      status_code: this.statusCode,
      status_message: this.statusMessage,
      org_id: this.orgId,
      project_id: this.projectId,
      user_id: this.userId,
      service_name: this.serviceName,
      service_version: this.serviceVersion,
      environment: this.environment,
      dt: this.dt?.toISOString() ?? null,
      attributes_json: this.attributesJson,
      resource_attributes_json: this.resourceAttributesJson,
      events_json: this.eventsJson,
      scope_name: this.scopeName,
      scope_version: this.scopeVersion,
      ingestion_time: this.ingestionTime?.toISOString() ?? null,
    };
  }

  to_dict(): EnrichedSpanDict {
    return this.toDict();
  }

  toJson(): string {
    return JSON.stringify(this.toDict());
  }

  to_json(): string {
    return this.toJson();
  }

  static fromDict(data: EnrichedSpanInit): EnrichedSpan {
    return new EnrichedSpan({
      ...data,
      dt: data.dt ?? new Date(),
    });
  }

  static from_dict(data: EnrichedSpanInit): EnrichedSpan {
    return EnrichedSpan.fromDict(data);
  }
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
