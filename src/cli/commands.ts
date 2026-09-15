import type { Command } from 'commander';

import { buildClient, emit, pollUntilTerminal, runAction } from './config.js';
import { readBody } from './parse.js';

// ponytail: single file for every command group. Splitting per-group buys us
// nothing until any one group actually grows past ~50 lines.

interface CommonOpts {
  json?: boolean;
  wait?: boolean;
}

const commonJson = (cmd: Command): Command => cmd.option('--json', 'emit JSON output', false);
const commonWait = (cmd: Command): Command =>
  cmd.option('--wait', 'poll until terminal status', false);

/** target group */
export function registerTarget(program: Command): void {
  const cmd = program.command('target').description('LLM targets (app-integrations)');

  commonJson(
    cmd.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().targets.list(), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().targets.get(id), opts.json === true));
    }),
  );
  commonJson(
    cmd
      .command('create')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().targets.create(readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd
      .command('update <id>')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (id: string, opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().targets.update(id, readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd.command('delete <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().targets.delete(id), opts.json === true));
    }),
  );
  commonJson(
    cmd
      .command('test <id>')
      .option('--body <json|file|->', 'request body')
      .action(async (id: string, opts: CommonOpts & { body?: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().targets.test(id, readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd
      .command('parse-curl')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().targets.parseCurl(readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
}

/** pack group */
export function registerPack(program: Command): void {
  const cmd = program.command('pack').description('prompt packs');

  commonJson(
    cmd.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().packs.list(), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().packs.get(id), opts.json === true));
    }),
  );
  commonJson(
    cmd
      .command('create')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(await buildClient().packs.create(readBody(opts.body) as never), opts.json === true),
        );
      }),
  );
  commonJson(
    cmd.command('delete <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().packs.delete(id), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('publish <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().packs.publish(id), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('unpublish <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().packs.unpublish(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('duplicate <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().packs.duplicate(id), opts.json === true),
      );
    }),
  );
}

/** run group */
export function registerRun(program: Command): void {
  const cmd = program.command('run').description('pack runs');

  commonJson(
    cmd.command('list <packId>').action(async (packId: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().runs.list(packId), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('get <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().runs.get(runId), opts.json === true));
    }),
  );
  commonJson(
    commonWait(
      cmd
        .command('create <packId>')
        .requiredOption('--body <json|file|->', 'request body')
        .action(async (packId: string, opts: CommonOpts & { body: string }) => {
          await runAction(async () => {
            const c = buildClient();
            const created = await c.runs.create(packId, readBody(opts.body) as never);
            if (opts.wait !== true) {
              emit(created, opts.json === true);
              return;
            }
            const runId = String(created['id'] ?? created['run_id'] ?? '');
            if (runId.length === 0) {
              emit(created, opts.json === true);
              return;
            }
            const final = await pollUntilTerminal(() => c.runs.get(runId));
            emit(final, opts.json === true);
          });
        }),
    ),
  );
  commonJson(
    cmd.command('cancel <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().runs.cancel(runId), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('outputs <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().runs.outputs(runId), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('report <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().runs.report(runId), opts.json === true));
    }),
  );
  commonJson(
    cmd
      .command('watch <runId>')
      .description('poll until terminal status')
      .action(async (runId: string, opts: CommonOpts) => {
        await runAction(async () => {
          const c = buildClient();
          const final = await pollUntilTerminal(() => c.runs.get(runId));
          emit(final, opts.json === true);
        });
      }),
  );
  commonJson(
    cmd.command('delete <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().runs.delete(runId), opts.json === true));
    }),
  );
}

