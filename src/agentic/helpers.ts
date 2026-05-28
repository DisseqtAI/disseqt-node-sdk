import type { JsonObject } from '../http/types.js';
import type { DisseqtAgenticClient } from './client.js';
import { SpanKind, type SpanKindInput } from './enums.js';
import { AgenticAttributes, AgenticOperation } from './semantics.js';
import type { DisseqtSpan, SpanAttributeValue } from './span.js';
import { DisseqtTrace } from './trace.js';

let globalClient: DisseqtAgenticClient | null = null;

export function getClient(): DisseqtAgenticClient | null {
  return globalClient;
}

export function get_client(): DisseqtAgenticClient | null {
  return getClient();
}

export function setClient(client: DisseqtAgenticClient | null): void {
  globalClient = client;
}

export function set_client(client: DisseqtAgenticClient | null): void {
  setClient(client);
}

export function getCurrentClient(): DisseqtAgenticClient {
  if (globalClient === null) {
    throw new RuntimeError(
      'SDK not initialized. Call setClient(client) or pass a DisseqtAgenticClient instance.',
    );
  }
  return globalClient;
}

export function get_current_client(): DisseqtAgenticClient {
  return getCurrentClient();
}

export function isInitialized(): boolean {
  return globalClient !== null;
}

export function is_initialized(): boolean {
  return isInitialized();
}

export async function flush(): Promise<void> {
  await getCurrentClient().flush();
}

export async function shutdown(): Promise<void> {
  const client = getCurrentClient();
  await client.shutdown();
  globalClient = null;
}

export interface StartTraceOptions {
  traceId?: string;
  trace_id?: string;
  intentId?: string | null;
  intent_id?: string | null;
  workflowId?: string | null;
  workflow_id?: string | null;
  userId?: string | null;
  user_id?: string | null;
}

export class TraceWrapper {
  readonly trace: DisseqtTrace;

  private sent = false;

  constructor(
    trace: DisseqtTrace,
    private readonly client: DisseqtAgenticClient,
  ) {
    this.trace = trace;
  }

  close(): void {
    if (this.sent) {
      return;
    }
    this.trace.end();
    this.client.sendTrace(this.trace);
    this.sent = true;
  }

  async run<T>(callback: (trace: DisseqtTrace) => T | Promise<T>): Promise<T> {
    try {
      return await callback(this.trace);
    } finally {
      this.close();
    }
  }
}

export function startTrace(
  client: DisseqtAgenticClient,
  name: string,
  options?: StartTraceOptions,
): TraceWrapper {
  const traceId = options?.traceId ?? options?.trace_id;
  const trace = new DisseqtTrace({
    name,
    projectId: client.projectId,
    userId: options?.userId ?? options?.user_id ?? '',
    serviceName: client.serviceName,
    serviceVersion: client.serviceVersion,
    environment: client.environment,
    intentId: options?.intentId ?? options?.intent_id ?? null,
    workflowId: options?.workflowId ?? options?.workflow_id ?? null,
    ...(traceId !== undefined ? { traceId } : {}),
  });
  return new TraceWrapper(trace, client);
}

export const start_trace = startTrace;

export interface TraceLlmCallOptions {
  name: string;
  modelName?: string;
  model_name?: string;
  provider: string;
  inputMessages?: JsonObject[] | null;
  input_messages?: JsonObject[] | null;
  outputMessages?: JsonObject[] | null;
  output_messages?: JsonObject[] | null;
  inputTokens?: number | null;
  input_tokens?: number | null;
  outputTokens?: number | null;
  output_tokens?: number | null;
  temperature?: number | null;
  maxTokens?: number | null;
  max_tokens?: number | null;
  attributes?: Record<string, SpanAttributeValue>;
}

