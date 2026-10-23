import { readFileSync } from 'node:fs';

/** Read a JSON body from `--body <file|json>` or `--body -` (stdin). */
export function readBody(input: string | undefined): unknown {
  if (input === undefined) return undefined;
  if (input === '-') {
    const raw = readFileSync(0, 'utf-8');
    return JSON.parse(raw);
  }
  if (input.startsWith('{') || input.startsWith('[')) {
    return JSON.parse(input);
  }
  return JSON.parse(readFileSync(input, 'utf-8'));
}
