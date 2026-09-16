// User-extendable LLM provider — client-side judge model plug-point.
// Subclasses implement `generate` and optionally `aGenerate` (Python's
// `a_generate`; camelCase here to match Node conventions).
// Kept as an abstract class so subclasses manage their own state
// (auth clients, connection pools, etc.).

export type LLMOptions = Record<string, unknown>;

export abstract class BaseLLM {
  /** Provider/model identifier. Subclasses set this at construction time. */
  readonly model: string;

  constructor(model = '') {
    this.model = model;
  }

  /** Generate a completion for `prompt`. Sync or async. */
  abstract generate(prompt: string, opts?: LLMOptions): string | Promise<string>;

  /**
   * Async generate. Default: adapts `generate` via `Promise.resolve`, which
   * handles both sync and async subclass returns. Subclasses override for
   * true async when the underlying provider supports it (Python parity:
   * `a_generate`).
   */
  aGenerate(prompt: string, opts?: LLMOptions): Promise<string> {
    return Promise.resolve(this.generate(prompt, opts));
  }
}
