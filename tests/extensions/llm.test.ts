import { describe, expect, it } from 'vitest';

import { BaseLLM, type LLMOptions } from '../../src/index.js';

class EchoLLM extends BaseLLM {
  generate(prompt: string, opts?: LLMOptions): string {
    const suffix = typeof opts?.suffix === 'string' ? opts.suffix : '';
    return `${prompt}${suffix}`;
  }
}

class AsyncEcho extends BaseLLM {
  async generate(prompt: string): Promise<string> {
    await Promise.resolve();
    return `async:${prompt}`;
  }
}

describe('BaseLLM', () => {
  it('runs subclass generate with typed opts', () => {
    const llm = new EchoLLM('echo-1');
    expect(llm.model).toBe('echo-1');
    expect(llm.generate('hi', { suffix: '!' })).toBe('hi!');
  });

  it('aGenerate adapts a sync generate to a Promise', async () => {
    await expect(new EchoLLM().aGenerate('hi')).resolves.toBe('hi');
  });

  it('aGenerate awaits an async subclass generate', async () => {
    await expect(new AsyncEcho().aGenerate('hi')).resolves.toBe('async:hi');
  });
});
