import type { JsonObject, JsonValue } from '../http/types.js';
import { getCurrentSpan, setCurrentSpan } from './context.js';
import { SpanStatus, type SpanKindInput, type SpanStatusInput } from './enums.js';
import { EnrichedSpan } from './models.js';
import { AgenticAttributes } from './semantics.js';
import { calculateDurationNs, generateSpanId, nowNs } from './utils.js';

export interface DisseqtSpanInit {
  traceId?: string;
  trace_id?: string;
  name: string;
  kind: SpanKindInput;
  spanId?: string;
  span_id?: string;
  parentSpanId?: string | null;
  parent_span_id?: string | null;
  projectId?: string;
  project_id?: string;
  userId?: string;
  user_id?: string;
  serviceName?: string;
  service_name?: string;
  serviceVersion?: string;
  service_version?: string;
  environment?: string;
}

export type SpanAttributeValue = JsonValue | JsonObject[] | unknown;

export class DisseqtSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly root: boolean;
  readonly name: string;
  readonly kind: string;
  readonly orgId = '';
  readonly projectId: string;
  readonly userId: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  readonly startTimeNs: number;
  readonly attributes: Record<string, SpanAttributeValue> = {};

  endTimeNs: number | null = null;
  status: SpanStatus = SpanStatus.Ok;
  statusMessage = '';

  private readonly parentSpanContext: DisseqtSpan | null;

  constructor(input: DisseqtSpanInit) {
    const traceId = input.traceId ?? input.trace_id;
    if (traceId === undefined) {
      throw new ValueError('trace_id is required');
    }

    let parentSpanId = input.parentSpanId ?? input.parent_span_id ?? null;
    let parentSpanContext: DisseqtSpan | null = null;
    const currentSpan = getCurrentSpan();
    if (
      parentSpanId === null &&
      currentSpan !== null &&
      String(currentSpan.traceId) === String(traceId)
    ) {
      parentSpanId = currentSpan.spanId;
      parentSpanContext = currentSpan;
    }

    this.traceId = traceId;
    this.spanId = input.spanId ?? input.span_id ?? generateSpanId();
    this.parentSpanId = parentSpanId;
    this.parentSpanContext = parentSpanContext;
    this.root = parentSpanId === null;
    this.name = input.name;
    this.kind = normalizeKind(input.kind);
    this.projectId = input.projectId ?? input.project_id ?? '';
    this.userId = input.userId ?? input.user_id ?? '';
    this.serviceName = input.serviceName ?? input.service_name ?? '';
    this.serviceVersion = input.serviceVersion ?? input.service_version ?? '1.0.0';
    this.environment = input.environment ?? 'production';
    this.startTimeNs = nowNs();

    setCurrentSpan(this);
  }

  setAgentInfo(
    agentName?: string | null,
    agentId?: string | null,
    agentVersion?: string | null,
  ): this {
    if (agentName) {
      this.attributes[AgenticAttributes.AgentName] = agentName;
    }
    if (agentId) {
      this.attributes[AgenticAttributes.AgentId] = agentId;
    }
    if (agentVersion) {
      this.attributes[AgenticAttributes.AgentVersion] = agentVersion;
    }
    return this;
  }

  set_agent_info(
    agentName?: string | null,
    agentId?: string | null,
    agentVersion?: string | null,
  ): this {
    return this.setAgentInfo(agentName, agentId, agentVersion);
  }

  setModelInfo(modelName: string, provider: string): this {
    this.attributes[AgenticAttributes.RequestModel] = modelName;
    this.attributes[AgenticAttributes.ProviderName] = provider;
    return this;
  }

  set_model_info(modelName: string, provider: string): this {
    return this.setModelInfo(modelName, provider);
  }

  setToolInfo(toolName: string, toolCallId?: string | null): this {
    this.attributes[AgenticAttributes.ToolName] = toolName;
    if (toolCallId) {
      this.attributes[AgenticAttributes.ToolCallId] = toolCallId;
    }
    return this;
  }

  set_tool_info(toolName: string, toolCallId?: string | null): this {
    return this.setToolInfo(toolName, toolCallId);
  }

  setOperation(operation: string): this {
    this.attributes[AgenticAttributes.OperationName] = operation;
    return this;
  }

  set_operation(operation: string): this {
    return this.setOperation(operation);
  }

  setTokenUsage(inputTokens: number, outputTokens: number): this {
    this.attributes[AgenticAttributes.UsageInputTokens] = inputTokens;
    this.attributes[AgenticAttributes.UsageOutputTokens] = outputTokens;
    this.attributes[AgenticAttributes.UsageTotalTokens] = inputTokens + outputTokens;
    return this;
  }

  set_token_usage(inputTokens: number, outputTokens: number): this {
    return this.setTokenUsage(inputTokens, outputTokens);
  }

  setMessages(inputMessages?: JsonObject[] | null, outputMessages?: JsonObject[] | null): this {
    if (inputMessages !== undefined && inputMessages !== null && inputMessages.length > 0) {
      this.attributes[AgenticAttributes.InputMessages] = inputMessages;
    }
    if (outputMessages !== undefined && outputMessages !== null && outputMessages.length > 0) {
      this.attributes[AgenticAttributes.OutputMessages] = outputMessages;
    }
    return this;
  }

  set_messages(inputMessages?: JsonObject[] | null, outputMessages?: JsonObject[] | null): this {
    return this.setMessages(inputMessages, outputMessages);
  }

  setStatus(status: SpanStatusInput, message = ''): this {
    if (status !== SpanStatus.Ok && status !== SpanStatus.Error) {
      throw new ValueError(`Unsupported span status: ${status}`);
    }
    this.status = status === SpanStatus.Error ? SpanStatus.Error : SpanStatus.Ok;
    if (message.length > 0) {
      this.statusMessage = message;
    }
    return this;
  }

  set_status(status: SpanStatusInput, message = ''): this {
    return this.setStatus(status, message);
  }

  setError(errorMessage: string, errorType?: string | null): this {
    this.status = SpanStatus.Error;
    this.attributes[AgenticAttributes.ErrorMessage] = errorMessage;
    if (errorType) {
      this.attributes[AgenticAttributes.ErrorType] = errorType;
    }
    return this;
  }

  set_error(errorMessage: string, errorType?: string | null): this {
    return this.setError(errorMessage, errorType);
  }

  setAttribute(key: string, value: SpanAttributeValue): this {
    this.attributes[key] = value;
    return this;
  }

  set_attribute(key: string, value: SpanAttributeValue): this {
    return this.setAttribute(key, value);
  }

  end(): this {
    if (this.endTimeNs === null) {
      this.endTimeNs = nowNs();
    }
    return this;
  }

  close(error?: unknown): this {
    if (error !== undefined) {
      const errorValue = error instanceof Error ? error : new Error(String(error));
      this.setError(errorValue.message, errorValue.name);
    }
    this.end();
    setCurrentSpan(this.parentSpanContext);
    return this;
  }

  toEnrichedSpan(): EnrichedSpan {
    const endTime = this.endTimeNs ?? nowNs();
    return new EnrichedSpan({
      trace_id: this.traceId,
      span_id: this.spanId,
      parent_span_id: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      root: this.root,
      start_time_unix_nano: this.startTimeNs,
      end_time_unix_nano: endTime,
      duration_ns: calculateDurationNs(this.startTimeNs, endTime),
      status_code: this.status,
      status_message: this.statusMessage,
      org_id: this.orgId,
      project_id: this.projectId,
      user_id: this.userId,
      service_name: this.serviceName,
      service_version: this.serviceVersion,
      environment: this.environment,
      dt: new Date(),
      attributes_json:
        Object.keys(this.attributes).length > 0 ? JSON.stringify(this.attributes) : '{}',
      resource_attributes_json: '{}',
      events_json: '[]',
      ingestion_time: new Date(),
    });
  }

  to_enriched_span(): EnrichedSpan {
    return this.toEnrichedSpan();
  }
}

function normalizeKind(kind: SpanKindInput): string {
  return String(kind);
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
