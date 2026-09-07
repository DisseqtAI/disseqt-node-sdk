import { describe, expect, it } from 'vitest';

import {
  CreateOutputValidationRequest,
  CreateRunRequest,
  GeneratePromptPackRequest,
  MetricEvaluation,
  OutputValidationMetric,
  PaginationParams,
  PromptPackCategory,
  PromptPackOutputValidationCategory,
  PromptPackOutputValidationRequest,
} from '../../src/index.js';

describe('Prompt Packs models', () => {
  it('serializes prompt pack categories with Python wire keys', () => {
    const category = new PromptPackCategory({
      main_category: 'reliability_and_safety',
      subcategory: 'hate_speech',
      prompts_count: 5,
    });

    expect(category.to_dict()).toEqual({
      main_category: 'reliability_and_safety',
      subcategory: 'hate_speech',
      prompts_count: 5,
    });
  });

  it('serializes generate prompt pack requests without organization_id', () => {
    const request = new GeneratePromptPackRequest({
      packName: 'Security Pack',
      packShortDesc: 'AI-generated prompts for security testing',
      author: 'AI Generator',
      domain: 'Security',
      generationType: 'AI',
      categories: [
        {
          mainCategory: 'reliability_and_safety',
          subcategory: 'hate_speech',
          promptsCount: 5,
        },
        {
          main_category: 'privacy_and_security',
          subcategory: 'pii_handling',
          prompts_count: 3,
        },
      ],
    });

    expect(request.to_payload()).toEqual({
      pack_name: 'Security Pack',
      pack_short_desc: 'AI-generated prompts for security testing',
      author: 'AI Generator',
      domain: 'Security',
      generation_type: 'AI',
      categories: [
        {
          main_category: 'reliability_and_safety',
          subcategory: 'hate_speech',
          prompts_count: 5,
        },
        {
          main_category: 'privacy_and_security',
          subcategory: 'pii_handling',
          prompts_count: 3,
        },
      ],
    });
    expect(request.toPayload()).not.toHaveProperty('organization_id');
  });

  it('serializes create run requests without project_id or organization_id', () => {
    // run_name is sent as "prompt_pack_run_name" -- the only key the
    // backend's PromptPackRunRequest actually binds for a run's display
    // name; "run_name" itself must be ABSENT, the backend never reads it.
    // run_type must also be ABSENT: the backend has no matching field at
    // all and always computes its own run type server-side. run_type is
    // still required as a *constructor* argument below (kept so no
    // existing caller breaks) even though it reaches nothing on the wire.
    const request = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });

    expect(request.toPayload()).toEqual({
      prompt_pack_run_name: 'Test Run',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });
    expect(request.toPayload()).not.toHaveProperty('run_name');
    expect(request.toPayload()).not.toHaveProperty('run_type');
    expect(request.toPayload()).not.toHaveProperty('project_id');
    expect(request.toPayload()).not.toHaveProperty('organization_id');
  });

  it('load-bearing: run_name and run_type wire keys are genuinely absent, not merely unequal', () => {
    // Proves the two keys the backend never binds are absent from both the
    // object and its serialized form. A regression that re-adds either key
    // under its wrong name would fail this even if every other assertion
    // in this file kept passing.
    const payload = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    }).toPayload();
    const serialized = JSON.stringify(payload);

    expect(payload).not.toHaveProperty('run_name');
    expect(serialized).not.toContain('"run_name"');
    expect(payload).not.toHaveProperty('run_type');
    expect(serialized).not.toContain('"run_type"');
  });

  it('serializes create run requests without application_id when unset -- byte-identical to before the field existed', () => {
    // This is the CORRECTED expected payload (prompt_pack_run_name, no
    // run_type) following the run_name/run_type wire-key fix -- rewritten
    // deliberately to the new correct shape, not merely edited to match
    // whatever toPayload() currently emits. It still asserts an exact key
    // set: a regression that adds run_name/run_type back, or drops a real
    // field, fails this equality check.
    const request = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });

    const payload = request.toPayload();
    expect(payload).toEqual({
      prompt_pack_run_name: 'Test Run',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });
    expect(payload).not.toHaveProperty('application_id');
    expect(JSON.stringify(payload)).not.toContain('application_id');
  });

  it('includes application_id in the payload when set, accepting either spelling', () => {
    const camelCase = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
      applicationId: 'app-123',
    });
    expect(camelCase.toPayload().application_id).toBe('app-123');

    const snakeCase = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
      application_id: 'app-456',
    });
    expect(snakeCase.toPayload().application_id).toBe('app-456');
  });

  it('serializes metric evaluations and output validation requests', () => {
    const metric = new MetricEvaluation({
      metricName: OutputValidationMetric.Toxicity,
      category: PromptPackOutputValidationCategory.OutputValidation,
    });
    const request = new PromptPackOutputValidationRequest({
      prompt_pack_output_validation_run_name: 'SDK Test Validation',
      metric_evaluations: [
        metric,
        {
          metric_name: OutputValidationMetric.HateSpeech,
          category: PromptPackOutputValidationCategory.OutputValidation,
        },
      ],
    });

    expect(metric.to_dict()).toEqual({
      metric_name: 'toxicity',
      category: 'output-validation',
    });
    expect(request.to_payload()).toEqual({
      prompt_pack_output_validation_run_name: 'SDK Test Validation',
      metric_evaluations: [
        { metric_name: 'toxicity', category: 'output-validation' },
        { metric_name: 'hate-speech', category: 'output-validation' },
      ],
    });
  });

  it('keeps deprecated output validation request compatible with the new API shape', () => {
    const request = new CreateOutputValidationRequest({
      validation_type: 'automated',
      metrics: ['toxicity', 'bias'],
    });

    expect(request.toPayload()).toEqual({
      prompt_pack_output_validation_run_name: 'automated',
      metric_evaluations: [
        { metric_name: 'toxicity', category: 'output-validation' },
        { metric_name: 'bias', category: 'output-validation' },
      ],
    });
  });

  it('serializes pagination defaults and custom values as query strings', () => {
    expect(new PaginationParams().to_query_params()).toEqual({
      limit: '10',
      offset: '0',
    });
    expect(new PaginationParams({ limit: 25, offset: 50 }).toQueryParams()).toEqual({
      limit: '25',
      offset: '50',
    });
  });
});
