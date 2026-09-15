import { Command } from 'commander';

import { SDK_VERSION } from '../version.js';
import {
  registerBonus,
  registerPack,
  registerRagValidation,
  registerRun,
  registerSession,
  registerTarget,
  registerValidation,
  registerValidator,
} from './commands.js';

const program = new Command();
program
  .name('disseqt')
  .description('Disseqt CLI — targets, packs, runs, validations, sessions')
  .version(SDK_VERSION);

registerTarget(program);
registerPack(program);
registerRun(program);
registerValidation(program);
registerRagValidation(program);
registerSession(program);
registerValidator(program);
registerBonus(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
});
