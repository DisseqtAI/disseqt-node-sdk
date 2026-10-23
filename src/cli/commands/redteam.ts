import { readFileSync } from 'node:fs';

import type { Command } from 'commander';
import { load as yamlLoad } from 'js-yaml';

import type { RedteamClient, RedteamValidateRequest } from '../../resources/redteam.js';
import { DisseqtHttpError } from '../../http/errors.js';
import type { JsonObject, JsonValue, QueryParams } from '../../http/types.js';
import { readBody } from '../parse.js';
import { buildClient, emit, pollUntilTerminal, runAction } from '../config.js';
import {
  requireTarget,
  resolveTarget,
  targetFields,
  targetOptions,
  usage,
  type Target,
  type TargetFlags,
  warnTargetDeprecated,
} from '../target.js';

// Bodies mirror dataset-backend Go structs (api/testing_types.go, pkg/testing/pipeline.go,
// api/mr_jailbreak_batch_automation.go, api/testing_bot_*.go, api/vulnerability_types.go).

interface CommonOpts {
  json?: boolean;
}

const commonJson = (cmd: Command): Command => cmd.option('--json', 'emit JSON output', false);

const MAX_TARGET_PROMPTS = 10;
const DEFAULT_MAX_DEPTH = 5;
// 0 = unlimited (pkg/testing/pipeline.go ExecutionConfig).
const DEFAULT_MAX_TOTAL_PROMPTS = 0;

const resolveId = (payload: unknown, ...keys: string[]): string | null => {
  if (payload === null || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const candidates = keys.length > 0 ? keys : ['id', 'job_id', 'run_id', 'session_id'];
  for (const key of candidates) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return null;
};

const readJsonFile = (path: string): JsonObject => {
  const raw = readFileSync(path, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: top-level must be a JSON object`);
  }
  return parsed as JsonObject;
};

const readYamlFile = (path: string): JsonObject => {
  const raw = readFileSync(path, 'utf-8');
  const parsed = yamlLoad(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: top-level must be a mapping`);
  }
  return parsed as JsonObject;
};

const expandEnv = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => process.env[name] ?? '');
  }
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, expandEnv(v)]),
    );
  }
  return value;
};

// NaN here would make the poller spin with no deadline.
const secondsToMs = (flag: string, value: string): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) usage(`${flag} must be a positive number (got "${value}")`);
  return Math.round(n * 1000);
};

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const collect = (value: string, previous: string[]): string[] => [...previous, value];

/** `TestingPlanConfig` (pkg/testing/pipeline.go); the strategy reads `config.techniques`. */
const buildTestingPlan = (input: {
  techniques: string[];
  packs: string[];
  validators: string[];
  stopOnFirstBreach?: boolean;
  maxTotalPrompts?: number;
}): JsonObject => ({
  prompt_sources: [{ type: 'prompt_pack', config: { pack_ids: input.packs } }],
  attack_strategies: [
    {
      type: 'single_turn_jailbreak',
      techniques: input.techniques,
      config: { techniques: input.techniques },
    },
  ],
  validators: input.validators,
  execution: {
    mode: 'sequential',
    stop_on_first_breach: input.stopOnFirstBreach ?? false,
    max_total_prompts: input.maxTotalPrompts ?? DEFAULT_MAX_TOTAL_PROMPTS,
  },
});

/** `CreateTestingSessionRequest`: application_context needs name + type or the session stays `draft`. */
const buildSessionBody = (
  name: string,
  application: JsonObject,
  targetConfig: JsonObject,
  testingPlan: JsonObject,
): JsonObject => ({
  name,
  application_context: {
    ...application,
    name: typeof application['name'] === 'string' ? application['name'] : name,
    type: typeof application['type'] === 'string' ? application['type'] : 'web',
  },
  target_config: targetConfig,
  testing_plan: testingPlan,
});

/** `CreateTestingRunRequest` (api/testing_types.go). */
const buildRunBody = (runName: string): JsonObject => ({
  run_name: runName,
  trigger_metadata: { source: 'disseqt-cli' },
});

/** YAML key with a deprecated alias; warns on stderr when only the alias is present. */
const pickKey = (config: JsonObject, key: string, alias: string): unknown => {
  if (config[key] !== undefined) return config[key];
  if (config[alias] !== undefined) {
    process.stderr.write(`warning: YAML key "${alias}" is deprecated; use "${key}"\n`);
  }
  return config[alias];
};

