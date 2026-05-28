export enum SpanKind {
  ModelExec = 'MODEL_EXEC',
  ToolExec = 'TOOL_EXEC',
  AgentExec = 'AGENT_EXEC',
  RagExec = 'RAG_EXEC',
  McpExec = 'MCP_EXEC',
  Internal = 'INTERNAL',
  Client = 'CLIENT',
  Server = 'SERVER',
  Producer = 'PRODUCER',
  Consumer = 'CONSUMER',
}

export enum SpanStatus {
  Ok = 'OK',
  Error = 'ERROR',
}

export type SpanKindInput = SpanKind | string;
export type SpanStatusInput = SpanStatus | `${SpanStatus}`;
