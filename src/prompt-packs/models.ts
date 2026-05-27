import type { JsonObject, QueryParams } from '../http/types.js';

export enum PromptPackOutputValidationCategory {
  OutputValidation = 'output-validation',
  InputValidation = 'input-validation',
  RagGrounding = 'rag-grounding',
  AgenticBehavior = 'agentic-behavior',
  McpSecurity = 'mcp-security',
}

export enum OutputValidationMetric {
  Coherence = 'coherence',
  Diversity = 'diversity',
  Toxicity = 'toxicity',
  DataLeakage = 'data-leakage',
  NarrativeContinuity = 'narrative-continuity',
  InsecureOutput = 'insecure-output',
  ResponseTone = 'response-tone',
  Clarity = 'clarity',
  Readability = 'readability',
  GrammarCorrectness = 'grammar-correctness',
  Nsfw = 'nsfw',
  Bias = 'bias',
  GenderBias = 'gender-bias',
  RacialBias = 'racial-bias',
  PoliticalBias = 'political-bias',
  Intersectionality = 'intersectionality',
  HateSpeech = 'hate-speech',
  SexualContent = 'sexual-content',
  Terrorism = 'terrorism',
  Violence = 'violence',
  SelfHarm = 'self-harm',
}

export interface PromptPackCategoryInit {
  mainCategory?: string;
  main_category?: string;
  subcategory: string;
  promptsCount?: number;
  prompts_count?: number;
}

export class PromptPackCategory {
  readonly mainCategory: string;
  readonly subcategory: string;
  readonly promptsCount: number;

  constructor(input: PromptPackCategoryInit) {
    const mainCategory = input.mainCategory ?? input.main_category;
    const promptsCount = input.promptsCount ?? input.prompts_count;

    if (mainCategory === undefined) {
      throw new ValueError('main_category is required');
    }
    if (promptsCount === undefined) {
      throw new ValueError('prompts_count is required');
    }

    this.mainCategory = mainCategory;
    this.subcategory = input.subcategory;
    this.promptsCount = promptsCount;
  }

  toDict(): JsonObject {
    return {
      main_category: this.mainCategory,
      subcategory: this.subcategory,
      prompts_count: this.promptsCount,
    };
  }

  to_dict(): JsonObject {
    return this.toDict();
  }
}

export interface GeneratePromptPackRequestInit {
  packName?: string;
  pack_name?: string;
  packShortDesc?: string;
  pack_short_desc?: string;
  author: string;
  domain: string;
  generationType?: string;
  generation_type?: string;
  categories: (PromptPackCategory | PromptPackCategoryInit)[];
}

export class GeneratePromptPackRequest {
  readonly packName: string;
  readonly packShortDesc: string;
  readonly author: string;
  readonly domain: string;
  readonly generationType: string;
  readonly categories: readonly PromptPackCategory[];

  constructor(input: GeneratePromptPackRequestInit) {
    const packName = input.packName ?? input.pack_name;
    const packShortDesc = input.packShortDesc ?? input.pack_short_desc;
    const generationType = input.generationType ?? input.generation_type;

    if (packName === undefined) {
      throw new ValueError('pack_name is required');
    }
    if (packShortDesc === undefined) {
      throw new ValueError('pack_short_desc is required');
    }
    if (generationType === undefined) {
      throw new ValueError('generation_type is required');
    }

    this.packName = packName;
    this.packShortDesc = packShortDesc;
    this.author = input.author;
    this.domain = input.domain;
    this.generationType = generationType;
    this.categories = input.categories.map((category) =>
      category instanceof PromptPackCategory ? category : new PromptPackCategory(category),
    );
  }

  toPayload(): JsonObject {
    return {
      pack_name: this.packName,
      pack_short_desc: this.packShortDesc,
      author: this.author,
      domain: this.domain,
      generation_type: this.generationType,
      categories: this.categories.map((category) => category.toDict()),
    };
  }

  to_payload(): JsonObject {
    return this.toPayload();
  }
}

export interface CreateRunRequestInit {
  runName?: string;
  run_name?: string;
  runType?: string;
  run_type?: string;
  apiKey?: string;
  api_key?: string;
  modelName?: string;
  model_name?: string;
  provider: string;
}

export class CreateRunRequest {
  readonly runName: string;
  readonly runType: string;
  readonly apiKey: string;
  readonly modelName: string;
  readonly provider: string;

  constructor(input: CreateRunRequestInit) {
    const runName = input.runName ?? input.run_name;
    const runType = input.runType ?? input.run_type;
    const apiKey = input.apiKey ?? input.api_key;
    const modelName = input.modelName ?? input.model_name;

    if (runName === undefined) {
      throw new ValueError('run_name is required');
    }
    if (runType === undefined) {
      throw new ValueError('run_type is required');
    }
    if (apiKey === undefined) {
      throw new ValueError('api_key is required');
    }
    if (modelName === undefined) {
      throw new ValueError('model_name is required');
    }

    this.runName = runName;
    this.runType = runType;
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.provider = input.provider;
  }

  toPayload(): JsonObject {
    return {
      run_name: this.runName,
      run_type: this.runType,
      api_key: this.apiKey,
      model_name: this.modelName,
      provider: this.provider,
    };
  }

  to_payload(): JsonObject {
    return this.toPayload();
  }
}