export function traceLlmCall(trace: DisseqtTrace, options: TraceLlmCallOptions): DisseqtSpan {
  const modelName = options.modelName ?? options.model_name;
  if (modelName === undefined) {
    throw new ValueError('model_name is required');
  }

  const span = trace.startSpan(options.name, SpanKind.ModelExec);
  span.setModelInfo(modelName, options.provider);
  span.setOperation(AgenticOperation.Chat);
  span.setMessages(
    options.inputMessages ?? options.input_messages ?? null,
    options.outputMessages ?? options.output_messages ?? null,
  );

  const inputTokens = options.inputTokens ?? options.input_tokens;
  const outputTokens = options.outputTokens ?? options.output_tokens;
  if (
    inputTokens !== undefined &&
    inputTokens !== null &&
    outputTokens !== undefined &&
    outputTokens !== null
  ) {
    span.setTokenUsage(inputTokens, outputTokens);
  }
  if (options.temperature !== undefined && options.temperature !== null) {
    span.setAttribute(AgenticAttributes.RequestTemperature, options.temperature);
  }
  const maxTokens = options.maxTokens ?? options.max_tokens;
  if (maxTokens !== undefined && maxTokens !== null) {
    span.setAttribute(AgenticAttributes.RequestMaxTokens, maxTokens);
  }
  setAttributes(span, options.attributes);
  return span;
}

export const trace_llm_call = traceLlmCall;

export interface TraceAgentActionOptions {
  name: string;
  agentName?: string;
  agent_name?: string;
  agentId?: string | null;
  agent_id?: string | null;
  agentVersion?: string | null;
  agent_version?: string | null;
  operation?: string | null;
  attributes?: Record<string, SpanAttributeValue>;
}

export function traceAgentAction(
  trace: DisseqtTrace,
  options: TraceAgentActionOptions,
): DisseqtSpan {
  const agentName = options.agentName ?? options.agent_name;
  if (agentName === undefined) {
    throw new ValueError('agent_name is required');
  }

  const span = trace.startSpan(options.name, SpanKind.AgentExec);
  span.setAgentInfo(
    agentName,
    options.agentId ?? options.agent_id ?? null,
    options.agentVersion ?? options.agent_version ?? null,
  );
  if (options.operation) {
    span.setOperation(options.operation);
  }
  setAttributes(span, options.attributes);
  return span;
}

export const trace_agent_action = traceAgentAction;

export interface TraceToolCallOptions {
  name: string;
  toolName?: string;
  tool_name?: string;
  callId?: string | null;
  call_id?: string | null;
  toolDefinitions?: JsonObject[] | null;
  tool_definitions?: JsonObject[] | null;
  attributes?: Record<string, SpanAttributeValue>;
}

export function traceToolCall(trace: DisseqTraceLike, options: TraceToolCallOptions): DisseqtSpan {
  const toolName = options.toolName ?? options.tool_name;
  if (toolName === undefined) {
    throw new ValueError('tool_name is required');
  }

  const span = trace.startSpan(options.name, SpanKind.ToolExec);
  span.setToolInfo(toolName, options.callId ?? options.call_id ?? null);
  const toolDefinitions = options.toolDefinitions ?? options.tool_definitions;
  if (toolDefinitions !== undefined && toolDefinitions !== null && toolDefinitions.length > 0) {
    span.setAttribute(AgenticAttributes.ToolDefinitions, toolDefinitions);
  }
  span.setOperation(AgenticOperation.ExecuteTool);
  setAttributes(span, options.attributes);
  return span;
}

export const trace_tool_call = traceToolCall;

export interface TraceFunctionOptions {
  name?: string;
  kind?: SpanKindInput;
  attributes?: Record<string, SpanAttributeValue>;
}

export function traceFunction<TArgs extends unknown[], TResult>(
  client: DisseqtAgenticClient,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options: TraceFunctionOptions = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const spanName = options.name ?? (fn.name || 'anonymous_function');
    return startTrace(client, `${spanName}_trace`).run(async (trace) => {
      const span = trace.startSpan(spanName, options.kind ?? SpanKind.Internal);
      setAttributes(span, options.attributes);

      try {
        return await fn(...args);
      } catch (error) {
        const errorValue = error instanceof Error ? error : new Error(String(error));
        span.setError(errorValue.message, errorValue.name);
        throw error;
      } finally {
        span.close();
      }
    });
  };
}

export const trace_function = traceFunction;

type DisseqTraceLike = Pick<DisseqtTrace, 'startSpan'>;

function setAttributes(span: DisseqtSpan, attributes?: Record<string, SpanAttributeValue>): void {
  if (attributes === undefined) {
    return;
  }
  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value);
  }
}

class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
