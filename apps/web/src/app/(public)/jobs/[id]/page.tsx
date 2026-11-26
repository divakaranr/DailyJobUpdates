import { formatYmd, JOB_STATUS_LABELS, TAG_CATEGORY_LABELS, type JobDTO, type TagCategory } from '@jobs/shared';
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookmarkButton } from '@/components/jobs/bookmark-button';
import { CompanyLogo } from '@/components/jobs/company-logo';
import { DeadlineBadge, jobMetaItems } from '@/components/jobs/job-meta';
import { PostPreview } from '@/components/jobs/post-preview';
import { ShareButton } from '@/components/jobs/share-button';
import { StaffJobActions } from '@/components/jobs/staff-job-actions';
import { LinkButton } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/primitives';
import { serverApi } from '@/lib/server-api';
import { formatDateTime, timeAgo } from '@/lib/utils';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const job = await serverApi<JobDTO>(`/jobs/${id}`);
  if (!job) return { title: 'Job not found' };
  return {
    title: `${job.title} at ${job.company.name}`,
    description: job.summary ?? `${job.title} — ${job.company.name}${job.location ? `, ${job.location}` : ''}`,
  };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const job = await serverApi<JobDTO>(`/jobs/${id}`);
  if (!job) notFound();
  const similar = (await serverApi<{ data: JobDTO[] }>(`/jobs/${id}/similar`))?.data ?? [];
  const expired = job.status === 'EXPIRED';
  const applyHref = job.applicationUrl ?? job.sourceUrl;
  const meta = jobMetaItems(job);
  const tagGroups = job.tags.reduce<Record<string, typeof job.tags>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      {job.status !== 'PUBLISHED' && (
        <div className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${expired ? 'border-danger/30 bg-danger-soft text-danger' : 'border-warning/30 bg-warning-soft text-warning'}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {expired ? (
              <>
                <strong>This job has expired.</strong> It is kept here for reference
                {job.expiredAt ? ` (expired ${timeAgo(job.expiredAt)})` : ''}. It may no longer be accepting applications.
              </>
            ) : (
              <>
                <strong>Preview — {JOB_STATUS_LABELS[job.status]}.</strong> This listing is not visible to the public.
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-brand/80 via-accent/70 to-brand/60 sm:h-28" aria-hidden />
            <div className="px-5 pb-6 sm:px-8">
              <div className="-mt-10 flex items-end justify-between gap-4">
                <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} size={84} className="border-4 border-surface shadow-md" />
                <div className="flex items-center gap-1">
                  <ShareButton title={`${job.title} at ${job.company.name}`} />
                  <BookmarkButton jobId={job.id} initial={job.bookmarked} withLabel />
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-muted">
                {job.company.website ? (
                  <a href={job.company.website} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-brand">
                    {job.company.name}
                  </a>
                ) : (
                  job.company.name
                )}
              </p>
              <h1 className="mt-1 text-2xl leading-tight font-extrabold tracking-tight text-fg sm:text-3xl">{job.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Posted {timeAgo(job.publishedAt)}
                </span>
                <DeadlineBadge job={job} />
                {job.isFresherFriendly && <Badge tone="success">Freshers welcome</Badge>}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {applyHref && !expired ? (
                  <LinkButton href={applyHref} external size="lg" variant="gradient" icon={<ArrowUpRight className="h-5 w-5" />}>
                    Apply now
                  </LinkButton>
                ) : applyHref ? (
                  <LinkButton href={applyHref} external size="lg" variant="secondary" icon={<ExternalLink className="h-4 w-4" />}>
                    View original posting
                  </LinkButton>
                ) : null}
              </div>
              {applyHref && <p className="mt-2 text-xs text-subtle">You&apos;ll apply on the employer&apos;s site. We never ask for fees.</p>}
            </div>
          </Card>

          {meta.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-fg">Key details</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {meta.map((m) => (
                  <div key={m.key} className="flex items-start gap-3 rounded-xl bg-surface-2/70 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-brand shadow-sm [&>svg]:h-[18px] [&>svg]:w-[18px]">{m.icon}</span>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium text-subtle">{m.label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold break-words text-fg">{m.value}</dd>
                    </div>
                  </div>
                ))}
                {job.deadline && (
                  <div className="flex items-start gap-3 rounded-xl bg-surface-2/70 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-brand shadow-sm">
                      <CalendarDays className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <dt className="text-xs font-medium text-subtle">Application deadline</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-fg">{formatYmd(job.deadline)}</dd>
                    </div>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {(job.skills.length > 0 || job.preferredSkills.length > 0) && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-fg">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.skills.map((s) => (
                  <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-xl bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand hover:brightness-95">
                    {s}
                  </Link>
                ))}
              </div>
              {job.preferredSkills.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold text-muted">Nice to have</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.preferredSkills.map((s) => (
                      <span key={s} className="rounded-xl border border-line px-3 py-1.5 text-sm text-fg">
                        {s}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          {(job.summary || job.description || job.responsibilities.length > 0) && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-fg">About the role</h2>
              {job.summary && <p className="mt-3 text-[15px] leading-relaxed font-medium text-fg">{job.summary}</p>}
              {job.description && <div className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-muted">{job.description}</div>}
              {job.responsibilities.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-bold text-fg">Responsibilities</h3>
                  <ul className="mt-2 space-y-2">
                    {job.responsibilities.map((r, i) => (
                      <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          {job.generatedPost && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-base font-bold text-fg">Share-ready post</h2>
              <p className="mt-1 text-sm text-muted">A standardised summary you can copy and share.</p>
              <PostPreview post={job.generatedPost} className="mt-4" />
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <StaffJobActions job={job} />

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
              <ShieldCheck className="h-4 w-4 text-success" /> Source & verification
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {job.sourceWebsite && (
                <div className="flex justify-between gap-3">
                  <dt className="text-subtle">Source</dt>
                  <dd className="truncate font-medium text-fg">
                    <a href={job.sourceUrl ?? '#'} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-brand">
                      <Globe className="h-3.5 w-3.5" /> {job.sourceWebsite}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">Added via</dt>
                <dd className="font-medium text-fg">{job.sourceType === 'URL' ? 'Source link (reviewed)' : 'Editor'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">Published</dt>
                <dd className="font-medium text-fg">{formatDateTime(job.publishedAt)}</dd>
              </div>
              {job.lastVerifiedAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-subtle">Last verified</dt>
                  <dd className="font-medium text-fg">{timeAgo(job.lastVerifiedAt)}</dd>
                </div>
              )}
              {job.expiresAt && !expired && (
                <div className="flex justify-between gap-3">
                  <dt className="text-subtle">Listed until</dt>
                  <dd className="font-medium text-fg">{formatDateTime(job.expiresAt).split(',')[0]}</dd>
                </div>
              )}
            </dl>
            <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              Details are summarised from the original posting. Always confirm on the employer&apos;s site before applying.
            </p>
          </Card>

          {job.tags.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-bold text-fg">Tags</h2>
              <div className="mt-3 space-y-3">
                {Object.entries(tagGroups).map(([cat, tags]) => (
                  <div key={cat}>
                    <p className="text-xs font-medium text-subtle">{TAG_CATEGORY_LABELS[cat as TagCategory]}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <Badge key={t.id} tone="outline">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {similar.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-fg">Similar jobs</h2>
              <div className="space-y-3">
                {similar.map((s) => (
                  <Link key={s.id} href={`/jobs/${s.id}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-line-strong">
                    <CompanyLogo name={s.company.name} logoUrl={s.company.logoUrl} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{s.title}</p>
                      <p className="truncate text-xs text-muted">
                        {s.company.name}
                        {s.location ? ` · ${s.location}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">{timeAgo(s.publishedAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
