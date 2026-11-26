import type { Prisma, PrismaClient } from '@prisma/client';
import { formatJobPost, type ExtractionFlag, type ExtractionResultDTO } from '@jobs/shared';
import type { Env } from '../../config/env';
import { ExtractionError, errorMessage } from '../../lib/errors';
import type { DuplicatesService } from '../duplicates/duplicates.service';
import type { LlmService } from '../llm/llm.service';
import type { ExtractionContext } from '../llm/types';
import type { SettingsService } from '../settings/settings.service';
import type { TagsService } from '../tags/tags.service';
import { assignTags } from '@jobs/shared';
import type { BrowserRenderer } from './browser';
import type { PageFetcher } from './fetcher';
import { parseHtml, type ParsedPage } from './html';
import { buildDraft } from './normalize';
import { SsrfError } from './ssrf';

const MIN_USEFUL_TEXT = 400;

const blockedError = (kind: 'captcha' | 'login') =>
  new ExtractionError(
    `This page is protected by ${kind === 'captcha' ? 'a CAPTCHA / bot check' : 'a login wall'}. Automated extraction does not bypass such protections — please create the job manually.`,
  );

export interface StageLog {
  extractionId: string;
  sourceUrl: string;
  stage: 'FETCH' | 'RENDER' | 'PIPELINE';
  status: 'SUCCESS' | 'FAILURE';
  durationMs: number;
  errorMessage?: string;
}

/**
 * URL → reviewable draft. Steps: SSRF-safe fetch (robots.txt aware) → Cheerio
 * cleanup → Playwright fallback for JS pages → LLM structured extraction →
 * grounding/normalisation → tagging → duplicate detection → post preview.
 * The pipeline never publishes; a human approves the result.
 */
