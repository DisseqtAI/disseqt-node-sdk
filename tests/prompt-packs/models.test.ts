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
    const request = new CreateRunRequest({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });

    expect(request.toPayload()).toEqual({
      run_name: 'Test Run',
      run_type: 'evaluation',
      api_key: 'llm-api-key',
      model_name: 'gpt-4',
      provider: 'openai',
    });
    expect(request.toPayload()).not.toHaveProperty('project_id');
    expect(request.toPayload()).not.toHaveProperty('organization_id');
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
