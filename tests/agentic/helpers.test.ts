import { describe, expect, it, vi } from 'vitest';

import {
  AgenticAttributes,
  AgenticOperation,
  DisseqtAgenticClient,
  DisseqtTrace,
  SpanKind,
  flush,
  getClient,
  getCurrentClient,
  isInitialized,
  setClient,
  shutdown,
  startTrace,
  traceAgentAction,
  traceFunction,
  traceLlmCall,
  traceToolCall,
  type FetchLike,
} from '../../src/index.js';

const createClient = () =>
  new DisseqtAgenticClient({
    apiKey: 'key',
    projectId: 'project',
    serviceName: 'svc',
    endpoint: 'https://api.example.test/traces',
    flushIntervalMs: 60_000,
    fetch: vi.fn<FetchLike>().mockResolvedValue(new Response('{}', { status: 200 })),
  });

describe('global agentic client helpers', () => {
  it('sets, gets, flushes, and shuts down the global client', async () => {
    setClient(null);
    expect(getClient()).toBeNull();
    expect(isInitialized()).toBe(false);
    expect(() => getCurrentClient()).toThrow('SDK not initialized');

    const client = createClient();
    const flushSpy = vi.spyOn(client, 'flush');
    const shutdownSpy = vi.spyOn(client, 'shutdown');
    setClient(client);

    expect(getClient()).toBe(client);
    expect(getCurrentClient()).toBe(client);
    expect(isInitialized()).toBe(true);

    await flush();
    expect(flushSpy).toHaveBeenCalledOnce();

    await shutdown();
    expect(shutdownSpy).toHaveBeenCalledOnce();
    expect(getClient()).toBeNull();
  });
});

describe('startTrace', () => {
  it('returns a wrapper that sends the trace on close', async () => {
    const client = createClient();
    const sendSpy = vi.spyOn(client, 'sendTrace');

    const wrapper = startTrace(client, 'workflow', {
      trace_id: 'trace-1',
      intent_id: 'intent-1',
      workflow_id: 'workflow-1',
      user_id: 'user-1',
    });
    wrapper.trace.startSpan('agent', SpanKind.AgentExec).end();
    wrapper.close();

    expect(sendSpy).toHaveBeenCalledWith(wrapper.trace);
    expect(wrapper.trace.to_dict()).toMatchObject({
      trace_id: 'trace-1',
      project_id: 'project',
      user_id: 'user-1',
      service_name: 'svc',
      intent_id: 'intent-1',
      workflow_id: 'workflow-1',
    });

    await client.shutdown();
  });

  it('runs callback traces and sends even when the callback throws', async () => {
    const client = createClient();
    const sendSpy = vi.spyOn(client, 'sendTrace');

    await expect(
      startTrace(client, 'workflow').run(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(sendSpy).toHaveBeenCalledOnce();
    await client.shutdown();
  });
});

describe('span helper functions', () => {
  it('creates LLM call spans with model, messages, usage, and parameters', () => {
    const trace = new DisseqtTrace({ name: 'workflow', trace_id: 'trace-1' });
    const span = traceLlmCall(trace, {
      name: 'chat_completion',
      model_name: 'gpt-4',
      provider: 'openai',
      input_messages: [{ role: 'user', content: 'Hello' }],
      output_messages: [{ role: 'assistant', content: 'Hi' }],
      input_tokens: 100,
      output_tokens: 50,
      temperature: 0.7,
      max_tokens: 200,
      attributes: { custom_attr: 'custom_value' },
    });

    expect(span.name).toBe('chat_completion');
    expect(span.kind).toBe('MODEL_EXEC');
    expect(span.attributes[AgenticAttributes.RequestModel]).toBe('gpt-4');
    expect(span.attributes[AgenticAttributes.ProviderName]).toBe('openai');
    expect(span.attributes[AgenticAttributes.OperationName]).toBe(AgenticOperation.Chat);
    expect(span.attributes[AgenticAttributes.InputMessages]).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
    expect(span.attributes[AgenticAttributes.UsageTotalTokens]).toBe(150);
    expect(span.attributes[AgenticAttributes.RequestTemperature]).toBe(0.7);
    expect(span.attributes[AgenticAttributes.RequestMaxTokens]).toBe(200);
    expect(span.attributes.custom_attr).toBe('custom_value');
  });

  it('creates agent action and tool call spans with common attributes', () => {
    const trace = new DisseqtTrace({ name: 'workflow', trace_id: 'trace-1' });
    const agentSpan = traceAgentAction(trace, {
      name: 'planning',
      agent_name: 'assistant',
      agent_id: 'agent_001',
      agent_version: '1.0.0',
      operation: AgenticOperation.InvokeAgent,
      attributes: { custom_key: 'value' },
    });
    const toolSpan = traceToolCall(trace, {
      name: 'weather_api',
      tool_name: 'get_weather',
      call_id: 'call_001',
      tool_definitions: [{ name: 'get_weather', description: 'Get weather' }],
    });

    expect(agentSpan.kind).toBe('AGENT_EXEC');
    expect(agentSpan.attributes[AgenticAttributes.AgentName]).toBe('assistant');
    expect(agentSpan.attributes[AgenticAttributes.AgentId]).toBe('agent_001');
    expect(agentSpan.attributes[AgenticAttributes.OperationName]).toBe(
      AgenticOperation.InvokeAgent,
    );
    expect(agentSpan.attributes.custom_key).toBe('value');

    expect(toolSpan.kind).toBe('TOOL_EXEC');
    expect(toolSpan.attributes[AgenticAttributes.ToolName]).toBe('get_weather');
    expect(toolSpan.attributes[AgenticAttributes.ToolCallId]).toBe('call_001');
    expect(toolSpan.attributes[AgenticAttributes.ToolDefinitions]).toEqual([
      { name: 'get_weather', description: 'Get weather' },
    ]);
    expect(toolSpan.attributes[AgenticAttributes.OperationName]).toBe(AgenticOperation.ExecuteTool);
  });
});

describe('traceFunction', () => {
  it('wraps successful async functions and sends traces', async () => {
    const client = createClient();
    const sendSpy = vi.spyOn(client, 'sendTrace');
    const wrapped = traceFunction(client, async (name: string) => `hello ${name}`, {
      name: 'my_function',
      kind: SpanKind.AgentExec,
      attributes: { agent_name: 'test_agent' },
    });

    await expect(wrapped('world')).resolves.toBe('hello world');
    expect(sendSpy).toHaveBeenCalledOnce();
    const trace = sendSpy.mock.calls[0]?.[0];
    expect(trace?.spans[0]?.name).toBe('my_function');
    expect(trace?.spans[0]?.kind).toBe('AGENT_EXEC');
    expect(trace?.spans[0]?.attributes.agent_name).toBe('test_agent');

    await client.shutdown();
  });

  it('records errors and rethrows', async () => {
    const client = createClient();
    const sendSpy = vi.spyOn(client, 'sendTrace');
    const wrapped = traceFunction(
      client,
      async () => {
        throw new TypeError('bad');
      },
      { name: 'error_func', kind: 'CUSTOM_OPERATION' },
    );

    await expect(wrapped()).rejects.toThrow('bad');
    const trace = sendSpy.mock.calls[0]?.[0];
    expect(trace?.spans[0]?.kind).toBe('CUSTOM_OPERATION');
    expect(trace?.spans[0]?.attributes[AgenticAttributes.ErrorMessage]).toBe('bad');
    expect(trace?.spans[0]?.attributes[AgenticAttributes.ErrorType]).toBe('TypeError');

    await client.shutdown();
  });
});
