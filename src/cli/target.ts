import { existsSync, readFileSync } from 'node:fs';

import type { Command } from 'commander';

import type { JsonObject } from '../http/types.js';
import { EXIT_USAGE } from './config.js';

// Shared target selection for every red-team entry point (redteam-sdk-plan.md "Target selection").

export interface TargetFlags {
  app?: string;
  integration?: string;
  endpoint?: string;
  target?: string;
}

export type Target =
  | { kind: 'app'; id: string }
  | { kind: 'integration'; id: string }
  | { kind: 'endpoint'; url: string }
  | { kind: 'template'; template: JsonObject };

/** single = URL endpoint; multi = `--endpoint` / `--target` carry the legacy app_integration_template. */
export type TargetMode = 'single' | 'multi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMPLATE_KEYS = ['name', 'base_url', 'integration_type', 'send_step'];

export const usage = (msg: string): never => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(EXIT_USAGE);
};

export const isUuid = (v: string): boolean => UUID_RE.test(v.trim());

/** Adds `--app` / `--integration` / `--endpoint <url>`, plus `--target` when the command had it before. */
export function targetOptions(cmd: Command, legacyTargetHelp?: string): Command {
  const out = cmd
    .option('--app <application_id>', 'AI System (application) id; its linked integration is used')
    .option('--integration <app_integration_id>', 'app integration id')
    .option('--endpoint <url>', 'target endpoint URL');
  return legacyTargetHelp === undefined ? out : out.option('--target <id>', legacyTargetHelp);
}

export const warnTargetDeprecated = (): void => {
  process.stderr.write('warning: --target is deprecated; use --app, --integration or --endpoint\n');
};

/** Parse a JSON literal, `@file`, or plain file path into an object. */
export function readJsonArg(value: string): JsonObject {
  const trimmed = value.trim();
  let raw = trimmed;
  if (trimmed.startsWith('@')) raw = readFileSync(trimmed.slice(1), 'utf-8');
  else if (!trimmed.startsWith('{') && existsSync(trimmed)) raw = readFileSync(trimmed, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return usage(`expected a JSON object, @file, or file path (got "${value.slice(0, 60)}")`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return usage('template must be a JSON object');
  }
  return parsed as JsonObject;
}

function toTemplate(value: string): Target {
  const template = readJsonArg(value);
  const missing = TEMPLATE_KEYS.filter((k) => !(k in template));
  if (missing.length > 0) usage(`template is missing ${missing.join(', ')}`);
  return { kind: 'template', template };
}

function fromDeprecatedTarget(value: string, mode: TargetMode): Target {
  warnTargetDeprecated();
  if (isUuid(value)) return { kind: 'app', id: value.trim() };
  // Single-turn always took an application id here; multi-turn took the template.
  return mode === 'multi' ? toTemplate(value) : { kind: 'app', id: value.trim() };
}

/** Exactly one target or exit 2. */
export const requireTarget = (flags: TargetFlags, mode: TargetMode): Target =>
  resolveTarget(flags, mode, true) ?? usage('pass exactly one of --app, --integration, --endpoint');

/** At most one target (exactly one when `required`); exits 2 otherwise. */
export function resolveTarget(
  flags: TargetFlags,
  mode: TargetMode,
  required: boolean,
): Target | null {
  const given = (['app', 'integration', 'endpoint', 'target'] as const).filter(
    (k) => flags[k] !== undefined,
  );
  if (given.length > 1 || (required && given.length === 0)) {
    usage('pass exactly one of --app, --integration, --endpoint');
  }
  if (flags.app !== undefined) {
    if (!isUuid(flags.app)) usage(`--app must be a UUID (got "${flags.app}")`);
    return { kind: 'app', id: flags.app.trim() };
  }
  if (flags.integration !== undefined) {
    if (!isUuid(flags.integration))
      usage(`--integration must be a UUID (got "${flags.integration}")`);
    return { kind: 'integration', id: flags.integration.trim() };
  }
  if (flags.endpoint !== undefined) {
    return mode === 'multi'
      ? toTemplate(flags.endpoint)
      : { kind: 'endpoint', url: flags.endpoint };
  }
  if (flags.target !== undefined) return fromDeprecatedTarget(flags.target, mode);
  return null;
}

/** Single-turn `target_config` and pack-run body fields share the same keys. */
export function targetFields(target: Target): JsonObject {
  switch (target.kind) {
    case 'app':
      return { application_id: target.id };
    case 'integration':
      return { app_integration_id: target.id };
    case 'endpoint':
      return { endpoint_url: target.url };
    case 'template':
      return usage('an app_integration_template is only accepted by multi-turn attacks');
  }
}

/** `TestPlanRunTargetConfig` (api/test_plan_runs_create_types.go). */
export function planRunTarget(target: Target): JsonObject {
  if (target.kind === 'endpoint') return { execution_mode: 'direct', endpoint_url: target.url };
  return { execution_mode: 'app_integration', ...targetFields(target) };
}
