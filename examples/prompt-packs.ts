import {
  DisseqtAPIClient,
  OutputValidationMetric,
  PromptPackOutputValidationCategory,
} from '../src/index.js';

const client = new DisseqtAPIClient({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const pack = await client.generatePromptPack({
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
  ],
});

const packId = String(pack.id ?? pack.pack_id);
const run = await client.createRun(packId, {
  runName: 'SDK Evaluation Run',
  runType: 'evaluation',
  apiKey: 'provider-api-key',
  modelName: 'gpt-4',
  provider: 'openai',
});

await client.createOutputValidation(String(run.id ?? run.run_id), {
  promptPackOutputValidationRunName: 'Safety Validation',
  metricEvaluations: [
    {
      metricName: OutputValidationMetric.Toxicity,
      category: PromptPackOutputValidationCategory.OutputValidation,
    },
  ],
});
