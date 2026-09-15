import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

import type { Command } from 'commander';
import { load as yamlLoad } from 'js-yaml';

import type { RedteamClient, RedteamValidateRequest } from '../../resources/redteam.js';
import type { JsonObject } from '../../http/types.js';
import { buildClient, emit, EXIT_USAGE, runAction } from '../config.js';

// Every subcommand mirrors `disseqt redteam <verb>` in the Python SDK
// (src/disseqt_sdk/cli/redteam.py). Flag names + defaults + JSON output
// shape are held identical — the cross-SDK diff in tests keeps drift honest.

interface CommonOpts {
  json?: boolean;
}

const commonJson = (cmd: Command): Command => cmd.option('--json', 'emit JSON output', false);

const TERMINAL = new Set([
  'completed',
  'complete',
  'failed',
  'cancelled',
  'canceled',
  'error',
  'errored',
  'success',
  'succeeded',
  'done',
]);

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `probe()` until status ∈ TERMINAL or `maxWaitMs` elapses. */
const pollUntilTerminal = async <T extends JsonObject>(
  probe: () => Promise<T>,
  pollIntervalMs: number,
  maxWaitMs: number,
): Promise<T> => {
  const deadline = Date.now() + maxWaitMs;
  let last: T = await probe();
  for (;;) {
    const state = String(last['status'] ?? last['state'] ?? '').toLowerCase();
    if (TERMINAL.has(state)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(pollIntervalMs);
    last = await probe();
  }
};

// -------- output formatters (report / analytics / eval-single-turn) --------

const stringifyCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** Extract the `results` array from either a bare array or a `{results:[]}` wrapper. */
const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload !== null && typeof payload === 'object') {
    const inner = (payload as Record<string, unknown>)['results'];
    if (Array.isArray(inner)) return inner;
  }
  return [];
};

const resultsToCsv = (payload: unknown): string => {
  const rows = extractRows(payload);
  if (rows.length === 0) return '';
  const headers: string[] = [];
  for (const row of rows) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as Record<string, unknown>)) {
        if (!headers.includes(k)) headers.push(k);
      }
    }
  }
  const escape = (s: string): string =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      const record = row as Record<string, unknown>;
      lines.push(headers.map((h) => escape(stringifyCell(record[h]))).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
};

