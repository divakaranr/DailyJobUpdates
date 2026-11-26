'use client';

import type { DashboardDTO } from '@jobs/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Link2,
  Send,
  Sparkles,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ExtractionStatusBadge, PageHeader } from '@/components/admin/common';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { compactNumber, timeAgo } from '@/lib/utils';

function StatTile({ label, value, icon: Icon, href, note }: { label: string; value: number | string; icon: LucideIcon; href?: string; note?: string }) {
  const body = (
    <Card className="h-full p-4 transition-colors hover:border-line-strong">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <Icon className="h-4 w-4 text-subtle" aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-[28px] leading-none font-extrabold tracking-tight text-fg tabular-nums">{value}</p>
      {note && <p className="mt-1.5 text-xs text-subtle">{note}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Single-series bar chart: one brand colour, title names the series, per-bar hover tooltip. */
function PublishedChart({ data }: { data: DashboardDTO['publishedPerDay'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div>
      <div className="relative flex h-44 gap-3">
        <div className="flex flex-col justify-between py-0.5 text-right text-[11px] text-subtle tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div className="relative flex h-full items-end gap-[2px]" role="img" aria-label="Jobs published per day over the last 14 days">
            {data.map((d, i) => (
              <div
                key={d.date}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="w-full max-w-7 rounded-t-[4px] bg-brand transition-opacity"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-pop">
                    <span className="font-semibold text-fg tabular-nums">{d.count}</span> <span className="text-muted">published · {label(d.date)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-[11px] text-subtle">
        <span>{label(data[0].date)}</span>
        <span>{label(data[data.length - 1].date)}</span>
      </div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium hover:text-fg">View as table</summary>
        <table className="mt-2 w-full max-w-xs">
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-b border-line">
                <td className="py-1">{label(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function AdminDashboard() {
  const { data, mutate, isLoading } = useSWR<DashboardDTO>('/admin/dashboard', { refreshInterval: 15_000 });
  const { can, user } = useAuth();

  const approve = async (id: string) => {
    try {
      await api(`/admin/jobs/${id}/approve`, { method: 'POST' });
      toast.success('Job approved and published');
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user?.name.split(' ')[0] ?? ''}`}
        description="Here's what's happening across the job pipeline."
        actions={
          <>
            <LinkButton href="/admin/jobs/new" variant="secondary" icon={<FileText className="h-4 w-4" />}>
              Create manually
            </LinkButton>
            <LinkButton href="/admin/submit" variant="gradient" icon={<Link2 className="h-4 w-4" />}>
              Submit job URL
            </LinkButton>
          </>
        }
      />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Published" value={data.jobs.PUBLISHED} icon={CheckCircle2} href="/admin/jobs?status=PUBLISHED" note={`${data.jobs.total} jobs in total`} />
            <StatTile label="Awaiting approval" value={data.jobs.PENDING_APPROVAL} icon={Send} href="/admin/jobs?status=PENDING_APPROVAL" note={`${data.extractions.ready} extractions to review`} />
            <StatTile label="Drafts" value={data.jobs.DRAFT} icon={FileText} href="/admin/jobs?status=DRAFT" note={`${data.jobs.SCHEDULED} scheduled`} />
            <StatTile label="Expired" value={data.jobs.EXPIRED} icon={Clock} href="/admin/jobs?status=EXPIRED" note="Kept for history" />
            <StatTile label="Extracted OK" value={data.extractions.ready + data.extractions.published} icon={Sparkles} href="/admin/submit" note={`${data.extractions.inProgress} in progress`} />
            <StatTile label="Extraction failures" value={data.extractions.failed} icon={XCircle} href="/admin/submit?status=FAILED" note={`of ${data.extractions.total} submitted`} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Jobs published per day" description="Last 14 days" />
              <div className="p-5">
                <PublishedChart data={data.publishedPerDay} />
              </div>
            </Card>
            <Card>
              <CardHeader title="AI usage" description="Last 30 days" action={can('ADMIN') ? <LinkButton href="/admin/logs" variant="ghost" size="xs">Logs</LinkButton> : undefined} />
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-line">
                {[
                  ['LLM requests', compactNumber(data.llmUsage30d.requests)],
                  ['Tokens', compactNumber(data.llmUsage30d.tokens)],
                  ['Est. cost', `$${data.llmUsage30d.cost.toFixed(4)}`],
                  ['Failed steps', String(data.llmUsage30d.failures)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface p-4">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="mt-1 text-xl font-bold text-fg tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Recently submitted URLs" action={<LinkButton href="/admin/submit" variant="ghost" size="xs">View all</LinkButton>} />
              {data.recentExtractions.length === 0 ? (
                <div className="p-5">
                  <EmptyState icon={<Link2 className="h-6 w-6" />} title="No URLs submitted yet" action={<LinkButton href="/admin/submit">Submit your first URL</LinkButton>} />
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentExtractions.map((e) => (
                    <li key={e.id}>
                      <Link href={`/admin/extractions/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-fg">{e.pageTitle ?? e.sourceUrl}</p>
                          <p className="truncate text-xs text-subtle">{e.error ?? e.sourceUrl}</p>
                        </div>
                        <ExtractionStatusBadge status={e.status} />
                        <span className="hidden w-16 text-right text-xs text-subtle sm:block">{timeAgo(e.createdAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Awaiting approval" description={`${data.jobs.PENDING_APPROVAL} job${data.jobs.PENDING_APPROVAL === 1 ? '' : 's'}`} />
                {data.pendingJobs.length === 0 ? (
                  <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
                    <CheckCircle2 className="h-4 w-4 text-success" /> All caught up
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.pendingJobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-3 px-5 py-3">
                        <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-fg hover:text-brand">{j.title}</p>
                          <p className="truncate text-xs text-subtle">
                            {j.company.name} · {timeAgo(j.createdAt)}
                          </p>
                        </Link>
                        {can('ADMIN') && (
                          <Button size="xs" variant="success" onClick={() => approve(j.id)}>
                            Approve
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Possible duplicates" description="Live jobs that look alike" />
                {data.possibleDuplicates.length === 0 ? (
                  <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
                    <CheckCircle2 className="h-4 w-4 text-success" /> No duplicates detected
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.possibleDuplicates.map((d) => (
                      <li key={`${d.a.id}-${d.b.id}`} className="px-5 py-3 text-sm">
                        <div className="flex items-center gap-2 text-xs font-semibold text-warning">
                          <AlertTriangle className="h-3.5 w-3.5" /> {Math.round(d.score * 100)}% match · {d.a.company}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Copy className="h-3.5 w-3.5 shrink-0 text-subtle" />
                          <Link href={`/jobs/${d.a.id}`} className="truncate text-fg hover:text-brand">{d.a.title}</Link>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Copy className="h-3.5 w-3.5 shrink-0 text-subtle" />
                          <Link href={`/jobs/${d.b.id}`} className="truncate text-fg hover:text-brand">{d.b.title}</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
