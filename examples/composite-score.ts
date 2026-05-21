import { Client } from '../src/index.js';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const result = await client.composite.evaluate({
  llmInputQuery: 'What is the capital of France?',
  llmOutput: 'The capital of France is Paris.',
  evaluationMode: 'binary_threshold',
});

void result;
