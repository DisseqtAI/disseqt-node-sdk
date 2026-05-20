export class DisseqtError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DisseqtError';
  }
}

export class DisseqtHttpError extends DisseqtError {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, message: string, responseBody = '') {
    super(`HTTP ${statusCode}: ${message}`);
    this.name = 'DisseqtHttpError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
