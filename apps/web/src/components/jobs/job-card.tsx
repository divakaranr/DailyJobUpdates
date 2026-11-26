'use client';

import { toHashtag, type JobDTO } from '@jobs/shared';
import { ArrowUpRight, Share2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { cn, timeAgo } from '@/lib/utils';
import { BookmarkButton } from './bookmark-button';
import { CompanyLogo } from './company-logo';
import { DeadlineBadge, jobMetaItems } from './job-meta';

export function JobCard({ job, onBookmarkChange }: { job: JobDTO; onBookmarkChange?: (saved: boolean) => void }) {
  const expired = job.status === 'EXPIRED';
  const meta = jobMetaItems(job).slice(0, 5);
  const skills = job.skills.slice(0, 5);
  const hashtags = job.tags
    .filter((t) => ['JOB_CATEGORY', 'EXPERIENCE', 'WORK_MODE'].includes(t.category))
    .slice(0, 4)
    .map((t) => ({ slug: t.slug, category: t.category, label: toHashtag(t.name) }));
  const applyHref = job.applicationUrl ?? job.sourceUrl;

  const share = async () => {
    const url = `${window.location.origin}/jobs/${job.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${job.title} at ${job.company.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <article
      className={cn(
        'group relative animate-rise rounded-2xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop sm:p-6',
        expired && 'opacity-75 saturate-50 hover:opacity-100 hover:saturate-100',
      )}
      data-testid="job-card"
    >
      <div className="flex gap-4">
        <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-muted">{job.company.name}</p>
              <h3 className="mt-0.5 text-lg leading-snug font-bold text-fg">
                <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 hover:text-brand focus-visible:outline-none">
                  {job.title}
                </Link>
              </h3>
            </div>
            <div className="relative z-10 -mt-1 -mr-2 flex shrink-0 items-center">
              <Button variant="ghost" size="icon" onClick={share} aria-label="Share job">
                <Share2 className="h-[17px] w-[17px]" />
              </Button>
              <BookmarkButton jobId={job.id} initial={job.bookmarked} onChange={onBookmarkChange} />
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            <span>Posted {timeAgo(job.publishedAt)}</span>
            {job.sourceWebsite && (
              <>
                <span aria-hidden>·</span>
                <span>via {job.sourceWebsite}</span>
              </>
            )}
            <DeadlineBadge job={job} />
          </div>
        </div>
      </div>

      {job.summary && <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted">{job.summary}</p>}

      {meta.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
          {meta.map((m) => (
            <div key={m.key} className="flex min-w-0 items-center gap-2">
              <dt className="shrink-0 text-subtle [&>svg]:h-4 [&>svg]:w-4" title={m.label}>
                {m.icon}
                <span className="sr-only">{m.label}</span>
              </dt>
              <dd className="truncate text-fg">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <span key={s} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg">
              {s}
            </span>
          ))}
          {job.skills.length > skills.length && <span className="rounded-lg px-2 py-1 text-xs text-subtle">+{job.skills.length - skills.length} more</span>}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs font-medium text-brand">
          {hashtags.map((h) => (
            <span key={`${h.category}-${h.slug}`}>{h.label}</span>
          ))}
        </div>
        <div className="relative z-10 flex items-center gap-2">
          {expired && <Badge tone="danger">No longer accepting</Badge>}
          <LinkButton href={`/jobs/${job.id}`} variant="secondary" size="sm">
            View details
          </LinkButton>
          {applyHref && !expired && (
            <LinkButton href={applyHref} external size="sm" icon={<ArrowUpRight className="h-4 w-4" />}>
              Apply now
            </LinkButton>
          )}
        </div>
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex gap-4">
        <div className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-xl bg-surface-2" />
        <div className="flex-1 space-y-2.5">
          <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-16 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
