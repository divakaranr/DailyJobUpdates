import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminJobQuerySchema,
  createUserSchema,
  generalSettingsSchema,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  llmSettingsSchema,
  updateUserSchema,
  type AuditLogDTO,
  type ExtractionLogDTO,
  type LlmProviderStatusDTO,
} from '@jobs/shared';
import type { Container } from '../container';
import { DEFAULT_MODELS, priceFor } from '../modules/llm/pricing';
import { PROMPTS } from '../modules/llm/prompts';
import { actorOf, requireRole } from '../plugins/auth';

const idParams = z.object({ id: z.string().min(1).max(64) });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function adminRoutes(app: FastifyInstance, { container }: { container: Container }) {
  const { prisma, jobs, settings, llm } = container;
  const editor = { preHandler: requireRole('EDITOR') };
  const admin = { preHandler: requireRole('ADMIN') };

  app.get('/admin/dashboard', editor, async () => container.dashboard.get());

  app.get('/admin/jobs', editor, async (req) => jobs.adminList(adminJobQuerySchema.parse(req.query)));
  app.get('/admin/jobs/pending', editor, async (req) => {
    const q = adminJobQuerySchema.parse(req.query);
    return jobs.adminList({ ...q, status: 'PENDING_APPROVAL' });
  });

  for (const action of ['approve', 'reject', 'publish', 'expire', 'archive', 'restore'] as const) {
    app.post(`/admin/jobs/:id/${action}`, admin, async (req) => {
      const { id } = idParams.parse(req.params);
      const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
      return jobs.transition(id, action, actorOf(req), { reason });
    });
  }

  app.post('/admin/jobs/:id/verify', editor, async (req) => {
    const { id } = idParams.parse(req.params);
    return container.verify.verify(id, req.auth!.id);
  });

  app.get('/admin/extraction-logs', admin, async (req) => {
    const q = pageSchema
      .extend({
        status: z.enum(['SUCCESS', 'FAILURE']).optional(),
        stage: z.enum(['FETCH', 'RENDER', 'LLM', 'PIPELINE']).optional(),
        extractionId: z.string().optional(),
      })
      .parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.stage ? { stage: q.stage } : {}),
      ...(q.extractionId ? { extractionId: q.extractionId } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.extractionLog.count({ where }),
      prisma.extractionLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const data: ExtractionLogDTO[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    return { data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
  });

  app.get('/admin/history', admin, async (req) => {
    const q = pageSchema.extend({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional(), action: z.string().max(40).optional() }).parse(req.query);
    const where = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const data: AuditLogDTO[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: (r.details as Record<string, unknown>) ?? null,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    }));
    return { data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
  });

  // Settings & LLM configuration (API keys are never returned — only whether they are set).
  app.get('/admin/settings', admin, async () => {
    const providers: LlmProviderStatusDTO[] = LLM_PROVIDERS.map((name) => {
      const price = priceFor(name, DEFAULT_MODELS[name]);
      return {
        name,
        label: LLM_PROVIDER_LABELS[name],
        configured: llm.providerStatus(name),
        defaultModel: DEFAULT_MODELS[name],
        costPer1MInput: price.input,
        costPer1MOutput: price.output,
      };
    });
    return {
      llm: await settings.getLlm(),
      general: await settings.getGeneral(),
      providers,
      promptVersions: Object.keys(PROMPTS),
      queue: container.queue.kind,
      browserRendering: container.env.ENABLE_BROWSER_RENDERING,
    };
  });

  app.put('/admin/settings/llm', admin, async (req) => {
    const value = await settings.setLlm(llmSettingsSchema.parse(req.body), req.auth!.id);
    await container.audit.log(req.auth!.id, 'SETTINGS_UPDATE', 'Setting', 'llm', { provider: value.provider, model: value.model });
    return value;
  });

  app.put('/admin/settings/general', admin, async (req) => {
    const value = await settings.setGeneral(generalSettingsSchema.partial().parse(req.body), req.auth!.id);
    await container.audit.log(req.auth!.id, 'SETTINGS_UPDATE', 'Setting', 'general', value as unknown as Record<string, unknown>);
    return value;
  });

  app.post('/admin/llm/test', { ...admin, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({ provider: z.enum(LLM_PROVIDERS), model: z.string().min(1).max(120) }).parse(req.body);
    return llm.testProvider(body.provider, body.model);
  });

  app.post('/admin/maintenance/run', admin, async () => container.maintenance.run());

  // User management
  app.get('/admin/users', admin, async (req) => {
    const q = pageSchema.extend({ q: z.string().trim().max(100).optional() }).parse(req.query);
    return container.users.list(q);
  });
  app.post('/admin/users', admin, async (req, reply) => {
    const user = await container.users.create(createUserSchema.parse(req.body), actorOf(req));
    return reply.code(201).send(user);
  });
  app.put('/admin/users/:id', admin, async (req) => {
    const { id } = idParams.parse(req.params);
    return container.users.update(id, updateUserSchema.parse(req.body), actorOf(req));
  });
}
