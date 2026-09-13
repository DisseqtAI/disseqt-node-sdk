/**
 * `Guardrails` — thin orchestrator that runs a fixed set of realtime
 * policies against inputs and outputs, collapses them into a single
 * BLOCK/PASS verdict, and (optionally) throws on block.
 *
 * Sits on top of `Client.validate(..., { policies: [...] })` — every
 * policy id is one server-side evaluation, the server does all the
 * decision-strategy work, and this class just fans out to the client and
 * collates. Mirrors the Python SDK's `Guardrails` class (Phase 2a in the
 * DeepTeam parity plan).
 *
 * ```ts
 * const gr = new Guardrails({
 *   client,
 *   inputGuards: ['toxicity-input-v1', 'prompt-injection-v1'],
 *   outputGuards: ['toxicity-output-v1', 'pii-leak-v1'],
 * });
 *
 * const inputResult = await gr.guardInput({ prompt: userPrompt });
 * if (inputResult.breached) return refusal();
 *
 * const modelOutput = await callLLM(userPrompt);
 * const outputResult = await gr.guardOutput({ prompt: userPrompt, response: modelOutput });
 * if (outputResult.breached) return refusal();
 * ```
 */

import type { JsonObject } from '../http/types.js';
import type { Client, PolicyValidationResult } from './client.js';
import { BlockedError } from './errors.js';
import {
  InputValidationRequest,
  type InputValidationRequestInit,
  type LlmTextFieldsInit,
  OutputValidationRequest,
} from './models.js';
import { anyBlocking, parsePolicy, type PolicyDecision } from './policy.js';

export interface GuardrailsConfig {
  /** Client used to reach the realtime-policy evaluate endpoint. */
  client: Client;
  /** Policy ids applied to `guardInput()`. */
  inputGuards?: readonly string[];
  /** Policy ids applied to `guardOutput()`. */
  outputGuards?: readonly string[];
  /**
   * Reserved for wire-forward parity with the Python SDK and DeepTeam.
   * Not consumed client-side — policy-level judge-model selection is a
   * server-side RuntimePolicy attribute. Kept so the ctor kwarg list
   * matches Python's `Guardrails(evaluation_model=..., sample_rate=...)`.
   */
  evaluationModel?: string;
  /**
   * Reserved for wire-forward parity with the Python SDK. Server-side
   * sampling is enforced by `policyeval.Strategy.SampleRate` in
   * llm-monitoring (Phase 2c, commit 9ad688d) — this client-side value is
   * carried on the instance for observability/logging only.
   */
  sampleRate?: number;
}

/** Structured verdict returned by `guardInput` / `guardOutput`. */
export interface GuardResult {
  /** True when at least one policy decided BLOCK. */
  readonly breached: boolean;
  /** Parsed per-policy decisions (drops any envelope with no policy_id). */
  readonly decisions: readonly PolicyDecision[];
  /**
   * The raw `{ validation, policies }` envelope from `client.validate()`.
   * Kept so callers can log the exact response or feed it back into
   * `parsePolicy()` / `anyBlocking()` for custom analytics.
   */
  readonly raw: PolicyValidationResult;
  /**
   * Wall-clock latency of the underlying `client.validate()` call, in
   * milliseconds. Useful for SLO dashboards on the guard fan-out itself.
   */
  readonly latencyMs: number;
  /** Python-SDK parity alias — mirrors `breached`. */
  readonly blocked: boolean;
  /** Python-SDK parity alias — mirrors `decisions`. */
  readonly policy_envelopes: readonly PolicyDecision[];
}

export interface GuardInputOptions {
  /**
   * When true, throw `BlockedError` on breach instead of returning a
   * `GuardResult` — the "fail-closed" mode. Callers that prefer a truthy
   * check over exception flow leave this false (default).
   */
  raiseOnBlock?: boolean;
}

export type GuardOutputOptions = GuardInputOptions;

export class Guardrails {
  private readonly client: Client;
  private readonly inputGuards: readonly string[];
  private readonly outputGuards: readonly string[];
  /** Reserved parity kwarg — see {@link GuardrailsConfig.evaluationModel}. */
  readonly evaluationModel: string;
  /** Reserved parity kwarg — see {@link GuardrailsConfig.sampleRate}. */
  readonly sampleRate: number;

