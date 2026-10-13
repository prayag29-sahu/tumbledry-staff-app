import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  if (err instanceof AppError) {
    logger.warn('[API] Application error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(env.NODE_ENV === 'development' && err.details ? { details: err.details } : {}),
      },
    } satisfies ApiError);
    return;
  }

  if (err instanceof ZodError) {
    logger.warn('[API] Validation error', { requestId, path: req.path });
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the entered values.',
        requestId,
        ...(env.NODE_ENV === 'development' ? { details: err.format() } : {}),
      },
    } satisfies ApiError);
    return;
  }

  // Unexpected errors — log the full error but never expose internals
  logger.error('[API] Unhandled error', {
    requestId,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
      requestId,
      ...(env.NODE_ENV === 'development' ? { details: err.message, stack: err.stack } : {}),
    },
  } satisfies ApiError);
}
