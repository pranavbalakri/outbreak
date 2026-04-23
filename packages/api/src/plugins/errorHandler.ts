import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { HttpError } from '../errors.js';
import { reportError } from '../lib/observability.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
          requestId,
        },
      });
    }

    // DB-level week-lock trigger (see phase5 migration) surfaces as a Prisma
    // known error with message prefix `week_locked:` — translate to 409 so the
    // API contract matches what the JS-level check in timeEntries.ts returns.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      typeof error.message === 'string' &&
      error.message.includes('week_locked:')
    ) {
      return reply.status(409).send({
        error: {
          code: 'week_locked',
          message: 'ISO week is locked; edits are not permitted.',
          requestId,
        },
      });
    }

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      });
    }

    const fastifyErr = error as { statusCode?: number; code?: string; message?: string };
    if (
      typeof fastifyErr.statusCode === 'number' &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode < 500
    ) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.code ?? 'client_error',
          message: fastifyErr.message ?? 'Client error',
          requestId,
        },
      });
    }

    request.log.error({ err: error, requestId }, 'Unhandled error');
    reportError(error);
    return reply.status(500).send({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
        requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'not_found',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });
}
