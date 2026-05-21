import {
  DisseqtHttpError,
  DisseqtHttpTransport,
  type DisseqtHttpTransportConfig,
} from '../http/index.js';
import type { DisseqtRequestOptions, JsonObject, QueryParams } from '../http/types.js';
import {
  type CreateRunInput,
  type GeneratePromptPackInput,
  type PaginationInput,
  type PromptPackOutputValidationInput,
  toCreateRunRequest,
  toGeneratePromptPackRequest,
  toPaginationParams,
  toPromptPackOutputValidationRequest,
} from './models.js';

export const PROMPT_PACKS_DEFAULT_BASE_URL = 'http://localhost:8000';
export const PROMPT_PACKS_PATH_PREFIX = '/sdk/prompt-packs/api/v1/sdk/prompt-packs';

export interface DisseqtAPIClientConfig extends DisseqtHttpTransportConfig {
  baseUrl?: string;
  timeout?: number;
}

export class DisseqtAPIClient {
  readonly projectId: string;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;

  private readonly transport: DisseqtHttpTransport;

  constructor(config: DisseqtAPIClientConfig) {
    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? PROMPT_PACKS_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? (config.timeout === undefined ? 30_000 : config.timeout * 1000);

    const transportConfig: DisseqtHttpTransportConfig = {
      apiKey: this.apiKey,
      projectId: this.projectId,
      timeoutMs: this.timeoutMs,
    };
    if (config.fetch !== undefined) {
      transportConfig.fetch = config.fetch;
    }
    this.transport = new DisseqtHttpTransport(transportConfig);
  }

  _buildHeaders(): Record<string, string> {
    return this.transport.buildHeaders();
  }

  _url(path: string): string {
    return `${this.baseUrl}${PROMPT_PACKS_PATH_PREFIX}${path}`;
  }