const resultsToMarkdown = (payload: unknown): string => {
  const rows = extractRows(payload);
  if (rows.length === 0) return '_no results_\n';
  const headers: string[] = [];
  for (const row of rows) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row as Record<string, unknown>)) {
        if (!headers.includes(k)) headers.push(k);
      }
    }
  }
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      const record = row as Record<string, unknown>;
      lines.push(`| ${headers.map((h) => stringifyCell(record[h])).join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
};

// -------- helpers used by multiple subcommands --------

const rt = (): RedteamClient => buildClient().redteam;

const usage = (msg: string): never => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(EXIT_USAGE);
};

export function registerRedteam(program: Command): void {
  const cmd = program
    .command('redteam')
    .description('run red-team attacks (single-turn, multi-turn, vuln tests)');

  // -------------------------------------------------------------------
  // list-attacks / list-techniques / list-personas
  // -------------------------------------------------------------------

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
        const payload: unknown = await rt().listAgents();
        let out: unknown = payload;
        if (opts.attackType !== undefined && Array.isArray(payload)) {
          out = payload.filter(
            (p) =>
              p !== null &&
              typeof p === 'object' &&
              (p as Record<string, unknown>)['attack_type'] === opts.attackType,
          );
        }
        emit(out, true);
      });
    });

  // -------------------------------------------------------------------
  // attack — end-to-end single- or multi-turn
  // -------------------------------------------------------------------

  cmd
    .command('attack')
    .description('run one red-team attack end to end')
    .option('--single-turn', 'run a single-turn attack', false)
    .option('--multi-turn', 'run a multi-turn attack', false)
    .requiredOption('--technique <id>', 'attack technique id or name')
    .requiredOption('--target <id>', 'target model identifier / integration id')
    .option('--prompt <text>', 'seed prompt (single-turn) or objective (multi-turn)')
    .option('--poll-interval <seconds>', 'seconds between run status polls', '2')
    .option('--max-wait <seconds>', 'max seconds to wait for the run to finish', '300')
    .action(
      async (opts: {
        singleTurn?: boolean;
        multiTurn?: boolean;
        technique: string;
        target: string;
        prompt?: string;
        pollInterval: string;
        maxWait: string;
      }) => {
        if ((opts.singleTurn === true) === (opts.multiTurn === true)) {
          usage('pass exactly one of --single-turn or --multi-turn');
        }
        const pollMs = Math.round(Number(opts.pollInterval) * 1000);
        const maxMs = Math.round(Number(opts.maxWait) * 1000);

        await runAction(async () => {
          const client = rt();
          if (opts.multiTurn === true) {
            const result = await client.batchAutomate({
              technique: opts.technique,
              target: opts.target,
              objective: opts.prompt ?? '',
            });
            emit(result, true);
            return;
          }
          const session = await client.createSession({ target: opts.target });
          const sessionId = resolveId(session, 'id', 'session_id');
          if (sessionId === null) {
            throw new Error(`could not resolve session id from response: ${JSON.stringify(session)}`);
          }
          const run = await client.createRun(sessionId, {
            technique: opts.technique,
            prompt: opts.prompt ?? '',
          });
          const runId = resolveId(run, 'id', 'run_id');
          if (runId === null) {
            throw new Error(`could not resolve run id from response: ${JSON.stringify(run)}`);
          }
          const final = await pollUntilTerminal(() => client.getRun(runId), pollMs, maxMs);
          const state = String(final['status'] ?? final['state'] ?? '').toLowerCase();
          if (!TERMINAL.has(state)) {
            throw new Error(`run ${runId} did not finish within ${opts.maxWait}s`);
          }
          const results = await client.getRunResults(runId);
          emit({ status: final, results }, true);
        });
      },
    );

  // -------------------------------------------------------------------
  // session list / get (mirrors `disseqt redteam session ...` in Python)
  // -------------------------------------------------------------------

  const sessionCmd = cmd.command('session').description('inspect red-team sessions');
  sessionCmd
    .command('list')
    .action(async () => {
      await runAction(async () => emit(await rt().listSessions(), true));
    });
  sessionCmd
    .command('get <sessionId>')
    .action(async (sessionId: string) => {
      await runAction(async () => emit(await rt().getSession(sessionId), true));
    });

  // -------------------------------------------------------------------
  // vuln-test — POST /api/v1/vulnerabilities/{id}/test/poll
  // -------------------------------------------------------------------

  cmd
    .command('vuln-test')
    .description('run the polling vuln-test endpoint for one vulnerability')
    .requiredOption('--vulnerability <id>', 'vulnerability id to test')
    .requiredOption('--target <id>', 'target model identifier / integration id')
    .action(async (opts: { vulnerability: string; target: string }) => {
      await runAction(async () =>
        emit(
          await buildClient().vulnerabilities.testPoll(opts.vulnerability, { target: opts.target }),
          true,
        ),
      );
    });

  // -------------------------------------------------------------------
  // run [config.yaml] — end-to-end suite from YAML
  // -------------------------------------------------------------------

  cmd
    .command('run [configPath]')
    .description('run a full red-team suite from a YAML CONFIG_PATH')
    .option('--json', 'emit the raw job payload', false)
    .action(async (configPath: string | undefined, opts: CommonOpts) => {
      if (configPath === undefined) {
        usage('provide a config path (interactive prompts unsupported in Node CLI)');
      }
      await runAction(async () => {
        const rawConfig = readYamlFile(configPath as string);
        const config = expandEnv(rawConfig) as Record<string, unknown>;
        const target = (config['target'] as JsonObject | undefined) ?? {};
        const sessionBody: Record<string, unknown> = { target };
        for (const key of [
          'vulnerabilities',
          'personas',
          'concurrency',
          'max_depth',
          'stop_on_first_success',
        ]) {
          if (config[key] !== undefined) sessionBody[key] = config[key];
        }
        const client = rt();
        const session = await client.createSession(sessionBody);
        const sessionId = resolveId(session, 'id', 'session_id');
        if (sessionId === null) {
          throw new Error(`could not resolve session id from response: ${JSON.stringify(session)}`);
        }
        const runBody: JsonObject = {
          techniques: (config['techniques'] as unknown[] | undefined) ?? [],
          personas: (config['personas'] as unknown[] | undefined) ?? [],
          vulnerabilities: (config['vulnerabilities'] as unknown[] | undefined) ?? [],
        };
        const launched = await client.createRun(sessionId, runBody);
        if (opts.json === true) {
          emit({ session, run: launched }, true);
          return;
        }
        const runId = resolveId(launched, 'id', 'run_id') ?? '?';
        process.stdout.write(`session=${sessionId} run=${runId}\n`);
        process.stdout.write(`track: disseqt redteam status ${runId}\n`);
      });
    });

  // -------------------------------------------------------------------
  // validate — POST /api/v1/testing/validate
  // -------------------------------------------------------------------

  cmd
    .command('validate')
    .description('one-shot single-turn validation (POST /api/v1/testing/validate)')
    .requiredOption('--input <text>', 'prompt / LLM input to score')
    .option('--output <text>', 'LLM output to score (may be empty)', '')
    .requiredOption(
      '--validator <name...>',
      'validator name (repeatable). At least one required.',
    )
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

  // -------------------------------------------------------------------
  // status / cancel / results — job ops
  // -------------------------------------------------------------------

  cmd
    .command('status <jobId>')
    .description('fetch status for a running/completed job or run')
    .action(async (jobId: string) => {
      await runAction(async () => {
        const client = rt();
        try {
          emit(await client.getRun(jobId), true);
        } catch {
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

  cmd
    .command('results <jobId>')
    .description('pretty-print results for a completed job or run')
    .action(async (jobId: string) => {
      await runAction(async () => {
        const client = rt();
        try {
          emit(await client.getRunResults(jobId), true);
        } catch {
          emit(await client.getMrJobInteractions(jobId), true);
        }
      });
    });

  // -------------------------------------------------------------------
  // report <jobId> --format {json,csv,markdown}
  // -------------------------------------------------------------------

  cmd
    .command('report <jobId>')
    .description('export a report for a completed job')
    .option('--format <fmt>', 'json | csv | markdown', 'json')
    .action(async (jobId: string, opts: { format: string }) => {
      if (!['json', 'csv', 'markdown'].includes(opts.format)) {
        usage(`--format must be one of json|csv|markdown (got "${opts.format}")`);
      }
      await runAction(async () => {
        const client = rt();
        if (opts.format === 'csv') {
          const raw = await client.sessionReportCsv(jobId);
          const ct = raw.headers.get('content-type') ?? '';
          if (ct.includes('text/csv') || (!ct.includes('json') && raw.text.length > 0)) {
            process.stdout.write(raw.text);
            return;
          }
          const parsed: unknown = raw.text.length > 0 ? JSON.parse(raw.text) : {};
          process.stdout.write(resultsToCsv(parsed));
          return;
        }
        const payload = await client.getRunResults(jobId);
        if (opts.format === 'json') {
          emit(payload, true);
          return;
        }
        process.stdout.write(resultsToMarkdown(payload));
      });
    });

  // -------------------------------------------------------------------
  // analytics
  // -------------------------------------------------------------------

  cmd
    .command('analytics')
    .description('show jailbreak analytics (summary + prompts-stats)')
    .option('--summary', 'only fetch the summary endpoint', false)
    .option('--prompts-stats', 'only fetch the prompts-stats endpoint', false)
    .option('--format <fmt>', 'table | json', 'table')
    .action(
      async (opts: { summary?: boolean; promptsStats?: boolean; format: string }) => {
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
      },
    );

  // -------------------------------------------------------------------
  // recommend {packs,attacks,validators}
  // -------------------------------------------------------------------

  cmd
    .command('recommend <kind>')
    .description('ask the bot to recommend packs / attacks / validators')
    .option('--context <text>', 'free-form context string')
    .option('--config <path>', 'JSON body to send instead of --context')
    .action(async (kind: string, opts: { context?: string; config?: string }) => {
      if (!['packs', 'attacks', 'validators'].includes(kind)) {
        usage(`kind must be one of packs|attacks|validators (got "${kind}")`);
      }
      if (opts.context === undefined && opts.config === undefined) {
        usage('pass --context or --config FILE');
      }
      if (opts.context !== undefined && opts.config !== undefined) {
        usage('pass exactly one of --context or --config');
      }
      await runAction(async () => {
        const body =
          opts.config !== undefined ? readJsonFile(opts.config) : { context: opts.context ?? '' };
        emit(await rt().recommend(kind as 'packs' | 'attacks' | 'validators', body), true);
      });
    });

  // -------------------------------------------------------------------
  // parse-curl [source] --stdin
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // test-connection --target --config
  // -------------------------------------------------------------------

  cmd
    .command('test-connection')
    .description('ping the target model through the bot connectivity endpoint')
    .option('--target <spec>', 'target as provider/model (e.g. openai/gpt-4o)')
    .option('--config <path>', 'JSON body with a full target dict')
    .action(async (opts: { target?: string; config?: string }) => {
      let body: JsonObject;
      if (opts.config !== undefined) {
        body = readJsonFile(opts.config);
      } else {
        const envTarget = opts.target ?? process.env['DISSEQT_REDTEAM_TARGET'];
        if (envTarget === undefined || envTarget.length === 0) {
          usage('pass --target provider/model, --config FILE, or set DISSEQT_REDTEAM_TARGET');
          return;
        }
        if (envTarget.includes('/')) {
          const [provider, ...rest] = envTarget.split('/');
          body = { target: { provider, model: rest.join('/') } };
        } else {
          body = { target: { id: envTarget } };
        }
      }
      await runAction(async () => emit(await rt().testConnection(body), true));
    });

  // -------------------------------------------------------------------
  // eval-csv <path>
  // -------------------------------------------------------------------

  cmd
    .command('eval-csv <path>')
    .description('upload a CSV to the bulk-evaluate endpoint')
    .option('--output <path>', 'save results JSON to file')
    .option('--wait', 'poll until the job finishes', false)
    .option('--poll-interval <seconds>', 'seconds between poll requests', '2')
    .option('--max-wait <seconds>', 'max seconds to wait for completion', '600')
    .action(
      async (
        csvPath: string,
        opts: { output?: string; wait?: boolean; pollInterval: string; maxWait: string },
      ) => {
        const contents = readFileSync(csvPath, 'utf-8');
        const filename = csvPath.split(/[\\/]/).pop() ?? 'upload.csv';
        await runAction(async () => {
          const client = rt();
          const submit = await client.evaluateCsv(filename, contents);
          const jobId = resolveId(submit, 'job_id', 'id');
          if (opts.wait !== true) {
            emit(submit, true);
            return;
          }
          if (jobId === null) {
            throw new Error(`could not resolve job id from response: ${JSON.stringify(submit)}`);
          }
          const pollMs = Math.round(Number(opts.pollInterval) * 1000);
          const maxMs = Math.round(Number(opts.maxWait) * 1000);
          const final = await pollUntilTerminal(
            () => client.evaluateCsvJob(jobId),
            pollMs,
            maxMs,
          );
          const state = String(final['status'] ?? final['state'] ?? '').toLowerCase();
          if (!TERMINAL.has(state)) {
            throw new Error(`job ${jobId} did not finish within ${opts.maxWait}s`);
          }
          if (opts.output !== undefined) {
            writeFileSync(opts.output, JSON.stringify(final, null, 2));
            process.stdout.write(`wrote ${opts.output}\n`);
            return;
          }
          emit(final, true);
        });
      },
    );

  // -------------------------------------------------------------------
  // eval-single-turn --input --technique --vulnerability --format
  // -------------------------------------------------------------------

  cmd
    .command('eval-single-turn')
    .description('evaluate one prompt against the single-turn jailbreak scorer')
    .requiredOption('--input <text>', 'prompt to evaluate')
    .option('--technique <name>', 'attack technique to attribute the prompt to')
    .option('--vulnerability <name>', 'vulnerability to score against')
    .option('--format <fmt>', 'text | json', 'text')
    .action(
      async (opts: {
        input: string;
        technique?: string;
        vulnerability?: string;
        format: string;
      }) => {
        if (!['text', 'json'].includes(opts.format)) {
          usage(`--format must be one of text|json (got "${opts.format}")`);
        }
        await runAction(async () => {
          const payloadReq: Parameters<RedteamClient['singleTurnEvaluate']>[0] = {
            input: opts.input,
          };
          if (opts.technique !== undefined) payloadReq.technique = opts.technique;
          if (opts.vulnerability !== undefined) payloadReq.vulnerability = opts.vulnerability;
          const payload = await rt().singleTurnEvaluate(payloadReq);
          if (opts.format === 'json') {
            emit(payload, true);
            return;
          }
          const verdict = String(payload['verdict'] ?? payload['decision'] ?? '?');
          const reason = String(payload['reason'] ?? payload['rationale'] ?? '');
          process.stdout.write(`verdict: ${verdict}\n`);
          if (reason.length > 0) process.stdout.write(`reason: ${reason}\n`);
        });
      },
    );

  // commonJson attaches --json to the redteam group so `redteam --json`
  // parses without an "unknown option" error before dispatch.
  commonJson(cmd);
}
