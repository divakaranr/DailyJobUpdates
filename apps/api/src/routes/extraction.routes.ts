import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EXTRACTION_STATUSES, extractionSubmitSchema, jobInputSchema } from '@jobs/shared';
import type { Container } from '../container';
import { actorOf, requireRole } from '../plugins/auth';

const idParams = z.object({ id: z.string().min(1).max(64) });

export async function extractionRoutes(app: FastifyInstance, { container }: { container: Container }) {
  const { extraction } = container;
  app.addHook('preHandler', requireRole('EDITOR'));

  app.post(
    '/extractions',
    {
      config: {
        rateLimit: {
          max: container.env.EXTRACTION_RATE_LIMIT_PER_MIN,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.auth?.id ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const body = extractionSubmitSchema.parse(req.body);
      const result = await extraction.submit(body.url, actorOf(req), { forceBrowser: body.forceBrowser });
      return reply.code(202).send(result);
    },
  );

  app.get('/extractions', async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(EXTRACTION_STATUSES).optional(),
      })
      .parse(req.query);
    return extraction.list(q);
  });

  app.get('/extractions/:id', async (req) => extraction.get(idParams.parse(req.params).id));

  app.post('/extractions/:id/retry', async (req) => {
    const { forceBrowser } = z.object({ forceBrowser: z.boolean().optional() }).parse(req.body ?? {});
    return extraction.retry(idParams.parse(req.params).id, actorOf(req), { forceBrowser });
  });

  app.post('/extractions/:id/discard', async (req) => extraction.discard(idParams.parse(req.params).id, actorOf(req)));

  app.post('/extractions/:id/publish', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { updateJobId } = z.object({ updateJobId: z.string().min(1).max(64).optional() }).parse({ updateJobId: body.updateJobId });
    const job = await extraction.publish(id, jobInputSchema.parse(body), actorOf(req), { updateJobId });
    return reply.code(201).send(job);
  });
}
