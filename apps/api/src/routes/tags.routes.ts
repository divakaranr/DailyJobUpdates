import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasRole, TAG_CATEGORIES, tagInputSchema, tagUpdateSchema } from '@jobs/shared';
import type { Container } from '../container';
import { requireRole } from '../plugins/auth';

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function tagsRoutes(app: FastifyInstance, { container }: { container: Container }) {
  const { tags } = container;

  app.get('/tags', async (req) => {
    const q = z
      .object({ all: z.enum(['true', 'false']).optional(), category: z.enum(TAG_CATEGORIES).optional() })
      .parse(req.query);
    const admin = hasRole(req.auth?.role, 'EDITOR');
    return {
      data: await tags.list({ includeInactive: admin && q.all === 'true', withCounts: admin && q.all === 'true', category: q.category }),
    };
  });

  // Editors may add tags while creating jobs; duplicates are rejected.
  app.post('/tags', { preHandler: requireRole('EDITOR') }, async (req, reply) => {
    const tag = await tags.create(tagInputSchema.parse(req.body), req.auth!.id);
    return reply.code(201).send(tag);
  });

  app.put('/tags/:id', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = idParams.parse(req.params);
    return tags.update(id, tagUpdateSchema.parse(req.body), req.auth!.id);
  });

  app.delete('/tags/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await tags.remove(id, req.auth!.id);
    return reply.code(204).send();
  });
}