export interface MetricEvaluationInit {
  metricName?: string | OutputValidationMetric;
  metric_name?: string | OutputValidationMetric;
  category: string | PromptPackOutputValidationCategory;
}

export class MetricEvaluation {
  readonly metricName: string;
  readonly category: string;

  constructor(input: MetricEvaluationInit) {
    const metricName = input.metricName ?? input.metric_name;
    if (metricName === undefined) {
      throw new ValueError('metric_name is required');
    }

    this.metricName = metricName;
    this.category = input.category;
  }

  toDict(): JsonObject {
    return {
      metric_name: this.metricName,
      category: this.category,
    };
  }

  to_dict(): JsonObject {
    return this.toDict();
  }
}

export interface PromptPackOutputValidationRequestInit {
  promptPackOutputValidationRunName?: string;
  prompt_pack_output_validation_run_name?: string;
  metricEvaluations?: (MetricEvaluation | MetricEvaluationInit)[];
  metric_evaluations?: (MetricEvaluation | MetricEvaluationInit)[];
}

export class PromptPackOutputValidationRequest {
  readonly promptPackOutputValidationRunName: string;
  readonly metricEvaluations: readonly MetricEvaluation[];

  constructor(input: PromptPackOutputValidationRequestInit) {
    const runName =
      input.promptPackOutputValidationRunName ?? input.prompt_pack_output_validation_run_name;
    const metricEvaluations = input.metricEvaluations ?? input.metric_evaluations;

    if (runName === undefined) {
      throw new ValueError('prompt_pack_output_validation_run_name is required');
    }
    if (metricEvaluations === undefined) {
      throw new ValueError('metric_evaluations is required');
    }

    this.promptPackOutputValidationRunName = runName;
    this.metricEvaluations = metricEvaluations.map((metric) =>
      metric instanceof MetricEvaluation ? metric : new MetricEvaluation(metric),
    );
  }

  toPayload(): JsonObject {
    return {
      prompt_pack_output_validation_run_name: this.promptPackOutputValidationRunName,
      metric_evaluations: this.metricEvaluations.map((metric) => metric.toDict()),
    };
  }

  to_payload(): JsonObject {
    return this.toPayload();
  }
}

export interface CreateOutputValidationRequestInit {
  validationType?: string;
  validation_type?: string;
  metrics?: string[];
}

export class CreateOutputValidationRequest {
  readonly validationType: string;
  readonly metrics: readonly string[];

  constructor(input: CreateOutputValidationRequestInit) {
    this.validationType = input.validationType ?? input.validation_type ?? '';
    this.metrics = input.metrics ?? [];
  }

  toPayload(): JsonObject {
    const runName = this.validationType.length > 0 ? this.validationType : 'Validation';
    return new PromptPackOutputValidationRequest({
      promptPackOutputValidationRunName: runName,
      metricEvaluations: this.metrics.map((metric) => ({
        metricName: metric,
        category: PromptPackOutputValidationCategory.OutputValidation,
      })),
    }).toPayload();
  }

  to_payload(): JsonObject {
    return this.toPayload();
  }
}

export interface PaginationParamsInit {
  limit?: number;
  offset?: number;
}

export class PaginationParams {
  readonly limit: number;
  readonly offset: number;

  constructor(input: PaginationParamsInit = {}) {
    this.limit = input.limit ?? 10;
    this.offset = input.offset ?? 0;
  }

  toQueryParams(): QueryParams {
    return {
      limit: String(this.limit),
      offset: String(this.offset),
    };
  }

  to_query_params(): QueryParams {
    return this.toQueryParams();
  }
}

export interface PayloadModel {
  toPayload(): JsonObject;
}

export type GeneratePromptPackInput = GeneratePromptPackRequest | GeneratePromptPackRequestInit;
export type CreateRunInput = CreateRunRequest | CreateRunRequestInit;
export type PromptPackOutputValidationInput =
  | PromptPackOutputValidationRequest
  | PromptPackOutputValidationRequestInit
  | CreateOutputValidationRequest
  | CreateOutputValidationRequestInit;
export type PaginationInput = PaginationParams | PaginationParamsInit;

export function toGeneratePromptPackRequest(
  input: GeneratePromptPackInput,
): GeneratePromptPackRequest {
  return input instanceof GeneratePromptPackRequest ? input : new GeneratePromptPackRequest(input);
}

export function toCreateRunRequest(input: CreateRunInput): CreateRunRequest {
  return input instanceof CreateRunRequest ? input : new CreateRunRequest(input);
}

export function toPromptPackOutputValidationRequest(
  input: PromptPackOutputValidationInput,
): PayloadModel {
  if (
    input instanceof PromptPackOutputValidationRequest ||
    input instanceof CreateOutputValidationRequest
  ) {
    return input;
  }

  if (isCreateOutputValidationRequestInit(input)) {
    return new CreateOutputValidationRequest(input);
  }

  return new PromptPackOutputValidationRequest(input);
}

export function toPaginationParams(input?: PaginationInput | null): PaginationParams {
  if (input === undefined || input === null) {
    return new PaginationParams();
  }
  return input instanceof PaginationParams ? input : new PaginationParams(input);
}

function isCreateOutputValidationRequestInit(
  input: PromptPackOutputValidationRequestInit | CreateOutputValidationRequestInit,
): input is CreateOutputValidationRequestInit {
  return 'metrics' in input || 'validationType' in input || 'validation_type' in input;
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
