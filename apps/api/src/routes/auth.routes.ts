import type { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema } from '@jobs/shared';
import type { Container } from '../container';
import { clearSessionCookie, setSessionCookie } from '../plugins/auth';

export async function authRoutes(app: FastifyInstance, { container }: { container: Container }) {
  const strict = { config: { rateLimit: { max: container.env.AUTH_RATE_LIMIT_PER_MIN, timeWindow: '1 minute' } } };
  const sign = (id: string) => app.jwt.sign({ sub: id }, { expiresIn: `${container.env.SESSION_TTL_DAYS}d` });

  app.post('/auth/register', strict, async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const user = await container.auth.register(input);
    setSessionCookie(reply, container, sign(user.id));
    return reply.code(201).send({ user });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const user = await container.auth.login(input.email, input.password);
    setSessionCookie(reply, container, sign(user.id));
    return { user };
  });

  app.post('/auth/logout', async (_req, reply) => {
    clearSessionCookie(reply, container);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => ({ user: req.auth }));
}