const isNotFound = (error: unknown): boolean =>
  error instanceof DisseqtHttpError && error.statusCode === 404;

// -------- output formatters (report / analytics) --------

const stringifyCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Rows from a bare array, `{items, pagination}` (list endpoints) or `{results}` (batch-automate). */
export const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['items', 'results']) {
      if (Array.isArray(record[key])) return record[key];
    }
  }
  return [];
};

/** `--page` / `--page-size` / `--all` for `{items, pagination}` lists (`page-size` max 100). */
const pageOptions = (cmd: Command): Command =>
  cmd
    .option('--page <n>', 'page number (1-based)')
    .option('--page-size <n>', 'rows per page (max 100)')
    .option('--all', 'follow pagination and return every row as {items}', false);

interface PageOpts {
  page?: string;
  pageSize?: string;
  all?: boolean;
}

const pageParams = (opts: PageOpts, page?: number): QueryParams => ({
  ...(page !== undefined || opts.page !== undefined ? { page: page ?? Number(opts.page) } : {}),
  ...(opts.pageSize !== undefined ? { 'page-size': Number(opts.pageSize) } : {}),
});

/** One page, or every page concatenated when `--all`. */
const fetchPaged = async (
  opts: PageOpts,
  fetchPage: (params: QueryParams) => Promise<unknown>,
): Promise<unknown> => {
  if (opts.all !== true) return fetchPage(pageParams(opts));
  const items: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const res = await fetchPage(pageParams(opts, page));
    items.push(...extractRows(res));
    const pg = isObject(res) ? res['pagination'] : undefined;
    if (!isObject(pg) || pg['has_next'] !== true) return { items };
  }
};

const collectHeaders = (rows: unknown[]): string[] => {
  const headers: string[] = [];
  for (const row of rows) {
    if (isObject(row)) {
      for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
    }
  }
  return headers;
};

const resultsToCsv = (payload: unknown): string => {
  const rows = extractRows(payload);
  if (rows.length === 0) return '';
  const headers = collectHeaders(rows);
  const escape = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    if (isObject(row)) lines.push(headers.map((h) => escape(stringifyCell(row[h]))).join(','));
  }
  return `${lines.join('\n')}\n`;
};

