import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers';
import { describe, expect, it } from 'vitest';

import { GitDiffError, changedFiles, parseDiffRange } from '../../src/scan/index.js';

function makeSpawner(stdoutText: string, exitCode = 0): (...args: unknown[]) => EventEmitter {
  return () => {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    // Emit asynchronously so the caller has time to bind listeners.
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from(stdoutText, 'utf-8'));
      proc.emit('close', exitCode);
    });
    return proc;
  };
}

describe('gitDiff', () => {
  it('parses base..head', () => {
    expect(parseDiffRange('main..HEAD')).toEqual(['main', 'HEAD']);
  });
  it('parses base...head (three dots)', () => {
    expect(parseDiffRange('main...HEAD')).toEqual(['main', 'HEAD']);
  });
  it('rejects malformed spec', () => {
    expect(() => parseDiffRange('nope')).toThrow(GitDiffError);
  });

  it('changedFiles maps stdout lines to absolute paths under cwd', async () => {
    const spawner = makeSpawner('src/a.ts\nsrc/b.ts\n\n', 0);
    const files = await changedFiles('main..HEAD', '/repo', spawner as never);
    expect(files).toEqual(['/repo/src/a.ts', '/repo/src/b.ts']);
  });

  it('changedFiles surfaces non-zero git exits as GitDiffError', async () => {
    const spawner = makeSpawner('', 128);
    await expect(changedFiles('main..HEAD', '/repo', spawner as never)).rejects.toBeInstanceOf(
      GitDiffError,
    );
  });
});
