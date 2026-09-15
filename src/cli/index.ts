import { Command } from 'commander';

import { SDK_VERSION } from '../version.js';
import {
  registerBonus,
  registerPack,
  registerPlan,
  registerPlanRun,
  registerRagValidation,
  registerRun,
  registerSession,
  registerTarget,
  registerValidation,
  registerValidator,
} from './commands.js';
import { registerScan } from './scan.js';

const program = new Command();
program
  .name('disseqt')
  .description('Disseqt CLI — targets, packs, runs, validations, sessions, scan')
  .version(SDK_VERSION);

registerTarget(program);
registerPack(program);
registerRun(program);
registerValidation(program);
registerRagValidation(program);
registerSession(program);
registerValidator(program);
registerBonus(program);
registerScan(program);
registerPlan(program);
registerPlanRun(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
});
