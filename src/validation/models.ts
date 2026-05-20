import type { JsonObject, JsonValue } from '../http/types.js';

export type UnknownRecord = Record<string, unknown>;

export interface SDKConfigInputInit {
  threshold: number;
  customLabels?: string[] | null;
  custom_labels?: string[] | null;
  labelThresholds?: number[] | null;
  label_thresholds?: number[] | null;
}

export class SDKConfigInput {
  readonly threshold: number;
  readonly customLabels: readonly string[] | null;
  readonly labelThresholds: readonly number[] | null;

  constructor(input: SDKConfigInputInit) {
    this.threshold = input.threshold;
    this.customLabels = input.customLabels ?? input.custom_labels ?? null;
    this.labelThresholds = input.labelThresholds ?? input.label_thresholds ?? null;
  }

  toDict(): JsonObject {
    const output: JsonObject = { threshold: this.threshold };
    if (this.customLabels !== null && this.customLabels.length > 0) {
      output.custom_labels = [...this.customLabels];
    }
    if (this.labelThresholds !== null && this.labelThresholds.length > 0) {
      output.label_thresholds = [...this.labelThresholds];
    }
    return output;
  }

  to_dict(): JsonObject {
    return this.toDict();
  }
}

export interface LlmTextFieldsInit {
  prompt?: string | null;
  context?: string | null;
  response?: string | null;
}

abstract class LlmTextFields {
  readonly prompt: string | null;
  readonly context: string | null;
  readonly response: string | null;

  protected constructor(input: LlmTextFieldsInit) {
    this.prompt = input.prompt ?? null;
    this.context = input.context ?? null;
    this.response = input.response ?? null;
  }

  protected toLlmDict(): JsonObject {
    const output: JsonObject = {};
    setIfPresent(output, 'llm_input_query', this.prompt);
    setIfPresent(output, 'llm_input_context', this.context);
    setIfPresent(output, 'llm_output', this.response);
    return output;
  }
}

export interface InputValidationRequestInit extends LlmTextFieldsInit {
  prompt: string;
}

export class InputValidationRequest extends LlmTextFields {
  constructor(input: InputValidationRequestInit) {
    if (input.prompt === null || input.prompt === undefined) {
      throw new ValueError('prompt is required');
    }
    super(input);
  }

