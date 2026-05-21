import { describe, expect, it } from 'vitest';

import {
  AgenticAttributes,
  DisseqtSpan,
  DisseqtTrace,
  EnrichedSpan,
  SpanKind,
  SpanStatus,
  calculateDurationNs,
  clearContext,
  generateSpanId,
  generateTraceId,
  getCurrentSpan,
  getCurrentTrace,
  nowMs,
  nowNs,
  setCurrentSpan,
} from '../../src/index.js';

describe('agentic IDs and time utilities', () => {
  it('generates Python-compatible trace and span IDs', () => {
    expect(generateTraceId()).toMatch(/^[a-f0-9]{32}$/);
    expect(generateSpanId()).toMatch(/^[a-f0-9]{16}$/);
  });

  it('returns timestamps and calculates durations', () => {
    expect(nowNs()).toBeGreaterThan(nowMs());
    expect(calculateDurationNs(100, 250)).toBe(150);
  });
});

describe('EnrichedSpan', () => {
  it('serializes to the Python backend-facing dictionary shape', () => {
    const dt = new Date('2026-05-21T00:00:00.000Z');
    const span = new EnrichedSpan({
      trace_id: 'trace-1',
      span_id: 'span-1',
      parent_span_id: null,
      name: 'llm_call',
      kind: SpanKind.ModelExec,
      root: true,
      start_time_unix_nano: 100,
      end_time_unix_nano: 300,
      duration_ns: 200,
      status_code: SpanStatus.Ok,
      project_id: 'project',
      service_name: 'svc',
      dt,
      ingestion_time: dt,
    });

    expect(span.to_dict()).toEqual({
      trace_id: 'trace-1',
      span_id: 'span-1',
      parent_span_id: '',
      name: 'llm_call',
      kind: 'MODEL_EXEC',
      root: true,
      start_time_unix_nano: 100,
      end_time_unix_nano: 300,
      duration_ns: 200,
      status_code: 'OK',
      status_message: '',
      org_id: '',
      project_id: 'project',
      user_id: '',
      service_name: 'svc',
      service_version: '1.0.0',
      environment: 'production',
      dt: '2026-05-21T00:00:00.000Z',
      attributes_json: '{}',
      resource_attributes_json: '{}',
      events_json: '[]',
      scope_name: '',
      scope_version: '',
      ingestion_time: '2026-05-21T00:00:00.000Z',
    });
    expect(JSON.parse(span.to_json())).toHaveProperty('trace_id', 'trace-1');
  });

  it('creates instances from dictionaries and defaults dt like Python', () => {
    const span = EnrichedSpan.from_dict({
      trace_id: 'trace-1',
      span_id: 'span-1',
      parent_span_id: '',
    });

    expect(span.traceId).toBe('trace-1');
    expect(span.parentSpanId).toBe('');
    expect(span.dt).toBeInstanceOf(Date);
  });
});

