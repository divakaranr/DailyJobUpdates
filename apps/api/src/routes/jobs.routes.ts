import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jobInputSchema, jobQuerySchema } from '@jobs/shared';
import type { Container } from '../container';
import { notFound } from '../lib/errors';
import { jobInclude, toJobDTO } from '../modules/jobs/jobs.mapper';
import { actorOf, requireRole, requireUser } from '../plugins/auth';

const idParams = z.object({ id: z.string().min(1).max(64) });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export async function jobsRoutes(app: FastifyInstance, { container }: { container: Container }) {
  const { jobs, search, prisma } = container;

  const list = async (req: { query: unknown; auth: { id: string } | null }) =>
    search.search(jobQuerySchema.parse(req.query), { userId: req.auth?.id });
  app.get('/jobs', async (req) => list(req));
  app.get('/jobs/search', async (req) => list(req));

  app.post('/jobs/preview', { preHandler: requireRole('EDITOR') }, async (req) => {
    const { excludeJobId } = z.object({ excludeJobId: z.string().optional() }).parse(req.query);
    return jobs.preview(jobInputSchema.parse(req.body), { excludeJobId });
  });

  app.get('/jobs/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return jobs.getForViewer(id, req.auth);
  });

  app.get('/jobs/:id/similar', async (req) => {
    const { id } = idParams.parse(req.params);
    return { data: await jobs.similar(id) };
  });

  app.post('/jobs', { preHandler: requireRole('EDITOR') }, async (req, reply) => {
    const job = await jobs.create(jobInputSchema.parse(req.body), actorOf(req), { sourceType: 'MANUAL' });
    return reply.code(201).send(job);
  });

  app.put('/jobs/:id', { preHandler: requireRole('EDITOR') }, async (req) => {
    const { id } = idParams.parse(req.params);
    return jobs.update(id, jobInputSchema.parse(req.body), actorOf(req));
  });

  app.delete('/jobs/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await jobs.remove(id, actorOf(req));
    return reply.code(204).send();
  });

  // Bookmarks
  app.post('/jobs/:id/bookmark', { preHandler: requireUser }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const job = await prisma.job.findFirst({ where: { id, status: { in: ['PUBLISHED', 'EXPIRED'] } }, select: { id: true } });
    if (!job) throw notFound('Job');
    await prisma.bookmark.upsert({
      where: { userId_jobId: { userId: req.auth!.id, jobId: id } },
      create: { userId: req.auth!.id, jobId: id },
      update: {},
    });
    return reply.code(201).send({ bookmarked: true });
  });

  app.delete('/jobs/:id/bookmark', { preHandler: requireUser }, async (req) => {
    const { id } = idParams.parse(req.params);
    await prisma.bookmark.deleteMany({ where: { userId: req.auth!.id, jobId: id } });
    return { bookmarked: false };
  });

  app.get('/bookmarks', { preHandler: requireUser }, async (req) => {
    const { page, pageSize } = pageQuery.parse(req.query);
    const where = { userId: req.auth!.id };
    const [total, rows] = await Promise.all([
      prisma.bookmark.count({ where }),
      prisma.bookmark.findMany({
        where,
        include: { job: { include: jobInclude } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => ({ ...toJobDTO(r.job, { full: false, bookmarked: true }), bookmarkedAt: r.createdAt.toISOString() })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  });

  // Autocomplete & facets
  app.get('/skills', async (req) => {
    const { q } = z.object({ q: z.string().trim().max(60).optional() }).parse(req.query);
    const skills = await prisma.skill.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { jobs: { _count: 'desc' } },
      take: 20,
      select: { name: true },
    });
    return { data: skills.map((s) => s.name) };
  });

  app.get('/companies', async (req) => {
    const { q } = z.object({ q: z.string().trim().max(60).optional() }).parse(req.query);
    const companies = await prisma.company.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { jobs: { _count: 'desc' } },
      take: 20,
      select: { id: true, name: true, logoUrl: true, website: true },
    });
    return { data: companies };
  });

  app.get('/meta/filters', async () => {
    const [locations, companies, totals] = await Promise.all([
      prisma.job.groupBy({
        by: ['location'],
        where: { status: 'PUBLISHED', location: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { location: 'desc' } },
        take: 15,
      }),
      prisma.company.findMany({
        where: { jobs: { some: { status: 'PUBLISHED' } } },
        orderBy: { jobs: { _count: 'desc' } },
        take: 15,
        select: { name: true },
      }),
      prisma.job.groupBy({ by: ['status'], where: { status: { in: ['PUBLISHED', 'EXPIRED'] } }, _count: { _all: true } }),
    ]);
    return {
      locations: locations.map((l) => ({ name: l.location!, count: l._count._all })),
      companies: companies.map((c) => c.name),
      activeJobs: totals.find((t) => t.status === 'PUBLISHED')?._count._all ?? 0,
      expiredJobs: totals.find((t) => t.status === 'EXPIRED')?._count._all ?? 0,
    };
  });
}