export class ExtractionPipeline {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
    private readonly fetcher: PageFetcher,
    private readonly browser: BrowserRenderer,
    private readonly llm: LlmService,
    private readonly tags: TagsService,
    private readonly duplicates: DuplicatesService,
    private readonly settings: SettingsService,
  ) {}

  private async log(entry: StageLog) {
    await this.prisma.extractionLog.create({
      data: { ...entry, errorMessage: entry.errorMessage?.slice(0, 2000) ?? null },
    });
  }

  async run(extractionId: string): Promise<void> {
    const ex = await this.prisma.extraction.findUnique({ where: { id: extractionId } });
    if (!ex || ex.status === 'PUBLISHED' || ex.status === 'DISCARDED') return;
    await this.prisma.extraction.update({
      where: { id: ex.id },
      data: { status: 'FETCHING', attempts: { increment: 1 }, startedAt: new Date(), error: null, completedAt: null },
    });
    const started = Date.now();
    try {
      const general = await this.settings.getGeneral();
      const flags: ExtractionFlag[] = [];
      let page: ParsedPage | null = null;
      let finalUrl = ex.sourceUrl;
      let method: 'STATIC' | 'BROWSER' = 'STATIC';
      let httpStatus: number | null = null;

      if (!ex.forceBrowser) {
        const t = Date.now();
        try {
          const res = await this.fetcher.fetchPage(ex.sourceUrl, { checkRobots: general.respectRobotsTxt });
          httpStatus = res.status;
          finalUrl = res.url;
          page = parseHtml(res.body, res.url);
          await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'FETCH', status: 'SUCCESS', durationMs: Date.now() - t });
        } catch (err) {
          await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'FETCH', status: 'FAILURE', durationMs: Date.now() - t, errorMessage: errorMessage(err) });
          // Policy/safety failures must not fall through to the browser.
          if (err instanceof SsrfError) throw new ExtractionError(err.message);
          if (err instanceof ExtractionError && !err.retryable) throw err;
        }
      } else if (general.respectRobotsTxt) {
        await this.fetcher.assertRobotsAllowed(ex.sourceUrl);
      }

      // A CAPTCHA/login wall on the static fetch is final: retrying with a real browser
      // would be an attempt to get around the site's protection.
      if (page?.blocked) throw blockedError(page.blocked);

      const needsBrowser = !page || page.looksDynamic || (page.text.length < MIN_USEFUL_TEXT && !page.jsonLd);
      if (needsBrowser && this.env.ENABLE_BROWSER_RENDERING) {
        const t = Date.now();
        try {
          const rendered = await this.browser.render(finalUrl);
          const p2 = parseHtml(rendered.html, rendered.finalUrl);
          if (!page || p2.text.length > page.text.length || p2.blocked) {
            page = p2;
            finalUrl = rendered.finalUrl;
            method = 'BROWSER';
            httpStatus = rendered.status ?? httpStatus;
          }
          await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'RENDER', status: 'SUCCESS', durationMs: Date.now() - t });
        } catch (err) {
          await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'RENDER', status: 'FAILURE', durationMs: Date.now() - t, errorMessage: errorMessage(err) });
          if (page) flags.push({ level: 'info', message: `JavaScript rendering was unavailable (${errorMessage(err).slice(0, 120)}); used static HTML.` });
        }
      }

      if (!page) throw new ExtractionError('Could not retrieve the page content.', true);
      if (page.blocked) throw blockedError(page.blocked);
      if (page.text.length < 120 && !page.jsonLd) {
        throw new ExtractionError('The page has too little readable content to extract a job posting.');
      }

      await this.prisma.extraction.update({
        where: { id: ex.id },
        data: {
          status: 'EXTRACTING',
          fetchMethod: method,
          httpStatus,
          pageTitle: page.title?.slice(0, 300) ?? null,
          contentHash: page.contentHash,
          cleanedText: page.text.slice(0, 60_000),
        },
      });

      const ctx: ExtractionContext = {
        sourceUrl: finalUrl,
        pageTitle: page.title,
        text: page.text,
        jsonLd: page.jsonLd,
        meta: { siteName: page.meta.siteName, ogTitle: page.meta.ogTitle, description: page.meta.description },
        applyLinks: page.applyLinks,
        links: page.links,
        logoUrl: page.logoUrl,
      };
      const llm = await this.llm.extractJob(ctx, { extractionId });
      for (const note of llm.fallbackNotes) flags.push({ level: 'warning', message: `Fallback used — ${note}` });
      if (llm.provider === 'heuristic') {
        flags.push({ level: 'info', message: 'Extracted with the rule-based extractor (no LLM). Review fields carefully; no summary was generated.' });
      }

      const built = buildDraft(llm.extraction, ctx, ex.sourceUrl);
      const taxonomy = await this.tags.taxonomy();
      const suggestedTags = assignTags(
        { ...built.draft, category: llm.extraction.category, suggestedTags: llm.extraction.suggestedTags },
        taxonomy,
      );
      built.draft.tagIds = suggestedTags.map((t) => t.id).filter(Boolean) as string[];

      const duplicates = await this.duplicates.findCandidates({
        title: built.draft.title,
        companyName: built.draft.companyName,
        location: built.draft.location,
        sourceUrl: built.draft.sourceUrl,
        applicationUrl: built.draft.applicationUrl,
      });
      if (duplicates.some((d) => d.isLikelyDuplicate)) {
        flags.push({ level: 'error', message: 'A matching job already exists. Review the duplicate before publishing.' });
      }

      const result: ExtractionResultDTO = {
        draft: built.draft,
        fieldMeta: built.fieldMeta,
        suggestedTags,
        flags: [...built.flags, ...flags],
        duplicates,
        postPreview: formatJobPost(
          { ...built.draft, tags: suggestedTags },
          { showUnavailable: general.showUnavailableFields, notSpecifiedText: general.notSpecifiedText, includeHashtags: true, includeSource: general.includeSourceAttribution },
        ),
        provider: llm.provider,
        model: llm.model,
        promptVersion: llm.promptVersion,
      };

      await this.prisma.extraction.update({
        where: { id: ex.id },
        data: { status: 'READY', result: result as unknown as Prisma.InputJsonValue, completedAt: new Date() },
      });
      await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'PIPELINE', status: 'SUCCESS', durationMs: Date.now() - started });
    } catch (err) {
      const message = errorMessage(err);
      await this.prisma.extraction.update({
        where: { id: ex.id },
        data: { status: 'FAILED', error: message.slice(0, 2000), completedAt: new Date() },
      });
      await this.log({ extractionId, sourceUrl: ex.sourceUrl, stage: 'PIPELINE', status: 'FAILURE', durationMs: Date.now() - started, errorMessage: message });
    }
  }
}
