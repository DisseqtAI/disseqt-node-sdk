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

export class DisseqtJsonError extends DisseqtError {
  readonly responseText: string;

  constructor(message: string, responseText = '', options?: ErrorOptions) {
    super(message, options);
    this.name = 'DisseqtJsonError';
    this.responseText = responseText;
  }
}