describe('DisseqtSpan', () => {
  it('sets semantic attributes and converts to EnrichedSpan', () => {
    clearContext();
    const span = new DisseqtSpan({
      trace_id: 'trace-1',
      span_id: 'span-root',
      name: 'llm_call',
      kind: SpanKind.ModelExec,
      project_id: 'project',
      user_id: 'user',
      service_name: 'svc',
    });

    span
      .set_agent_info('agent', 'agent-1', '1.0')
      .set_model_info('gpt-4', 'openai')
      .set_tool_info('weather', 'call-1')
      .set_operation('chat')
      .set_token_usage(10, 5)
      .set_messages([{ role: 'user', content: 'Hello' }], [{ role: 'assistant', content: 'Hi' }])
      .set_attribute('custom', true)
      .end();

    const enriched = span.to_enriched_span().to_dict();
    const attributes = JSON.parse(String(enriched.attributes_json));

    expect(enriched.trace_id).toBe('trace-1');
    expect(enriched.span_id).toBe('span-root');
    expect(enriched.parent_span_id).toBe('');
    expect(enriched.kind).toBe('MODEL_EXEC');
    expect(enriched.root).toBe(true);
    expect(attributes[AgenticAttributes.AgentName]).toBe('agent');
    expect(attributes[AgenticAttributes.RequestModel]).toBe('gpt-4');
    expect(attributes[AgenticAttributes.ProviderName]).toBe('openai');
    expect(attributes[AgenticAttributes.ToolCallId]).toBe('call-1');
    expect(attributes[AgenticAttributes.UsageTotalTokens]).toBe(15);
    expect(attributes.custom).toBe(true);
  });

  it('detects parent spans from current context and restores parent on close', () => {
    clearContext();
    const root = new DisseqtSpan({
      trace_id: 'trace-1',
      span_id: 'root',
      name: 'root',
      kind: SpanKind.AgentExec,
    });
    const child = new DisseqtSpan({
      trace_id: 'trace-1',
      span_id: 'child',
      name: 'child',
      kind: SpanKind.ToolExec,
    });

    expect(child.parentSpanId).toBe('root');
    expect(child.root).toBe(false);
    expect(getCurrentSpan()).toBe(child);

    child.close();
    expect(getCurrentSpan()).toBe(root);

    root.close();
    expect(getCurrentSpan()).toBeNull();
  });

  it('sets error status and rejects unsupported statuses', () => {
    const span = new DisseqtSpan({
      trace_id: 'trace-1',
      name: 'tool',
      kind: 'CUSTOM_KIND',
    });

    span.set_error('failed', 'ToolError');
    expect(span.status).toBe(SpanStatus.Error);
    expect(span.attributes[AgenticAttributes.ErrorMessage]).toBe('failed');
    expect(() => span.set_status('UNKNOWN' as SpanStatus)).toThrow('Unsupported span status');
  });
});

describe('DisseqtTrace', () => {
  it('creates spans with trace metadata and serializes trace dictionaries', () => {
    clearContext();
    const trace = new DisseqtTrace({
      name: 'agent_workflow',
      trace_id: 'trace-1',
      project_id: 'project',
      user_id: 'user',
      service_name: 'svc',
      intent_id: 'intent-1',
      workflow_id: 'workflow-1',
    });

    expect(getCurrentTrace()).toBe(trace);

    const root = trace.start_span('agent', SpanKind.AgentExec, 'root');
    const child = trace.startSpan('llm', SpanKind.ModelExec, { spanId: 'child' });
    child.close();
    root.close();

    expect(trace.get_spans()).toHaveLength(2);
    expect(trace.to_dict()).toMatchObject({
      trace_id: 'trace-1',
      name: 'agent_workflow',
      project_id: 'project',
      user_id: 'user',
      service_name: 'svc',
      service_version: '1.0.0',
      environment: 'production',
      intent_id: 'intent-1',
      workflow_id: 'workflow-1',
      span_count: 2,
    });

    const enriched = trace.to_enriched_spans().map((span) => span.to_dict());
    const rootAttrs = JSON.parse(String(enriched[0]?.attributes_json));
    expect(rootAttrs['agentic.intent.id']).toBe('intent-1');
    expect(rootAttrs['agentic.workflow.id']).toBe('workflow-1');
    expect(enriched[1]?.parent_span_id).toBe('root');

    trace.end();
    expect(trace.isEnded).toBe(true);
    expect(getCurrentTrace()).toBeNull();
    expect(() => trace.startSpan('late', SpanKind.Internal)).toThrow(
      'Cannot start a new span on an ended trace.',
    );
  });

  it('updates existing spans when intent and workflow IDs change', () => {
    clearContext();
    const trace = new DisseqtTrace({ name: 'workflow', trace_id: 'trace-2' });
    const span = trace.startSpan('agent', SpanKind.AgentExec);

    trace.set_intent_id('intent-2').set_workflow_id('workflow-2');

    expect(span.attributes['agentic.intent.id']).toBe('intent-2');
    expect(span.attributes['agentic.workflow.id']).toBe('workflow-2');
  });

  it('allows manual context clearing', () => {
    clearContext();
    const trace = new DisseqtTrace({ name: 'workflow' });
    const span = trace.startSpan('agent', SpanKind.AgentExec);
    expect(getCurrentTrace()).toBe(trace);
    expect(getCurrentSpan()).toBe(span);

    setCurrentSpan(null);
    clearContext();
    expect(getCurrentTrace()).toBeNull();
    expect(getCurrentSpan()).toBeNull();
  });
});
