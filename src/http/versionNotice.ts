/**
 * SDK version identity and the server-driven upgrade notice.
 *
 * Mirrors `disseqt_sdk._version` in the Python SDK: every request carries
 * the identity headers; after every response the transport checks whether
 * the server advertised a newer release (`X-SDK-Latest-Version`, set only
 * when this caller is outdated — no client-side version comparison) and
 * warns once per process per advertised version via `console.warn`, with
 * the server's free-text `X-SDK-Notice` appended verbatim. Fail-open by
 * construction: a version notice must never break or slow down an API
 * call. Opt out of the warning with `DISSEQT_SDK_DISABLE_VERSION_NOTICE=1`
 * (read once at module load; the request headers are still sent — version
 * telemetry is a design goal).
 */

import { SDK_LANGUAGE, SDK_VERSION, USER_AGENT } from '../version.js';

import { SDKVersionBlockedError } from './errors.js';

export const HEADER_SDK_VERSION = 'X-SDK-Version';
export const HEADER_SDK_LANG = 'X-SDK-Lang';
export const HEADER_SDK_LATEST_VERSION = 'X-SDK-Latest-Version';
export const HEADER_SDK_NOTICE = 'X-SDK-Notice';
/** RFC 8594 — the HTTP-date after which sub-floor callers are refused. */
export const HEADER_SUNSET = 'Sunset';

export const UPGRADE_COMMAND = 'npm install @disseqt-ai/sdk@latest';

/** The subset of the WHATWG `Headers` interface the notice machinery needs. */
export interface HeadersLike {
  get(name: string): string | null;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function readNoticeDisabled(): boolean {
  // globalThis.process keeps this module loadable on runtimes without a
  // Node process global (edge workers) — no env there means no opt-out.
  const raw = globalThis.process?.env?.DISSEQT_SDK_DISABLE_VERSION_NOTICE ?? '';
  return TRUTHY.has(raw.trim().toLowerCase());
}

let noticeDisabled = readNoticeDisabled();
let warnedVersions = new Set<string>();

/**
 * Test-only: clear the warn-once state and re-read the opt-out env var
 * (which is otherwise read once at module load).
 */
export function _resetVersionNoticeState(): void {
  noticeDisabled = readNoticeDisabled();
  warnedVersions = new Set<string>();
}

/**
 * The request headers identifying this SDK build: `X-SDK-Version` +
 * `X-SDK-Lang` are what production-monitoring's version middleware compares
 * against the latest Node release; `User-Agent` is the standard duplicate
 * for gateway/access logs.
 */
export function sdkIdentityHeaders(): Record<string, string> {
  return {
    [HEADER_SDK_VERSION]: SDK_VERSION,
    [HEADER_SDK_LANG]: SDK_LANGUAGE,
    'User-Agent': USER_AGENT,
  };
}

/**
 * Warn (once per process per advertised version) when the server says a
 * newer SDK exists. Every failure path — absent or malformed headers
 * included — is silence, never an error.
 */
export function checkVersionNotice(headers: HeadersLike): void {
  if (noticeDisabled) {
    return;
  }
  try {
    const latest = (headers.get(HEADER_SDK_LATEST_VERSION) ?? '').trim();
    if (latest.length === 0 || warnedVersions.has(latest)) {
      return;
    }
    warnedVersions.add(latest);
    let message =
      `@disseqt-ai/sdk ${SDK_VERSION} is outdated; ${latest} is available. ` +
      `Upgrade with: ${UPGRADE_COMMAND}.`;
    const notice = (headers.get(HEADER_SDK_NOTICE) ?? '').trim();
    if (notice.length > 0) {
      message = `${message} ${notice}`;
    }
    globalThis.console.warn(message);
  } catch {
    // The notice channel is strictly best-effort.
  }
}

/**
 * Build the typed 426 upgrade-required error, or `undefined` for any other
 * status. Never throws — it runs on an error path that must stay
 * dependable, so an unreadable body or headers degrades to a generic
 * self-explanatory message. The message prefers the server envelope's
 * `error.external` (which names the caller version, the floor, and the
 * fix), then `X-SDK-Notice`, then a generic upgrade line.
 */
export function versionBlockedError(
  statusCode: number,
  headers: HeadersLike,
  bodyText: string,
  context: { method?: string; url?: string } = {},
): SDKVersionBlockedError | undefined {
  if (statusCode !== 426) {
    return undefined;
  }
  let message = '';
  try {
    const envelope: unknown = JSON.parse(bodyText);
    if (typeof envelope === 'object' && envelope !== null) {
      const error = (envelope as { error?: unknown }).error;
      if (typeof error === 'object' && error !== null) {
        const external = (error as { external?: unknown }).external;
        if (typeof external === 'string') {
          message = external;
        }
      }
    }
  } catch {
    message = '';
  }
  let latest: string | undefined;
  let notice: string | undefined;
  let sunset: string | undefined;
  try {
    latest = headers.get(HEADER_SDK_LATEST_VERSION) ?? undefined;
    notice = headers.get(HEADER_SDK_NOTICE) ?? undefined;
    sunset = headers.get(HEADER_SUNSET) ?? undefined;
  } catch {
    latest = notice = sunset = undefined;
  }
  if (message.length === 0) {
    message =
      notice ??
      `this @disseqt-ai/sdk version is no longer supported; upgrade with: ${UPGRADE_COMMAND}`;
  }
  return new SDKVersionBlockedError(statusCode, message, bodyText.slice(0, 512), {
    ...context,
    latest,
    notice,
    sunset,
  });
}
