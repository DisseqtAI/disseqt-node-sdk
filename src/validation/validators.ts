import type { JsonObject } from '../http/types.js';
import { Composite, ThemesClassifier, ValidatorDomain } from './enums.js';
import {
  AgenticBehaviourRequest,
  CompositeScoreRequest,
  InputValidationRequest,
  McpSecurityRequest,
  OutputValidationRequest,
  RagGroundingRequest,
  SDKConfigInput,
  ThemesClassifierRequest,
  type AgenticBehaviourRequestInit,
  type AnyValidationPayload,
  type CompositeScoreRequestInit,
  type InputValidationRequestInit,
  type LlmTextFieldsInit,
  type SDKConfigInputInit,
  type ThemesClassifierRequestInit,
  type ValidationPayload,
} from './models.js';

export const DEFAULT_VALIDATOR_PATH_TEMPLATE = '/api/v1/sdk/validators/{domain}/{validator}';
export const COMPOSITE_VALIDATOR_PATH_TEMPLATE = '/api/v1/validators/{domain}/{validator}';

export interface Validatable {
  readonly domain: ValidatorDomain;
  readonly slug: string;
  readonly pathTemplate: string;
  toPayload(): AnyValidationPayload;
}

export interface BaseValidatorInit<TData> {
  slug: string;
  data: TData;
  config: SDKConfigInput | SDKConfigInputInit;
  pathTemplate?: string;
}

export abstract class BaseValidator<TData> implements Validatable {
  abstract readonly domain: ValidatorDomain;

  readonly slug: string;
  readonly data: TData;
  readonly config: SDKConfigInput;
  readonly pathTemplate: string;

  protected constructor(input: BaseValidatorInit<TData>) {
    this.slug = input.slug;
    this.data = input.data;
    this.config =
      input.config instanceof SDKConfigInput ? input.config : new SDKConfigInput(input.config);
    this.pathTemplate = input.pathTemplate ?? DEFAULT_VALIDATOR_PATH_TEMPLATE;
  }

  toPayload(): ValidationPayload {
    return {
      input_data: toInputData(this.data),
      config_input: this.config.toDict(),
    };
  }
}

export class InputValidator extends BaseValidator<InputValidationRequest> {
  readonly domain = ValidatorDomain.InputValidation;

  constructor(input: BaseValidatorInit<InputValidationRequest | InputValidationRequestInit>) {
    super({
      ...input,
      data:
        input.data instanceof InputValidationRequest
          ? input.data
          : new InputValidationRequest(input.data),
    });
  }
}

export class OutputValidator extends BaseValidator<OutputValidationRequest> {
  readonly domain = ValidatorDomain.OutputValidation;

  constructor(input: BaseValidatorInit<OutputValidationRequest | LlmTextFieldsInit>) {
    super({
      ...input,
      data:
        input.data instanceof OutputValidationRequest
          ? input.data
          : new OutputValidationRequest(input.data),
    });
  }
}

export class RagGroundingValidator extends BaseValidator<RagGroundingRequest> {
  readonly domain = ValidatorDomain.RagGrounding;

  constructor(input: BaseValidatorInit<RagGroundingRequest | LlmTextFieldsInit>) {
    super({
      ...input,
      data:
        input.data instanceof RagGroundingRequest
          ? input.data
          : new RagGroundingRequest(input.data),
    });
  }
}

export class AgenticBehaviourValidator extends BaseValidator<AgenticBehaviourRequest> {
  readonly domain = ValidatorDomain.AgenticBehavior;

  constructor(input: BaseValidatorInit<AgenticBehaviourRequest | AgenticBehaviourRequestInit>) {
    super({
      ...input,
      data:
        input.data instanceof AgenticBehaviourRequest
          ? input.data
          : new AgenticBehaviourRequest(input.data),
    });
  }
}

export class McpSecurityValidator extends BaseValidator<McpSecurityRequest> {
  readonly domain = ValidatorDomain.McpSecurity;

