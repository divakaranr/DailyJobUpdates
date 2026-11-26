import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasRole, type Role } from '@jobs/shared';
import { appOrigins } from '../config/env';
import type { Container } from '../container';
import { AppError, forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'jp_session';
export const CSRF_HEADER = 'x-requested-with';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function registerAuth(app: FastifyInstance, container: Container) {
  const origins = new Set(appOrigins(container.env));
  app.decorateRequest('auth', null);

  // CSRF defence-in-depth: SameSite=Lax cookies + Origin allow-list + custom header
  // (a custom header cannot be set cross-site without a CORS preflight, which we never grant).
  app.addHook('onRequest', async (req) => {
    if (!UNSAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin && !origins.has(origin.replace(/\/$/, ''))) {
      throw new AppError(403, 'CSRF_ORIGIN', 'Cross-origin request blocked');
    }
    if (req.headers[CSRF_HEADER] !== 'fetch') {
      throw new AppError(403, 'CSRF_HEADER', `Missing ${CSRF_HEADER} header`);
    }
  });

  app.addHook('onRequest', async (req) => {
    req.auth = null;
    if (!req.cookies?.[SESSION_COOKIE]) return;
    try {
      const payload = await req.jwtVerify<{ sub: string }>();
      const user = await container.auth.getActiveUser(payload.sub);
      if (user) req.auth = { id: user.id, name: user.name, email: user.email, role: user.role };
    } catch {
      req.auth = null;
    }
  });
}

export function setSessionCookie(reply: FastifyReply, container: Container, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: container.env.COOKIE_SECURE,
    path: '/',
    maxAge: container.env.SESSION_TTL_DAYS * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply, container: Container) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: container.env.COOKIE_SECURE });
}

/** preHandler factory enforcing a minimum role. */
export function requireRole(min: Role) {
  return async (req: FastifyRequest) => {
    if (!req.auth) throw unauthorized();
    if (!hasRole(req.auth.role, min)) throw forbidden();
  };
}

export const requireUser = requireRole('VIEWER');

export function actorOf(req: FastifyRequest) {
  if (!req.auth) throw unauthorized();
  return { id: req.auth.id, role: req.auth.role };
}
