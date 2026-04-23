export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const Unauthorized = (message = 'unauthorized', code = 'unauthorized') =>
  new HttpError(401, code, message);
export const Forbidden = (message = 'forbidden', code = 'forbidden') =>
  new HttpError(403, code, message);
export const NotFound = (message = 'not_found', code = 'not_found') =>
  new HttpError(404, code, message);
export const Conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);
