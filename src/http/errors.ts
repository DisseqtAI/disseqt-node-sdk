export class DisseqtError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DisseqtError';
  }
}

export class DisseqtHttpError extends DisseqtError {
  readonly statusCode: number;
  readonly responseBody: string;
  readonly method: string | undefined;
  readonly url: string | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody = '',
    context: { method?: string; url?: string; cause?: unknown } = {},
  ) {
    super(`HTTP ${statusCode}: ${message}`);
    this.name = 'DisseqtHttpError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.method = context.method;
    this.url = context.url;

    if (context.cause !== undefined) {
      this.cause = context.cause;
    }
  }
}

/**
 * The server refused this call with HTTP 426 (DSQ-4260): the installed SDK
 * is below the enforced minimum version — permanently, or during a
 * scheduled brownout rehearsal ahead of the announced cutoff (carried in
 * `sunset`).
 *
 * Extends {@link DisseqtHttpError}, so existing `catch` blocks keyed on
 * that class keep working unchanged; check for this type to branch
 * specifically on "upgrade required" — page the platform team, apply a
 * deliberate fail-open/fail-closed policy, or trigger upgrade automation.
 * The remedy is always: `npm install @disseqt-ai/sdk@latest`. Named to
 * match `SDKVersionBlockedError` in the Python SDK.
 */
export class SDKVersionBlockedError extends DisseqtHttpError {
  /** `X-SDK-Latest-Version` response header, if present. */
  readonly latest: string | undefined;
  /** `X-SDK-Notice` response header, if present. */
  readonly notice: string | undefined;
  /** RFC 8594 `Sunset` response header (the cutoff date), if present. */
  readonly sunset: string | undefined;

  constructor(
    statusCode: number,
    message: string,
    responseBody = '',
    context: {
      method?: string;
      url?: string;
      cause?: unknown;
      latest?: string | undefined;
      notice?: string | undefined;
      sunset?: string | undefined;
    } = {},
  ) {
    super(statusCode, message, responseBody, context);
    this.name = 'SDKVersionBlockedError';
    this.latest = context.latest;
    this.notice = context.notice;
    this.sunset = context.sunset;
  }
}

export class DisseqtJsonError extends DisseqtError {
  readonly responseText: string;

  constructor(message: string, responseText = '', options?: ErrorOptions) {
    super(message, options);
    this.name = 'DisseqtJsonError';
    this.responseText = responseText;
  }
}
