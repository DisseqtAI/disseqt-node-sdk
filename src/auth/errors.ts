import { DisseqtError } from '../http/errors.js';

/**
 * Base for anything auth-related. Extends `DisseqtError` so existing
 * catch-alls keep working; also lets consumers branch on `instanceof
 * DisseqtAuthError` without pulling in specific subclasses.
 */
export class DisseqtAuthError extends DisseqtError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DisseqtAuthError';
  }
}

/** No credentials found via constructor args, config file, or env vars. */
export class AuthMissingError extends DisseqtAuthError {
  constructor(
    message = 'No Disseqt credentials found — run `disseqt login`, pass ' +
      '{ apiKey, projectId } to the client, or set DISSEQT_API_KEY + ' +
      'DISSEQT_PROJECT_ID',
  ) {
    super(message);
    this.name = 'AuthMissingError';
  }
}

/**
 * Config file is readable but its permissions are wider than 0o600.
 * Refuse to read — a world-readable token is a security incident, not a
 * warning.
 */
export class AuthConfigPermissionError extends DisseqtAuthError {
  readonly path: string;
  readonly mode: number;

  constructor(path: string, mode: number) {
    super(
      `refusing to read ${path}: permissions ${mode.toString(8).padStart(3, '0')} are ` +
        'wider than 0600 — run `chmod 600` on the file or delete it and re-login',
    );
    this.name = 'AuthConfigPermissionError';
    this.path = path;
    this.mode = mode;
  }
}