  constructor(config: GuardrailsConfig) {
    this.client = config.client;
    this.inputGuards = normalize(config.inputGuards);
    this.outputGuards = normalize(config.outputGuards);
    this.evaluationModel = config.evaluationModel ?? 'gpt-4.1';
    const rate = config.sampleRate ?? 1.0;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1) {
      throw new ValueError(
        `sampleRate must be a number in (0, 1] (got ${JSON.stringify(config.sampleRate)})`,
      );
    }
    this.sampleRate = rate;
  }

  /**
   * Run every input guard against `input` and return the aggregated
   * verdict. When no input guards are configured, returns a vacuous PASS
   * (no network call). `input` accepts either a plain `{ prompt, ... }`
   * init object or a fully-constructed `InputValidationRequest`.
   */
  async guardInput(
    input: InputValidationRequest | InputValidationRequestInit,
    options?: GuardInputOptions,
  ): Promise<GuardResult> {
    if (this.inputGuards.length === 0) {
      return vacuous();
    }
    const request =
      input instanceof InputValidationRequest ? input : new InputValidationRequest(input);
    return this.runGuards(request, this.inputGuards, options);
  }

  /**
   * Run every output guard against `input`+`output` and return the
   * aggregated verdict. When no output guards are configured, returns a
   * vacuous PASS (no network call). Both fields land in the standard
   * `input_data` shape so output-facing policies (PII leak, factual
   * consistency, tone, …) can see the model's response and the prompt
   * that produced it.
   */
  async guardOutput(
    fields: OutputValidationRequest | LlmTextFieldsInit,
    options?: GuardOutputOptions,
  ): Promise<GuardResult> {
    if (this.outputGuards.length === 0) {
      return vacuous();
    }
    const request =
      fields instanceof OutputValidationRequest ? fields : new OutputValidationRequest(fields);
    return this.runGuards(request, this.outputGuards, options);
  }

  // Python-flavored aliases so mixed-language teams reading each other's
  // code find the same names. Keeps `guard_input` / `guard_output`
  // one-liners; new code should prefer the camelCase forms.
  guard_input = this.guardInput.bind(this);
  guard_output = this.guardOutput.bind(this);

  private async runGuards(
    request: InputValidationRequest | OutputValidationRequest,
    policyIds: readonly string[],
    options: GuardInputOptions | undefined,
  ): Promise<GuardResult> {
    const started = performanceNow();
    const raw = (await this.client.validate(request, {
      policies: policyIds,
    })) as PolicyValidationResult;
    const latencyMs = Math.round(performanceNow() - started);
    const breached = anyBlocking(raw);
    const decisions = extractDecisions(raw);
    const result: GuardResult = {
      breached,
      decisions,
      raw,
      latencyMs,
      blocked: breached,
      policy_envelopes: decisions,
    };
    if (breached && options?.raiseOnBlock === true) {
      throw new BlockedError('realtime policy guardrail breached — call blocked', raw, 'block');
    }
    return result;
  }
}

function normalize(ids: readonly string[] | undefined): readonly string[] {
  if (ids === undefined) {
    return [];
  }
  const copied = [...ids];
  if (copied.length === 0) {
    return [];
  }
  if (!copied.every((id) => typeof id === 'string' && id.trim().length > 0)) {
    throw new ValueError(
      `Guardrails guard ids must be non-blank strings (got ${JSON.stringify(copied)})`,
    );
  }
  return copied;
}

function extractDecisions(raw: PolicyValidationResult): PolicyDecision[] {
  const out: PolicyDecision[] = [];
  for (const envelope of raw.policies) {
    const decision = parsePolicy(envelope as JsonObject);
    if (decision !== null) {
      out.push(decision);
    }
  }
  return out;
}

function vacuous(): GuardResult {
  return {
    breached: false,
    decisions: [],
    raw: { validation: null, policies: [] },
    latencyMs: 0,
    blocked: false,
    policy_envelopes: [],
  };
}

// Node 18+ ships `performance.now()` on the global; the tiny wrapper keeps
// the call site testable without pulling perf_hooks into the bundle.
function performanceNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
