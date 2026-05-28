import {
  DisseqtAgenticClient,
  SpanKind,
  startTrace,
  traceLlmCall,
  traceToolCall,
} from '../src/index.js';

const client = new DisseqtAgenticClient({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  serviceName: 'assistant-service',
});

await startTrace(client, 'agent_workflow', {
  intentId: 'intent-123',
  workflowId: 'workflow-456',
}).run(async (trace) => {
  const agentSpan = trace.startSpan('agent_execution', SpanKind.AgentExec);
  agentSpan.setAgentInfo('assistant', 'agent-001');

  const llmSpan = traceLlmCall(trace, {
    name: 'chat_completion',
    modelName: 'gpt-4',
    provider: 'openai',
    inputMessages: [{ role: 'user', content: 'Hello' }],
    outputMessages: [{ role: 'assistant', content: 'Hi there' }],
    inputTokens: 10,
    outputTokens: 5,
  });
  llmSpan.close();

  const toolSpan = traceToolCall(trace, {
    name: 'weather_api',
    toolName: 'get_weather',
    callId: 'call-001',
  });
  toolSpan.close();

  agentSpan.close();
});

await client.flush();
await client.shutdown();