  async _request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { jsonPayload?: JsonObject; params?: QueryParams } = {},
  ): Promise<JsonObject> {
    const requestOptions: DisseqtRequestOptions = {
      method,
      url: this._url(path),
    };
    if (options.jsonPayload !== undefined) {
      requestOptions.json = options.jsonPayload;
    }
    if (options.params !== undefined) {
      requestOptions.params = options.params;
    }
    return this.transport.requestJson(requestOptions);
  }

  async _getRaw(
    path: string,
    options: { params?: QueryParams } = {},
  ): Promise<{ status: number; headers: Headers; text: string }> {
    const requestOptions: DisseqtRequestOptions = {
      method: 'GET',
      url: this._url(path),
      includeContentType: false,
    };
    if (options.params !== undefined) {
      requestOptions.params = options.params;
    }
    return this.transport.requestRaw(requestOptions);
  }

  async generate_prompt_pack(request: GeneratePromptPackInput): Promise<JsonObject> {
    return this._request('POST', '/generate', {
      jsonPayload: toGeneratePromptPackRequest(request).toPayload(),
    });
  }

  generatePromptPack(request: GeneratePromptPackInput): Promise<JsonObject> {
    return this.generate_prompt_pack(request);
  }

  async download_pack_csv(packId: string): Promise<string | JsonObject> {
    try {
      const response = await this.transport.requestRaw({
        method: 'GET',
        url: this._url(`/${packId}/download`),
        includeContentType: false,
        errorMessage: 'Download pack CSV failed',
      });
      const contentType = (response.headers.get('Content-Type') ?? '')
        .split(';')[0]
        ?.trim()
        .toLowerCase();

      if (contentType?.includes('csv') === true || !response.text.trim().startsWith('{')) {
        return response.text;
      }

      try {
        const parsed = JSON.parse(response.text) as unknown;
        return isJsonObject(parsed) ? parsed : response.text;
      } catch {
        return response.text;
      }
    } catch (error) {
      if (error instanceof DisseqtHttpError && error.statusCode !== 0) {
        const context: { method?: string; url?: string; cause?: unknown } = {
          cause: error.cause,
        };
        if (error.method !== undefined) {
          context.method = error.method;
        }
        if (error.url !== undefined) {
          context.url = error.url;
        }
        throw new DisseqtHttpError(
          error.statusCode,
          'Download pack CSV failed',
          error.responseBody,
          context,
        );
      }
      throw error;
    }
  }

  downloadPackCsv(packId: string): Promise<string | JsonObject> {
    return this.download_pack_csv(packId);
  }

  async create_run(packId: string, request: CreateRunInput): Promise<JsonObject> {
    return this._request('POST', `/${packId}/runs`, {
      jsonPayload: toCreateRunRequest(request).toPayload(),
    });
  }

  createRun(packId: string, request: CreateRunInput): Promise<JsonObject> {
    return this.create_run(packId, request);
  }

  async list_runs(packId: string, pagination?: PaginationInput | null): Promise<JsonObject> {
    return this._request('GET', `/${packId}/runs`, {
      params: toPaginationParams(pagination).toQueryParams(),
    });
  }

  listRuns(packId: string, pagination?: PaginationInput | null): Promise<JsonObject> {
    return this.list_runs(packId, pagination);
  }

  async get_run(
    runId: string,
    options: { includeOutputs?: boolean; include_outputs?: boolean; pagination?: PaginationInput | null } = {},
  ): Promise<JsonObject> {
    const includeOutputs = options.includeOutputs ?? options.include_outputs ?? true;
    return this._request('GET', `/runs/${runId}`, {
      params: {
        ...toPaginationParams(options.pagination).toQueryParams(),
        include_outputs: String(includeOutputs).toLowerCase(),
      },
    });
  }

  getRun(
    runId: string,
    options: { includeOutputs?: boolean; include_outputs?: boolean; pagination?: PaginationInput | null } = {},
  ): Promise<JsonObject> {
    return this.get_run(runId, options);
  }

  async delete_run(runId: string): Promise<JsonObject> {
    return this._request('DELETE', `/runs/${runId}`);
  }

  deleteRun(runId: string): Promise<JsonObject> {
    return this.delete_run(runId);
  }

  async get_run_outputs(runId: string, pagination?: PaginationInput | null): Promise<JsonObject> {
    return this._request('GET', `/runs/${runId}/outputs`, {
      params: toPaginationParams(pagination).toQueryParams(),
    });
  }

  getRunOutputs(runId: string, pagination?: PaginationInput | null): Promise<JsonObject> {
    return this.get_run_outputs(runId, pagination);
  }

  async get_run_outputs_csv(runId: string): Promise<JsonObject> {
    return this._request('GET', `/runs/${runId}/outputs/csv`);
  }

  getRunOutputsCsv(runId: string): Promise<JsonObject> {
    return this.get_run_outputs_csv(runId);
  }

  async create_output_validation(
    runId: string,
    request: PromptPackOutputValidationInput,
  ): Promise<JsonObject> {
    return this._request('POST', `/runs/${runId}/validate-outputs`, {
      jsonPayload: toPromptPackOutputValidationRequest(request).toPayload(),
    });
  }

  createOutputValidation(
    runId: string,
    request: PromptPackOutputValidationInput,
  ): Promise<JsonObject> {
    return this.create_output_validation(runId, request);
  }

  async list_run_output_validations(runId: string): Promise<JsonObject> {
    return this._request('GET', `/runs/${runId}/output-validations`);
  }

  listRunOutputValidations(runId: string): Promise<JsonObject> {
    return this.list_run_output_validations(runId);
  }

  async get_output_validation(validationId: string): Promise<JsonObject> {
    return this._request('GET', `/output-validations/${validationId}`);
  }

  getOutputValidation(validationId: string): Promise<JsonObject> {
    return this.get_output_validation(validationId);
  }

  async get_output_validation_summary(validationId: string): Promise<JsonObject> {
    return this._request('GET', `/output-validations/${validationId}/summary`);
  }

  getOutputValidationSummary(validationId: string): Promise<JsonObject> {
    return this.get_output_validation_summary(validationId);
  }

  async get_output_validation_results(
    validationId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this._request('GET', `/output-validations/${validationId}/results`, {
      params: toPaginationParams(pagination).toQueryParams(),
    });
  }

  getOutputValidationResults(
    validationId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this.get_output_validation_results(validationId, pagination);
  }

  async get_output_validation_grouped_outputs(
    validationId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this._request('GET', `/output-validations/${validationId}/outputs/grouped`, {
      params: toPaginationParams(pagination).toQueryParams(),
    });
  }

  getOutputValidationGroupedOutputs(
    validationId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this.get_output_validation_grouped_outputs(validationId, pagination);
  }

  async get_output_validation_results_csv(validationId: string): Promise<JsonObject> {
    return this._request('GET', `/output-validations/${validationId}/results/csv`);
  }

  getOutputValidationResultsCsv(validationId: string): Promise<JsonObject> {
    return this.get_output_validation_results_csv(validationId);
  }

  async delete_output_validation(validationId: string): Promise<JsonObject> {
    return this._request('DELETE', `/output-validations/${validationId}`);
  }

  deleteOutputValidation(validationId: string): Promise<JsonObject> {
    return this.delete_output_validation(validationId);
  }

  async list_pack_output_validations(
    packId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this._request('GET', `/${packId}/output-validations`, {
      params: toPaginationParams(pagination).toQueryParams(),
    });
  }

  listPackOutputValidations(
    packId: string,
    pagination?: PaginationInput | null,
  ): Promise<JsonObject> {
    return this.list_pack_output_validations(packId, pagination);
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
