// User-extendable LLM provider (client-side judge plug-point). Implement `generate`;
// `aGenerate` (Python `a_generate`) is optional.

export type LLMOptions = Record<string, unknown>;

export abstract class BaseLLM {
  /** Provider/model identifier. Subclasses set this at construction time. */
  readonly model: string;

  constructor(model = '') {
    this.model = model;
  }

  /** Generate a completion for `prompt`. Sync or async. */
  abstract generate(prompt: string, opts?: LLMOptions): string | Promise<string>;

  /** Async generate; defaults to wrapping `generate`. Override for true async. */
  aGenerate(prompt: string, opts?: LLMOptions): Promise<string> {
    return Promise.resolve(this.generate(prompt, opts));
  }
}
