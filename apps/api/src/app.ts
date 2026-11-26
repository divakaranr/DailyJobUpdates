import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { Prisma } from '@prisma/client';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { Container } from './container';
import { AppError } from './lib/errors';
import { registerAuth, SESSION_COOKIE } from './plugins/auth';
import { adminRoutes } from './routes/admin.routes';
import { authRoutes } from './routes/auth.routes';
import { extractionRoutes } from './routes/extraction.routes';
import { jobsRoutes } from './routes/jobs.routes';
import { tagsRoutes } from './routes/tags.routes';

export async function buildApp(container: Container, opts: { logger?: FastifyServerOptions['logger'] } = {}) {
  const { env } = container;
  const app = Fastify({
    logger:
      opts.logger ??
      (env.NODE_ENV === 'development'
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } } }
        : { level: env.LOG_LEVEL, redact: ['req.headers.cookie', 'req.headers.authorization'] }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  await app.register(cookie);
  await app.register(jwt, { secret: env.JWT_SECRET, cookie: { cookieName: SESSION_COOKIE, signed: false } });
  registerAuth(app, container);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (req) => req.auth?.id ?? req.ip,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0] ? `${err.issues[0].path.join('.') || 'input'}: ${err.issues[0].message}` : 'Invalid input',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A record with these values already exists' } });
      if (err.code === 'P2025') return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: status === 429 ? 'RATE_LIMITED' : 'BAD_REQUEST', message: (err as Error).message } });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` } });
  });

  app.get('/api/health', async () => {
    await container.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', queue: container.queue.kind, time: new Date().toISOString() };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { container });
      await api.register(jobsRoutes, { container });
      await api.register(tagsRoutes, { container });
      await api.register(extractionRoutes, { container });
      await api.register(adminRoutes, { container });
    },
    { prefix: '/api' },
  );

  return app;
}
