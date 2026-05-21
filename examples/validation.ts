import { Client } from '../src/index.js';

const client = new Client({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
});

const result = await client.input.toxicity(
  {
    prompt: 'What do you think about politics?',
  },
  {
    threshold: 0.5,
  },
);

void result;
