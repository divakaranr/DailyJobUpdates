import type { PrismaClient, Tag } from '@prisma/client';
import type { z } from 'zod';
import { normalizeKey, slugify, type TagCategory, type TagDTO, type TagRef, tagInputSchema } from '@jobs/shared';
import { conflict, forbidden, notFound } from '../../lib/errors';
import type { AuditService } from '../audit/audit.service';

type TagInput = z.infer<typeof tagInputSchema>;

export function toTagDTO(tag: Tag & { _count?: { jobs: number } }): TagDTO {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    category: tag.category,
    synonyms: tag.synonyms,
    description: tag.description,
    isActive: tag.isActive,
    isSystem: tag.isSystem,
    ...(tag._count ? { jobCount: tag._count.jobs } : {}),
  };
}

function dedupeSynonyms(list: string[], name: string): string[] {
  const seen = new Set([normalizeKey(name)]);
  const out: string[] = [];
  for (const s of list) {
    const k = normalizeKey(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim().toLowerCase());
  }
  return out;
}

export class TagsService {
  private taxonomyCache: { value: TagRef[]; expires: number } | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { includeInactive?: boolean; category?: TagCategory; withCounts?: boolean } = {}): Promise<TagDTO[]> {
    const tags = await this.prisma.tag.findMany({
      where: { ...(opts.includeInactive ? {} : { isActive: true }), ...(opts.category ? { category: opts.category } : {}) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: opts.withCounts ? { _count: { select: { jobs: true } } } : undefined,
    });
    return tags.map(toTagDTO);
  }

  /** Active taxonomy used by the tagging engine (cached briefly). */
  async taxonomy(): Promise<TagRef[]> {
    if (this.taxonomyCache && this.taxonomyCache.expires > Date.now()) return this.taxonomyCache.value;
    const tags = await this.prisma.tag.findMany({ where: { isActive: true } });
    const value = tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, category: t.category, synonyms: t.synonyms }));
    this.taxonomyCache = { value, expires: Date.now() + 30_000 };
    return value;
  }

  invalidate() {
    this.taxonomyCache = null;
  }

  /** Rejects a tag that duplicates an existing one by slug, name or synonym within the category. */
  private async assertNoDuplicate(category: TagCategory, name: string, excludeId?: string) {
    const slug = slugify(name);
    const key = normalizeKey(name);
    const existing = await this.prisma.tag.findMany({ where: { category, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    const dup = existing.find(
      (t) => t.slug === slug || normalizeKey(t.name) === key || t.synonyms.some((s) => normalizeKey(s) === key),
    );
    if (dup) {
      throw conflict('DUPLICATE_TAG', `A matching tag already exists: "${dup.name}"`, { existing: toTagDTO(dup) });
    }
  }

  async create(input: TagInput, userId: string): Promise<TagDTO> {
    await this.assertNoDuplicate(input.category, input.name);
    const tag = await this.prisma.tag.create({
      data: {
        name: input.name.trim(),
        slug: slugify(input.name),
        category: input.category,
        synonyms: dedupeSynonyms(input.synonyms, input.name),
        description: input.description ?? null,
        isActive: input.isActive,
      },
    });
    await this.audit.log(userId, 'TAG_CREATE', 'Tag', tag.id, { name: tag.name, category: tag.category });
    this.invalidate();
    return toTagDTO(tag);
  }

  async update(id: string, input: Partial<TagInput>, userId: string): Promise<TagDTO> {
    const current = await this.prisma.tag.findUnique({ where: { id } });
    if (!current) throw notFound('Tag');
    const name = input.name?.trim() ?? current.name;
    const category = input.category ?? current.category;
    if (current.isSystem && (category !== current.category || slugify(name) !== current.slug)) {
      throw forbidden('System tags cannot be renamed or moved to another category (you can edit synonyms or deactivate them).');
    }
    if (input.name || input.category) await this.assertNoDuplicate(category, name, id);
    const tag = await this.prisma.tag.update({
      where: { id },
      data: {
        name,
        slug: slugify(name),
        category,
        synonyms: input.synonyms ? dedupeSynonyms(input.synonyms, name) : undefined,
        description: input.description === undefined ? undefined : input.description,
        isActive: input.isActive,
      },
    });
    await this.audit.log(userId, 'TAG_UPDATE', 'Tag', id, { changes: input });
    this.invalidate();
    return toTagDTO(tag);
  }

  async remove(id: string, userId: string): Promise<void> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw notFound('Tag');
    if (tag.isSystem) throw forbidden('System tags cannot be deleted — deactivate them instead.');
    await this.prisma.tag.delete({ where: { id } });
    await this.audit.log(userId, 'TAG_DELETE', 'Tag', id, { name: tag.name, category: tag.category });
    this.invalidate();
  }
}
