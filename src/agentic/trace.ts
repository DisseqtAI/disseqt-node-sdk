import type { JsonObject } from '../http/types.js';
import { getCurrentTrace, setCurrentTrace } from './context.js';
import { SpanKind, type SpanKindInput } from './enums.js';
import type { EnrichedSpan } from './models.js';
import { DisseqtSpan } from './span.js';
import { generateTraceId, nowNs } from './utils.js';

export interface DisseqtTraceInit {
  name: string;
  traceId?: string;
  trace_id?: string;
  orgId?: string;
  org_id?: string;
  projectId?: string;
  project_id?: string;
  userId?: string;
  user_id?: string;
  serviceName?: string;
  service_name?: string;
  serviceVersion?: string;
  service_version?: string;
  environment?: string;
  intentId?: string | null;
  intent_id?: string | null;
  workflowId?: string | null;
  workflow_id?: string | null;
}

export class DisseqtTrace {
  readonly traceId: string;
  readonly startTimeNs: number;
  readonly name: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly spans: DisseqtSpan[] = [];

  endTimeNs: number | null = null;
  intentId: string | null;
  workflowId: string | null;
  isEnded = false;

  constructor(input: DisseqtTraceInit) {
    this.traceId = input.traceId ?? input.trace_id ?? generateTraceId();
    this.startTimeNs = nowNs();
    this.name = input.name;
    this.orgId = input.orgId ?? input.org_id ?? '';
    this.projectId = input.projectId ?? input.project_id ?? '';
    this.userId = input.userId ?? input.user_id ?? '';
    this.serviceName = input.serviceName ?? input.service_name ?? '';
    this.serviceVersion = input.serviceVersion ?? input.service_version ?? '1.0.0';
    this.environment = input.environment ?? 'production';
    this.intentId = input.intentId ?? input.intent_id ?? null;
    this.workflowId = input.workflowId ?? input.workflow_id ?? null;

    setCurrentTrace(this);
  }

  startSpan(
    name: string,
    kind: SpanKindInput,
    options: { spanId?: string; span_id?: string; parentSpanId?: string | null; parent_span_id?: string | null } = {},
  ): DisseqtSpan {
    if (this.isEnded) {
      throw new RuntimeError('Cannot start a new span on an ended trace.');
    }

    const spanInput = {
      traceId: this.traceId,
      name,
      kind: normalizeKind(kind),
      projectId: this.projectId,
      userId: this.userId,
      serviceName: this.serviceName,
      serviceVersion: this.serviceVersion,
      environment: this.environment,
    };
    const spanId = options.spanId ?? options.span_id;
    const parentSpanId = options.parentSpanId ?? options.parent_span_id;
    const span = new DisseqtSpan({
      ...spanInput,
      ...(spanId !== undefined ? { spanId } : {}),
      ...(parentSpanId !== undefined ? { parentSpanId } : {}),
    });

    if (this.intentId) {
      span.setAttribute('agentic.intent.id', this.intentId);
    }
    if (this.workflowId) {
      span.setAttribute('agentic.workflow.id', this.workflowId);
    }

    this.spans.push(span);
    return span;
  }

  start_span(
    name: string,
    kind: SpanKindInput,
    spanId?: string | null,
    parentSpanId?: string | null,
  ): DisseqtSpan {
    const options: {
      spanId?: string;
      parentSpanId?: string | null;
    } = {};
    if (spanId !== undefined && spanId !== null) {
      options.spanId = spanId;
    }
    if (parentSpanId !== undefined) {
      options.parentSpanId = parentSpanId;
    }
    return this.startSpan(name, kind, options);
  }

  setIntentId(intentId: string): this {
    this.intentId = intentId;
    for (const span of this.spans) {
      span.setAttribute('agentic.intent.id', intentId);
    }
    return this;
  }

  set_intent_id(intentId: string): this {
    return this.setIntentId(intentId);
  }

  setWorkflowId(workflowId: string): this {
    this.workflowId = workflowId;
    for (const span of this.spans) {
      span.setAttribute('agentic.workflow.id', workflowId);
    }
    return this;
  }

  set_workflow_id(workflowId: string): this {
    return this.setWorkflowId(workflowId);
  }

  end(): this {
    if (this.isEnded) {
      return this;
    }

    this.isEnded = true;
    this.endTimeNs = this.endTimeNs ?? nowNs();
    for (const span of this.spans) {
      if (span.endTimeNs === null) {
        span.end();
      }
    }

    if (getCurrentTrace() === this) {
      setCurrentTrace(null);
    }
    return this;
  }

  close(): this {
    return this.end();
  }

  getSpans(): DisseqtSpan[] {
    return [...this.spans];
  }

  get_spans(): DisseqtSpan[] {
    return this.getSpans();
  }

  toEnrichedSpans(): EnrichedSpan[] {
    return this.spans.map((span) => span.toEnrichedSpan());
  }

  to_enriched_spans(): EnrichedSpan[] {
    return this.toEnrichedSpans();
  }

  toDict(): JsonObject {
    return {
      trace_id: this.traceId,
      name: this.name,
      start_time_ns: this.startTimeNs,
      end_time_ns: this.endTimeNs,
      org_id: this.orgId,
      project_id: this.projectId,
      user_id: this.userId,
      service_name: this.serviceName,
      service_version: this.serviceVersion,
      environment: this.environment,
      intent_id: this.intentId,
      workflow_id: this.workflowId,
      span_count: this.spans.length,
    };
  }

  to_dict(): JsonObject {
    return this.toDict();
  }
}

function normalizeKind(kind: SpanKindInput): string {
  return Object.values(SpanKind).includes(kind as SpanKind) ? String(kind) : String(kind);
}

class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}