/** validation group (output-validations) */
export function registerValidation(program: Command): void {
  const cmd = program.command('validation').description('output validations');

  commonJson(
    commonWait(
      cmd
        .command('create <runId>')
        .requiredOption('--body <json|file|->', 'request body')
        .action(async (runId: string, opts: CommonOpts & { body: string }) => {
          await runAction(async () => {
            const c = buildClient();
            const created = await c.validations.create(runId, readBody(opts.body) as never);
            if (opts.wait !== true) {
              emit(created, opts.json === true);
              return;
            }
            const id = String(created['id'] ?? '');
            if (id.length === 0) {
              emit(created, opts.json === true);
              return;
            }
            emit(await pollUntilTerminal(() => c.validations.get(id)), opts.json === true);
          });
        }),
    ),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().validations.get(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('list <packId>').action(async (packId: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().validations.listForPack(packId), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('summary <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().validations.summary(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('cancel <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().validations.cancel(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('delete <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().validations.delete(id), opts.json === true),
      );
    }),
  );
}

/** rag-validation group */
export function registerRagValidation(program: Command): void {
  const cmd = program.command('rag-validation').description('RAG output validations');
  commonJson(
    cmd
      .command('create <runId>')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (runId: string, opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().ragValidations.create(runId, readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().ragValidations.get(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('list <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().ragValidations.listForRun(runId), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('cancel <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().ragValidations.cancel(id), opts.json === true),
      );
    }),
  );
}

/** session group */
export function registerSession(program: Command): void {
  const cmd = program.command('session').description('testing sessions');

  commonJson(
    cmd.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().sessions.list(), opts.json === true));
    }),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().sessions.get(id), opts.json === true));
    }),
  );
  commonJson(
    cmd
      .command('create')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().sessions.create(readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd.command('delete <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().sessions.delete(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('runs <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().sessions.listRuns(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('cancel-run <runId>').action(async (runId: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().sessions.cancelRun(runId), opts.json === true),
      );
    }),
  );
}

/** validator group (BYOV) */
export function registerValidator(program: Command): void {
  const cmd = program.command('validator').description('custom validators (BYOV)');

  commonJson(
    cmd.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().customValidators.list(), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().customValidators.get(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd
      .command('create')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().customValidators.create(readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd
      .command('update <id>')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (id: string, opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().customValidators.update(id, readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
  commonJson(
    cmd.command('delete <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().customValidators.delete(id), opts.json === true),
      );
    }),
  );
  commonJson(
    cmd
      .command('test <id>')
      .option('--body <json|file|->', 'request body')
      .action(async (id: string, opts: CommonOpts & { body?: string }) => {
        await runAction(async () =>
          emit(
            await buildClient().customValidators.test(id, readBody(opts.body) as never),
            opts.json === true,
          ),
        );
      }),
  );
}

/** P3 bonus groups — read-heavy, minimal surface. */
export function registerBonus(program: Command): void {
  const rag = program.command('rag-target').description('RAG integration targets');
  commonJson(
    rag.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().ragTargets.list(), opts.json === true));
    }),
  );
  commonJson(
    rag.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().ragTargets.get(id), opts.json === true));
    }),
  );

  const mcp = program.command('mcp-target').description('MCP integration targets');
  commonJson(
    mcp.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().mcpTargets.list(), opts.json === true));
    }),
  );
  commonJson(
    mcp.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().mcpTargets.get(id), opts.json === true));
    }),
  );

  const v = program.command('vulnerability').description('vulnerabilities catalog');
  commonJson(
    v.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().vulnerabilities.list(), opts.json === true),
      );
    }),
  );
  commonJson(
    v.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () =>
        emit(await buildClient().vulnerabilities.get(id), opts.json === true),
      );
    }),
  );

  const mr = program.command('mr').description('multi-turn jailbreak (MR)');
  commonJson(
    mr.command('list').action(async (opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().mr.list(), opts.json === true));
    }),
  );
  commonJson(
    mr.command('get <id>').action(async (id: string, opts: CommonOpts) => {
      await runAction(async () => emit(await buildClient().mr.get(id), opts.json === true));
    }),
  );
  commonJson(
    mr
      .command('create')
      .requiredOption('--body <json|file|->', 'request body')
      .action(async (opts: CommonOpts & { body: string }) => {
        await runAction(async () =>
          emit(await buildClient().mr.create(readBody(opts.body) as never), opts.json === true),
        );
      }),
  );
}