  toInputData(): JsonObject {
    return this.toLlmDict();
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export class OutputValidationRequest extends LlmTextFields {
  constructor(input: LlmTextFieldsInit = {}) {
    super(input);
  }

  toInputData(): JsonObject {
    return this.toLlmDict();
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export class RagGroundingRequest extends LlmTextFields {
  constructor(input: LlmTextFieldsInit = {}) {
    super(input);
  }

  toInputData(): JsonObject {
    return this.toLlmDict();
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export class McpSecurityRequest extends LlmTextFields {
  constructor(input: LlmTextFieldsInit = {}) {
    super(input);
  }

  toInputData(): JsonObject {
    return this.toLlmDict();
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export interface AgenticBehaviourRequestInit {
  conversationHistory?: string[] | null;
  conversation_history?: string[] | null;
  toolCalls?: UnknownRecord[] | null;
  tool_calls?: UnknownRecord[] | null;
  agentResponses?: string[] | null;
  agent_responses?: string[] | null;
  referenceData?: UnknownRecord | null;
  reference_data?: UnknownRecord | null;
}

export class AgenticBehaviourRequest {
  readonly conversationHistory: readonly string[] | null;
  readonly toolCalls: readonly UnknownRecord[] | null;
  readonly agentResponses: readonly string[] | null;
  readonly referenceData: UnknownRecord | null;

  constructor(input: AgenticBehaviourRequestInit = {}) {
    this.conversationHistory = input.conversationHistory ?? input.conversation_history ?? null;
    this.toolCalls = input.toolCalls ?? input.tool_calls ?? null;
    this.agentResponses = input.agentResponses ?? input.agent_responses ?? null;
    this.referenceData = input.referenceData ?? input.reference_data ?? null;
  }

  toInputData(): JsonObject {
    const output: JsonObject = {};
    setIfPresent(output, 'conversation_history', this.conversationHistory);
    setIfPresent(output, 'tool_calls', this.toolCalls);
    setIfPresent(output, 'agent_responses', this.agentResponses);
    setIfPresent(output, 'reference_data', this.referenceData);
    return output;
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export interface ThemesClassifierRequestInit {
  text: string;
  returnSubthemes?: boolean;
  return_subthemes?: boolean;
  maxThemes?: number;
  max_themes?: number;
}

export class ThemesClassifierRequest {
  readonly text: string;
  readonly returnSubthemes: boolean;
  readonly maxThemes: number;

  constructor(input: ThemesClassifierRequestInit) {
    this.text = input.text;
    this.returnSubthemes = input.returnSubthemes ?? input.return_subthemes ?? true;
    this.maxThemes = input.maxThemes ?? input.max_themes ?? 3;
  }

  toInputData(): JsonObject {
    return {
      text: this.text,
      return_subthemes: this.returnSubthemes,
      max_themes: this.maxThemes,
    };
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

export interface CompositeScoreRequestInit {
  llmInputQuery?: string;
  llm_input_query?: string;
  llmOutput?: string;
  llm_output?: string;
  llmInputContext?: string | null;
  llm_input_context?: string | null;
  evaluationMode?: string;
  evaluation_mode?: string;
  weightsOverride?: UnknownRecord | null;
  weights_override?: UnknownRecord | null;
  labelsThresholdsOverride?: UnknownRecord | null;
  labels_thresholds_override?: UnknownRecord | null;
  overallConfidence?: UnknownRecord | null;
  overall_confidence?: UnknownRecord | null;
}

export class CompositeScoreRequest {
  readonly llmInputQuery: string;
  readonly llmOutput: string;
  readonly llmInputContext: string | null;
  readonly evaluationMode: string;
  readonly weightsOverride: UnknownRecord | null;
  readonly labelsThresholdsOverride: UnknownRecord | null;
  readonly overallConfidence: UnknownRecord | null;

  constructor(input: CompositeScoreRequestInit) {
    const llmInputQuery = input.llmInputQuery ?? input.llm_input_query;
    const llmOutput = input.llmOutput ?? input.llm_output;
    if (llmInputQuery === undefined) {
      throw new ValueError('llm_input_query is required');
    }
    if (llmOutput === undefined) {
      throw new ValueError('llm_output is required');
    }

    this.llmInputQuery = llmInputQuery;
    this.llmOutput = llmOutput;
    this.llmInputContext = input.llmInputContext ?? input.llm_input_context ?? null;
    this.evaluationMode = input.evaluationMode ?? input.evaluation_mode ?? 'binary_threshold';
    this.weightsOverride = input.weightsOverride ?? input.weights_override ?? null;
    this.labelsThresholdsOverride =
      input.labelsThresholdsOverride ?? input.labels_thresholds_override ?? null;
    this.overallConfidence = input.overallConfidence ?? input.overall_confidence ?? null;
  }

  toInputData(): JsonObject {
    const inputData: JsonObject = {
      llm_input_query: this.llmInputQuery,
      llm_output: this.llmOutput,
    };
    if (this.llmInputContext !== null && this.llmInputContext.length > 0) {
      inputData.llm_input_context = this.llmInputContext;
    }

    const options: JsonObject = {
      evaluation_mode: this.evaluationMode,
    };
    setNonEmptyRecord(options, 'weights_override', this.weightsOverride);
    setNonEmptyRecord(options, 'labels_thresholds_override', this.labelsThresholdsOverride);
    setNonEmptyRecord(options, 'overall_confidence', this.overallConfidence);

    return {
      input_data: inputData,
      options,
    };
  }

  to_input_data(): JsonObject {
    return this.toInputData();
  }
}

function setIfPresent(output: JsonObject, key: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    output[key] = value;
  }
}

function setNonEmptyRecord(output: JsonObject, key: string, value: UnknownRecord | null): void {
  if (value !== null && Object.keys(value).length > 0) {
    output[key] = value;
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

export type ValidatorRequestModel =
  | InputValidationRequest
  | OutputValidationRequest
  | RagGroundingRequest
  | AgenticBehaviourRequest
  | McpSecurityRequest
  | ThemesClassifierRequest
  | CompositeScoreRequest;

export type ValidatorConfigInput = SDKConfigInput | SDKConfigInputInit;
export type InputDataPayload = JsonObject;
export interface ValidationPayload extends JsonObject {
  input_data: InputDataPayload;
  config_input: JsonObject;
}
export type CompositePayload = ReturnType<CompositeScoreRequest['toInputData']>;
export type ThemesClassifierPayload = ReturnType<ThemesClassifierRequest['toInputData']>;
export type AnyValidationPayload = ValidationPayload | CompositePayload | ThemesClassifierPayload;
export type SerializableValidationInput = ValidatorRequestModel | JsonObject;
export type SerializableValue = JsonValue;
