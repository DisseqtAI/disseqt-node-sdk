export const AgenticOperation = {
  CreateAgent: 'create_agent',
  InvokeAgent: 'invoke_agent',
  ExecuteTool: 'execute_tool',
  Chat: 'chat',
  TextCompletion: 'text_completion',
  Embeddings: 'embeddings',
  GenerateContent: 'generate_content',
} as const;

export const AgenticAttributes = {
  OperationName: 'agentic.operation.name',
  AgentName: 'agentic.agent.name',
  AgentId: 'agentic.agent.id',
  AgentVersion: 'agentic.agent.version',
  ToolName: 'agentic.tool.name',
  ToolCallId: 'agentic.tool.call_id',
  ToolDefinitions: 'agentic.tool.definitions',
  RequestModel: 'agentic.request.model',
  ProviderName: 'agentic.provider.name',
  RequestTemperature: 'agentic.request.temperature',
  RequestMaxTokens: 'agentic.request.max_tokens',
  RequestTopP: 'agentic.request.top_p',
  RequestTopK: 'agentic.request.top_k',
  RequestFrequencyPenalty: 'agentic.request.frequency_penalty',
  RequestPresencePenalty: 'agentic.request.presence_penalty',
  PromptName: 'agentic.prompt.name',
  PromptVariables: 'agentic.prompt.variables',
  PromptVersion: 'agentic.prompt.version',
  UsageInputTokens: 'agentic.usage.input_tokens',
  UsageOutputTokens: 'agentic.usage.output_tokens',
  UsageTotalTokens: 'agentic.usage.total_tokens',
  UsageInputCharacters: 'agentic.usage.input_characters',
  UsageOutputCharacters: 'agentic.usage.output_characters',
  InputMessages: 'agentic.input.messages',
  OutputMessages: 'agentic.output.messages',
  SystemInstructions: 'agentic.system_instructions',
  OutputType: 'agentic.output.type',
  ResponseId: 'agentic.response.id',
  ResponseModel: 'agentic.response.model',
  ResponseFinishReason: 'agentic.response.finish_reason',
  CacheHit: 'agentic.cache.hit',
  CacheOperation: 'agentic.cache.operation',
  ErrorType: 'agentic.error.type',
  ErrorMessage: 'agentic.error.message',
  ErrorCode: 'agentic.error.code',
} as const;

export const AgenticOutputType = {
  Text: 'text',
  Json: 'json',
  Image: 'image',
  Speech: 'speech',
} as const;

export const AgenticFinishReason = {
  Stop: 'stop',
  Length: 'length',
  ToolCalls: 'tool_calls',
  ContentFilter: 'content_filter',
  FunctionCall: 'function_call',
  Recitation: 'recitation',
  Error: 'error',
  Other: 'other',
} as const;

export const AgenticCacheOperation = {
  Read: 'read',
  Write: 'write',
  Delete: 'delete',
} as const;

export const AgenticProvider = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  Google: 'google',
  AwsBedrock: 'aws.bedrock',
  AzureAi: 'azure.ai',
  Cohere: 'cohere',
  MistralAi: 'mistral_ai',
  Groq: 'groq',
  Perplexity: 'perplexity',
  XAi: 'x_ai',
} as const;