const resultsToMarkdown = (payload: unknown): string => {
  const rows = extractRows(payload);
  if (rows.length === 0) return '_no results_\n';
  const headers = collectHeaders(rows);
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    if (isObject(row)) lines.push(`| ${headers.map((h) => stringifyCell(row[h])).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
};

// -------- helpers used by multiple subcommands --------

const rt = (): RedteamClient => buildClient().redteam;

/** `BatchAutomateJailbreakRequest` target part: an id (no template, no init-curl) or the legacy template. */
const multiTurnTarget = (
  target: Target,
  config: JsonObject,
): { body: JsonObject; config: JsonObject } => {
  if (target.kind === 'integration') return { body: { app_integration_id: target.id }, config };
  if (target.kind === 'app') return { body: {}, config: { ...config, application_id: target.id } };
  if (target.kind === 'template')
    return { body: { app_integration_template: target.template }, config };
  return usage('multi-turn --endpoint takes an app_integration_template (JSON or @file)');
};

/** `VulnerabilityTestRequest`: `{app_integration_id | application_id | llm_config}` (app integrations only). */
export const vulnTestBody = (opts: TargetFlags & { llmConfig?: string }): JsonObject => {
  // Here `--target` always meant an app integration id (no UUID check, as before).
  const { target: legacy, ...rest } = opts;
  if (legacy !== undefined) {
    if (rest.app !== undefined || rest.integration !== undefined || rest.endpoint !== undefined) {
      usage('pass exactly one of --app, --integration, --endpoint');
    }
    warnTargetDeprecated();
    return { app_integration_id: legacy };
  }
  const target = resolveTarget(opts, 'single', opts.llmConfig === undefined);
  if (target === null) return { llm_config: readBody(opts.llmConfig) as JsonValue };
  if (opts.llmConfig !== undefined) usage('pass exactly one of --app, --integration, --llm-config');
  if (target.kind === 'endpoint') usage('vuln-test accepts --app or --integration, not --endpoint');
  return targetFields(target);
};

/** Query scope for the vuln-test routes; both ids are optional (the gateway injects them). */
export const vulnScope = (
  projectId: string | undefined,
  organizationId: string | undefined,
): Record<string, string> => {
  const orgId = organizationId ?? process.env['DISSEQT_ORGANIZATION_ID'] ?? '';
  return {
    ...(projectId !== undefined ? { project_id: projectId } : {}),
    ...(orgId.length > 0 ? { organization_id: orgId } : {}),
  };
};

export function registerRedteam(program: Command): void {
  const cmd = program
    .command('redteam')
    .description('run red-team attacks (single-turn, multi-turn, vuln tests)');

  // --- list-attacks / list-techniques / list-personas ---

  cmd
    .command('list-attacks')
    .description('list attack techniques (single-turn, multi-turn, agents)')
    .option(
      '--kind <kind>',
      'single | multi | agents | all',
      (v: string) => {
        if (!['single', 'multi', 'agents', 'all'].includes(v)) {
          usage(`--kind must be one of single|multi|agents|all (got "${v}")`);
        }
        return v;
      },
      'all',
    )
    .action(async (opts: { kind: 'single' | 'multi' | 'agents' | 'all' }) => {
      await runAction(async () => {
        const out = await rt().listAttacks(opts.kind);
        emit(out, true);
      });
    });

  cmd
    .command('list-techniques')
    .description('list techniques, optionally filtered by turn kind')
    .option('--single-turn', 'only single-turn techniques', false)
    .option('--multi-turn', 'only multi-turn techniques', false)
    .action(async (opts: { singleTurn?: boolean; multiTurn?: boolean }) => {
      if (opts.singleTurn === true && opts.multiTurn === true) {
        usage('pass at most one of --single-turn or --multi-turn');
      }
      await runAction(async () => {
        const client = rt();
        const out: Record<string, unknown> = {};
        if (opts.singleTurn === true || opts.multiTurn !== true) {
          out['single_turn'] = await client.listSingleTurnTechniques();
        }
        if (opts.multiTurn === true || opts.singleTurn !== true) {
          out['multi_turn'] = await client.listMultiTurnTechniques();
        }
        emit(out, true);
      });
    });

  cmd
    .command('list-personas')
    .description('enumerate persona agents (/api/v1/mr-jailbreak/agents)')
    .option('--attack-type <type>', 'filter personas by attack_type field if present')
    .action(async (opts: { attackType?: string }) => {
      await runAction(async () => {
        // The server filters by attack_type.
        emit(
          await rt().listAgents(
            opts.attackType !== undefined ? { attack_type: opts.attackType } : undefined,
          ),
          true,
        );
      });
    });

  // --- attack — end-to-end single- or multi-turn ---

  cmd
    .command('attack')
    .description('run one red-team attack end to end')
    .option('--single-turn', 'run a single-turn attack (testing sessions/runs)', false)
    .option('--multi-turn', 'run a multi-turn attack (mr-jailbreak batch-automate)', false)
    .requiredOption('--technique <id>', 'attack technique id (single-turn key or multi-turn uuid)')
    .option('--app <application_id>', 'AI System (application) id; its linked integration is used')
    .option('--integration <app_integration_id>', 'app integration id')
    .option(
      '--endpoint <value>',
      'single-turn: target endpoint URL; multi-turn: app_integration_template (JSON or @file)',
    )
    .option('--target <value>', 'deprecated: UUID → --app; JSON/@file → template (multi-turn)')
    .option('--prompt <text>', 'multi-turn target prompt (repeatable, 1..10)', collect, [])
    .option('--pack <id>', 'single-turn prompt pack id (repeatable)', collect, [])
    .option('--validator <name>', 'single-turn validator (repeatable)', collect, [])
    .option('--name <name>', 'session / job name prefix', 'cli')
    .option('--app-name <name>', 'multi-turn app_name (default: template name)')
    .option(
      '--app-description <text>',
      'multi-turn app_description_short (default: "<app name> (disseqt CLI)")',
    )
    .option('--app-type <type>', 'multi-turn app_type', 'chatbot')
    .option('--max-depth <n>', 'multi-turn max_depth (1..10)', String(DEFAULT_MAX_DEPTH))
    .option('--poll-interval <seconds>', 'seconds between status polls', '2')
    .option('--max-wait <seconds>', 'max seconds to wait for the run to finish', '300')
    .action(
      async (opts: {
        singleTurn?: boolean;
        multiTurn?: boolean;
        technique: string;
        app?: string;
        integration?: string;
        endpoint?: string;
        target?: string;
        prompt: string[];
        pack: string[];
        validator: string[];
        name: string;
        appName?: string;
        appDescription?: string;
        appType: string;
        maxDepth: string;
        pollInterval: string;
        maxWait: string;
      }) => {
        if ((opts.singleTurn === true) === (opts.multiTurn === true)) {
          usage('pass exactly one of --single-turn or --multi-turn');
        }
        const pollMs = secondsToMs('--poll-interval', opts.pollInterval);
        const maxMs = secondsToMs('--max-wait', opts.maxWait);

        if (opts.multiTurn === true) {
          if (opts.prompt.length === 0 || opts.prompt.length > MAX_TARGET_PROMPTS) {
            usage(`--multi-turn needs 1..${MAX_TARGET_PROMPTS} --prompt values`);
          }
          const target = requireTarget(opts, 'multi');
          const maxDepth = Number(opts.maxDepth);
          if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 10) {
            usage('--max-depth must be an integer in 1..10');
          }
          const tplName = target.kind === 'template' ? target.template['name'] : undefined;
          const appName = opts.appName ?? (typeof tplName === 'string' ? tplName : opts.name);
          await runAction(async () => {
            const client = buildClient();
            // JailbreakJobConfig.project_id is `binding:"required"`; derive it from the key if unset.
            const projectId = client.transport.projectId ?? (await client.whoami()).project_id;
            if (projectId === null) {
              throw new Error(
                'multi-turn needs a project id: set DISSEQT_PROJECT_ID or `disseqt login --project-id`',
              );
            }
            const picked = multiTurnTarget(target, {
              project_id: projectId,
              job_name_prefix: opts.name,
              app_name: appName,
              app_description_short: opts.appDescription ?? `${appName} (disseqt CLI)`,
              app_type: opts.appType,
              max_depth: maxDepth,
              orchestration_mode: 'single',
              technique_id: opts.technique,
            });
            const body: JsonObject = {
              target_prompts: opts.prompt,
              ...picked.body,
              jailbreak_config: picked.config,
              ecid_prefix: 'cli',
              ecid_start_number: 1,
            };
            const batch = await client.redteam.batchAutomate(body);
            const jobs: JsonObject[] = [];
            for (const row of extractRows(batch)) {
              const jobId = resolveId(row, 'job_id');
              if (jobId === null) continue;
              jobs.push(
                // No mr-jailbreak cancel route exists, so a timeout only prints the hint.
                await pollUntilTerminal(() => client.redteam.getMrJob(jobId), {
                  intervalMs: pollMs,
                  timeoutMs: maxMs,
                  id: jobId,
                  statusCommand: `disseqt redteam status ${jobId}`,
                }),
              );
            }
            emit({ batch, jobs }, true);
          });
          return;
        }

        const target = requireTarget(opts, 'single');
        if (opts.pack.length === 0 || opts.validator.length === 0) {
          usage('--single-turn needs at least one --pack and one --validator');
        }
        await runAction(async () => {
          const client = rt();
          const name = `${opts.name}-${opts.technique}-${Date.now()}`;
          const session = await client.createSession(
            buildSessionBody(
              name,
              {},
              targetFields(target),
              buildTestingPlan({
                techniques: [opts.technique],
                packs: opts.pack,
                validators: opts.validator,
              }),
            ),
          );
          const sessionId = resolveId(session, 'id', 'session_id');
          if (sessionId === null) {
            throw new Error(
              `could not resolve session id from response: ${JSON.stringify(session)}`,
            );
          }
          const run = await client.createRun(sessionId, buildRunBody(name));
          const runId = resolveId(run, 'id', 'run_id');
          if (runId === null) {
            throw new Error(`could not resolve run id from response: ${JSON.stringify(run)}`);
          }
          const final = await pollUntilTerminal(() => client.getRun(runId), {
            intervalMs: pollMs,
            timeoutMs: maxMs,
            id: runId,
            cancel: () => client.cancelRun(runId),
            statusCommand: `disseqt redteam status ${runId}`,
          });
          const results = await client.getRunResults(runId);
          emit({ status: final, results }, true);
        });
      },
    );

  // --- session list / get ---

  const sessionCmd = cmd.command('session').description('inspect red-team sessions');
  pageOptions(sessionCmd.command('list')).action(async (opts: PageOpts) => {
    await runAction(async () => {
      const client = rt();
      emit(await fetchPaged(opts, (params) => client.listSessions(params)), true);
    });
  });
  sessionCmd.command('get <sessionId>').action(async (sessionId: string) => {
    await runAction(async () => emit(await rt().getSession(sessionId), true));
  });

  // --- vuln-test — POST /api/v1/vulnerabilities/{id}/test/poll ---

  targetOptions(
    cmd
      .command('vuln-test')
      .description('run the polling vuln-test endpoint for one vulnerability')
      .requiredOption('--vulnerability <id>', 'vulnerability id to test'),
    'deprecated alias of --integration',
  )
    .option('--llm-config <json|file|->', 'llm_config object instead of a target')
    .option('--organization-id <id>', 'organization scope (default env DISSEQT_ORGANIZATION_ID)')
    .action(
      async (
        opts: { vulnerability: string; llmConfig?: string; organizationId?: string } & TargetFlags,
      ) => {
        const body = vulnTestBody(opts);
        await runAction(async () => {
          const client = buildClient();
          emit(
            await client.vulnerabilities.testPoll(
              opts.vulnerability,
              body,
              vulnScope(client.transport.projectId, opts.organizationId),
            ),
            true,
          );
        });
      },
    );

  // --- run [config.yaml] — end-to-end suite from YAML ---

  cmd
    .command('run [configPath]')
    .description(
      'create a testing session + run from YAML (keys: name, application, target, prompt_packs, techniques, validators, stop_on_first_breach, max_total_prompts, run_name | testing_plan)',
    )
    .option('--json', 'emit the raw session + run payloads', false)
    .action(async (configPath: string | undefined, opts: CommonOpts) => {
      if (configPath === undefined) {
        usage('provide a config path (interactive prompts unsupported in Node CLI)');
      }
      await runAction(async () => {
        const config = expandEnv(readYamlFile(configPath as string)) as JsonObject;
        const target = pickKey(config, 'target', 'target_config');
        const application = pickKey(config, 'application', 'application_context');
        const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
        const name = String(config['name'] ?? `cli-run-${Date.now()}`);
        const sessionBody = buildSessionBody(
          name,
          isObject(application) ? application : {},
          isObject(target) ? target : {},
          isObject(config['testing_plan'])
            ? config['testing_plan']
            : buildTestingPlan({
                techniques: asList(config['techniques']),
                packs: asList(pickKey(config, 'prompt_packs', 'packs')),
                validators: asList(config['validators']),
                stopOnFirstBreach: config['stop_on_first_breach'] === true,
                maxTotalPrompts: Number(config['max_total_prompts'] ?? DEFAULT_MAX_TOTAL_PROMPTS),
              }),
        );
        const client = rt();
        const session = await client.createSession(sessionBody);
        const sessionId = resolveId(session, 'id', 'session_id');
        if (sessionId === null) {
          throw new Error(`could not resolve session id from response: ${JSON.stringify(session)}`);
        }
        const runName = typeof config['run_name'] === 'string' ? config['run_name'] : name;
        const launched = await client.createRun(sessionId, buildRunBody(runName));
        if (opts.json === true) {
          emit({ session, run: launched }, true);
          return;
        }
        const runId = resolveId(launched, 'id', 'run_id') ?? '?';
        process.stdout.write(`session=${sessionId} run=${runId}\n`);
        process.stdout.write(`track: disseqt redteam status ${runId}\n`);
      });
    });

  // --- validate — POST /api/v1/testing/validate ---

  cmd
    .command('validate')
    .description('one-shot single-turn validation (POST /api/v1/testing/validate)')
    .requiredOption('--input <text>', 'prompt / LLM input to score')
    .option('--output <text>', 'LLM output to score (may be empty)', '')
    .requiredOption('--validator <name...>', 'validator name (repeatable). At least one required.')
    .option('--input-context <text>', 'optional context passed to the validator', '')
    .option('--threshold <value>', 'override per-validator threshold (0 < t <= 1)')
    .action(
      async (opts: {
        input: string;
        output: string;
        validator: string[];
        inputContext: string;
        threshold?: string;
      }) => {
        const body: RedteamValidateRequest = {
          input: opts.input,
          output: opts.output,
          validators: opts.validator,
          input_context: opts.inputContext,
        };
        if (opts.threshold !== undefined) {
          const t = Number(opts.threshold);
          if (!Number.isFinite(t) || t <= 0 || t > 1) {
            usage('--threshold must satisfy 0 < t <= 1');
          }
          body.threshold = t;
        }
        await runAction(async () => emit(await rt().validate(body), true));
      },
    );

  // --- status / cancel / results — job ops ---

  cmd
    .command('status <jobId>')
    .description('fetch status for a testing run, falling back to an mr-jailbreak job on 404')
    .action(async (jobId: string) => {
      await runAction(async () => {
        const client = rt();
        try {
          emit(await client.getRun(jobId), true);
        } catch (error) {
          if (!isNotFound(error)) throw error;
          emit(await client.getMrJob(jobId), true);
        }
      });
    });

  cmd
    .command('cancel <jobId>')
    .description('cancel a running job or run')
    .action(async (jobId: string) => {
      await runAction(async () => emit(await rt().cancelRun(jobId), true));
    });

  pageOptions(
    cmd
      .command('results <jobId>')
      .description('results for a testing run, falling back to mr-jailbreak interactions on 404'),
  ).action(async (jobId: string, opts: PageOpts) => {
    await runAction(async () => {
      const client = rt();
      try {
        emit(await fetchPaged(opts, (params) => client.getRunResults(jobId, params)), true);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        emit(await client.getMrJobInteractions(jobId), true);
      }
    });
  });

  // --- report [runId] --format {json,csv,markdown} [--session <id>] ---

  cmd
    .command('report [runId]')
    .description('export a report: json|markdown from a run id, csv from --session <id>')
    .option('--format <fmt>', 'json | csv | markdown', 'json')
    .option('--session <id>', 'session id for --format csv (GET /sessions/{id}/report/csv)')
    .action(async (runId: string | undefined, opts: { format: string; session?: string }) => {
      if (!['json', 'csv', 'markdown'].includes(opts.format)) {
        usage(`--format must be one of json|csv|markdown (got "${opts.format}")`);
      }
      if (opts.format === 'csv' && opts.session === undefined) {
        usage('--format csv requires --session <id>');
      }
      if (opts.format !== 'csv' && runId === undefined) {
        usage(`--format ${opts.format} requires a run id`);
      }
      await runAction(async () => {
        const client = rt();
        if (opts.format === 'csv') {
          const raw = await client.sessionReportCsv(opts.session as string);
          const ct = raw.headers.get('content-type') ?? '';
          if (ct.includes('text/csv') || (!ct.includes('json') && raw.text.length > 0)) {
            process.stdout.write(raw.text);
            return;
          }
          const parsed: unknown = raw.text.length > 0 ? JSON.parse(raw.text) : {};
          process.stdout.write(resultsToCsv(parsed));
          return;
        }
        // A report covers every result, so follow pagination.
        const payload = await fetchPaged({ all: true, pageSize: '100' }, (params) =>
          client.getRunResults(runId as string, params),
        );
        if (opts.format === 'json') {
          emit(payload, true);
          return;
        }
        process.stdout.write(resultsToMarkdown(payload));
      });
    });

  // --- analytics ---

  cmd
    .command('analytics')
    .description('show jailbreak analytics (summary + prompts-stats)')
    .option('--summary', 'only fetch the summary endpoint', false)
    .option('--prompts-stats', 'only fetch the prompts-stats endpoint', false)
    .option('--format <fmt>', 'table | json', 'table')
    .action(async (opts: { summary?: boolean; promptsStats?: boolean; format: string }) => {
      if (opts.summary === true && opts.promptsStats === true) {
        usage('pass at most one of --summary or --prompts-stats');
      }
      if (!['table', 'json'].includes(opts.format)) {
        usage(`--format must be one of table|json (got "${opts.format}")`);
      }
      const wantSummary = opts.summary === true || opts.promptsStats !== true;
      const wantPrompts = opts.promptsStats === true || opts.summary !== true;
      await runAction(async () => {
        const client = rt();
        // Alphabetical insertion order matches Python's sort_keys=True.
        const out: JsonObject = {};
        if (wantPrompts) out['prompts_stats'] = await client.analyticsPromptsStats();
        if (wantSummary) out['summary'] = await client.analyticsSummary();
        if (opts.format === 'json') {
          const values = Object.values(out);
          emit(values.length === 1 ? values[0] : out, true);
          return;
        }
        // table format — just render each block as key/value lines.
        for (const [title, payload] of Object.entries(out)) {
          process.stdout.write(`# ${title.replace(/_/g, ' ')}\n`);
          if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
            for (const [k, v] of Object.entries(payload)) {
              process.stdout.write(`${k}: ${stringifyCell(v)}\n`);
            }
          } else {
            process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
          }
          process.stdout.write('\n');
        }
      });
    });

  // --- recommend {packs,attacks,validators} ---

  cmd
    .command('recommend <kind>')
    .description('ask the bot to recommend packs / attacks / validators')
    .option('--app-name <name>', 'app_name (required for packs)')
    .option('--app-description <text>', 'app_description (min 10 chars for packs)')
    .option('--config <path>', 'JSON body to send instead of the flags')
    .action(
      async (
        kind: string,
        opts: { appName?: string; appDescription?: string; config?: string },
      ) => {
        if (!['packs', 'attacks', 'validators'].includes(kind)) {
          usage(`kind must be one of packs|attacks|validators (got "${kind}")`);
        }
        let body: JsonObject;
        if (opts.config !== undefined) {
          body = readJsonFile(opts.config);
        } else {
          if (opts.appDescription === undefined) usage('pass --app-description or --config FILE');
          if (kind === 'packs' && opts.appName === undefined) {
            usage('recommend packs requires --app-name');
          }
          body =
            kind === 'packs'
              ? { app_name: opts.appName ?? '', app_description: opts.appDescription ?? '' }
              : { app_description: opts.appDescription ?? '' };
        }
        await runAction(async () =>
          emit(await rt().recommend(kind as 'packs' | 'attacks' | 'validators', body), true),
        );
      },
    );

  // --- parse-curl [source] --stdin ---

  cmd
    .command('parse-curl [source]')
    .description('parse a curl command into a structured request payload')
    .option('--stdin', 'read curl string from stdin', false)
    .action(async (source: string | undefined, opts: { stdin?: boolean }) => {
      let curl: string;
      if (source === '-' || opts.stdin === true || (source === undefined && !process.stdin.isTTY)) {
        curl = readFileSync(0, 'utf-8').trim();
      } else if (source !== undefined) {
        curl = readFileSync(source, 'utf-8').trim();
      } else {
        usage('provide a FILE path, --stdin, or pipe curl on stdin');
        return;
      }
      if (curl.length === 0) usage('empty curl input');
      await runAction(async () => emit(await rt().parseCurl(curl), true));
    });

  // --- test-connection ---

  cmd
    .command('test-connection')
    .description('ping the target model through the bot connectivity endpoint')
    .option('--endpoint <url>', 'target endpoint URL')
    .option('--provider <name>', 'provider name (e.g. openai)')
    .option('--model <name>', 'model name (e.g. gpt-4o)')
    .option('--api-key <key>', 'target API key (prefer --api-key-env)')
    .option('--api-key-env <var>', 'env var holding the target API key')
    .option('--session-id <id>', 'save the credentials to this testing session')
    .option('--config <path>', 'JSON body with the full flat request instead of the flags')
    .action(
      async (opts: {
        endpoint?: string;
        provider?: string;
        model?: string;
        apiKey?: string;
        apiKeyEnv?: string;
        sessionId?: string;
        config?: string;
      }) => {
        let body: JsonObject;
        if (opts.config !== undefined) {
          body = readJsonFile(opts.config);
        } else {
          const apiKey =
            opts.apiKey ?? (opts.apiKeyEnv !== undefined ? process.env[opts.apiKeyEnv] : undefined);
          if (apiKey === undefined || apiKey.length === 0) {
            usage('pass --api-key, --api-key-env VAR, or --config FILE');
          }
          body = { api_key: apiKey ?? '' };
          if (opts.endpoint !== undefined) body['endpoint'] = opts.endpoint;
          if (opts.provider !== undefined) body['provider'] = opts.provider;
          if (opts.model !== undefined) body['model'] = opts.model;
          if (opts.sessionId !== undefined) body['session_id'] = opts.sessionId;
        }
        await runAction(async () => emit(await rt().testConnection(body), true));
      },
    );

  // commonJson attaches --json to the redteam group so `redteam --json`
  // parses without an "unknown option" error before dispatch.
  commonJson(cmd);
}
