import { describe, expect, it } from 'vitest';

import {
  AGENTIC_DEFAULT_ENDPOINT,
  PROMPT_PACKS_PATH_PREFIX,
  VALIDATION_PATH_TEMPLATE,
} from '../src/index.js';

describe('package scaffold', () => {
  it('exports core endpoint constants', () => {
    expect(VALIDATION_PATH_TEMPLATE).toBe('/api/v1/sdk/validators/{domain}/{validator}');
    expect(PROMPT_PACKS_PATH_PREFIX).toBe('/sdk/prompt-packs/api/v1/sdk/prompt-packs');
    expect(AGENTIC_DEFAULT_ENDPOINT).toContain('/agentic-monitoring/api/v1/traces');
  });
});