  constructor(input: BaseValidatorInit<McpSecurityRequest | LlmTextFieldsInit>) {
    super({
      ...input,
      data:
        input.data instanceof McpSecurityRequest ? input.data : new McpSecurityRequest(input.data),
    });
  }
}

export class ClassifyValidator implements Validatable {
  readonly domain = ValidatorDomain.ThemesClassifier;
  readonly slug = ThemesClassifier.Classify;
  readonly pathTemplate = DEFAULT_VALIDATOR_PATH_TEMPLATE;
  readonly data: ThemesClassifierRequest;

  constructor(input: { data: ThemesClassifierRequest | ThemesClassifierRequestInit }) {
    this.data =
      input.data instanceof ThemesClassifierRequest
        ? input.data
        : new ThemesClassifierRequest(input.data);
  }

  toPayload(): JsonObject {
    return { input_data: this.data.toInputData() };
  }
}

export class CompositeScoreEvaluator implements Validatable {
  readonly domain = ValidatorDomain.Composite;
  readonly slug = Composite.Evaluate;
  readonly pathTemplate = COMPOSITE_VALIDATOR_PATH_TEMPLATE;
  readonly data: CompositeScoreRequest;

  constructor(input: { data: CompositeScoreRequest | CompositeScoreRequestInit }) {
    this.data =
      input.data instanceof CompositeScoreRequest
        ? input.data
        : new CompositeScoreRequest(input.data);
  }

  toPayload(): JsonObject {
    return this.data.toInputData();
  }
}

export interface GenericValidationRequest {
  domain: ValidatorDomain;
  slug: string;
  data:
    | InputValidationRequest
    | OutputValidationRequest
    | RagGroundingRequest
    | AgenticBehaviourRequest
    | McpSecurityRequest
    | ThemesClassifierRequest
    | CompositeScoreRequest
    | JsonObject;
  config?: SDKConfigInput | SDKConfigInputInit;
  pathTemplate?: string;
}

export function toValidatable(request: Validatable | GenericValidationRequest): Validatable {
  if (isValidatable(request)) {
    return request;
  }

  if (request.domain === ValidatorDomain.Composite) {
    return new CompositeScoreEvaluator({
      data:
        request.data instanceof CompositeScoreRequest
          ? request.data
          : new CompositeScoreRequest(request.data as CompositeScoreRequestInit),
    });
  }

  if (request.domain === ValidatorDomain.ThemesClassifier) {
    return new ClassifyValidator({
      data:
        request.data instanceof ThemesClassifierRequest
          ? request.data
          : new ThemesClassifierRequest(request.data as unknown as ThemesClassifierRequestInit),
    });
  }

  if (request.config === undefined) {
    throw new ValueError('config is required for standard validators');
  }

  return {
    domain: request.domain,
    slug: request.slug,
    pathTemplate: request.pathTemplate ?? DEFAULT_VALIDATOR_PATH_TEMPLATE,
    toPayload: () => ({
      input_data: toInputData(request.data),
      config_input:
        request.config instanceof SDKConfigInput
          ? request.config.toDict()
          : new SDKConfigInput(request.config as SDKConfigInputInit).toDict(),
    }),
  };
}

export function isValidatable(value: unknown): value is Validatable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'domain' in value &&
    'slug' in value &&
    'pathTemplate' in value &&
    'toPayload' in value &&
    typeof (value as { toPayload: unknown }).toPayload === 'function'
  );
}

function toInputData(data: unknown): JsonObject {
  if (hasToInputData(data)) {
    return data.toInputData();
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data as JsonObject;
  }
  throw new TypeError('validator data must be an object or request model');
}

function hasToInputData(value: unknown): value is { toInputData(): JsonObject } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toInputData' in value &&
    typeof (value as { toInputData: unknown }).toInputData === 'function'
  );
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
