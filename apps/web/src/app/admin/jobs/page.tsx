'use client';

import { JOB_STATUS_LABELS, JOB_STATUSES, type DashboardDTO, type JobDTO, type JobStatus, type Paginated } from '@jobs/shared';
import { Archive, ArchiveRestore, CheckCircle2, Clock, ExternalLink, FilePlus2, MoreHorizontal, Pencil, RefreshCw, Search, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { JobStatusBadge, PageHeader, Pager, Table, td, th } from '@/components/admin/common';
import { CompanyLogo } from '@/components/jobs/company-logo';
import { Button, LinkButton } from '@/components/ui/button';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { Badge, Card, EmptyState, Input } from '@/components/ui/primitives';
import { api, errorText, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

function ManageJobs() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState<JobStatus | ''>((sp.get('status') as JobStatus) ?? '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  const { data, mutate, isLoading } = useSWR<Paginated<JobDTO>>(`/admin/jobs${qs({ status, q: dq, page, pageSize: 20 })}`);
  const { data: dash, mutate: mutateDash } = useSWR<DashboardDTO>('/admin/dashboard');

  const act = async (job: JobDTO, action: string, label: string) => {
    try {
      if (action === 'delete') {
        if (!confirm(`Permanently delete "${job.title}"? Prefer archiving to keep history.`)) return;
        await api(`/jobs/${job.id}`, { method: 'DELETE' });
      } else if (action === 'verify') {
        const r = await api<{ status: string; note: string }>(`/admin/jobs/${job.id}/verify`, { method: 'POST' });
        toast[r.status === 'ACTIVE' ? 'success' : 'warning'](`Source: ${r.status.replace('_', ' ').toLowerCase()}`, { description: r.note });
        mutate();
        return;
      } else {
        await api(`/admin/jobs/${job.id}/${action}`, { method: 'POST' });
      }
      toast.success(label);
      mutate();
      mutateDash();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const tabs: (JobStatus | '')[] = ['', ...JOB_STATUSES];
  const countOf = (s: JobStatus | '') => (dash ? (s ? dash.jobs[s] : dash.jobs.total) : undefined);

  return (
    <>
      <PageHeader
        title="Manage jobs"
        description="Every job — manual or extracted — flows through the same review and publishing pipeline."
        actions={
          <LinkButton href="/admin/jobs/new" icon={<FilePlus2 className="h-4 w-4" />}>
            Create job
          </LinkButton>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t || 'all'}
            onClick={() => {
              setStatus(t);
              setPage(1);
              router.replace(`/admin/jobs${t ? `?status=${t}` : ''}`, { scroll: false });
            }}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              status === t ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t ? JOB_STATUS_LABELS[t] : 'All'}
            {countOf(t) !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{countOf(t)}</span>}
          </button>
        ))}
      </div>

      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search title, company, location" className="pl-9" aria-label="Search jobs" />
          </div>
        </div>
        <Table
          head={
            <tr>
              <th className={th}>Job</th>
              <th className={th}>Status</th>
              <th className={cn(th, 'hidden md:table-cell')}>Source</th>
              <th className={cn(th, 'hidden lg:table-cell')}>Published</th>
              <th className={cn(th, 'hidden lg:table-cell')}>Expires</th>
              <th className={cn(th, 'text-right')}>Actions</th>
            </tr>
          }
          empty={
            data && data.data.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No jobs here" description={status ? `No ${JOB_STATUS_LABELS[status].toLowerCase()} jobs match.` : 'Create your first job or submit a URL.'} />
              </div>
            ) : null
          }
        >
          {isLoading && !data
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className={td} colSpan={6}>
                    <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
                  </td>
                </tr>
              ))
            : data?.data.map((job) => (
                <tr key={job.id} className="hover:bg-surface-2/40">
                  <td className={td}>
                    <div className="flex min-w-0 items-center gap-3">
                      <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} size={36} />
                      <div className="min-w-0">
                        <Link href={`/jobs/${job.id}`} className="block max-w-[22rem] truncate font-semibold text-fg hover:text-brand">
                          {job.title}
                        </Link>
                        <p className="truncate text-xs text-subtle">
                          {job.company.name}
                          {job.location ? ` · ${job.location}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex flex-col items-start gap-1">
                      <JobStatusBadge status={job.status} />
                      {job.status === 'SCHEDULED' && job.scheduledAt && <span className="text-[11px] text-subtle">{formatDateTime(job.scheduledAt)}</span>}
                      {job.lastVerifyStatus === 'LIKELY_CLOSED' && <Badge tone="danger" className="text-[10px]">Source looks closed</Badge>}
                    </div>
                  </td>
                  <td className={cn(td, 'hidden md:table-cell')}>
                    <Badge tone={job.sourceType === 'URL' ? 'brand' : 'neutral'}>{job.sourceType === 'URL' ? job.sourceWebsite ?? 'URL' : 'Manual'}</Badge>
                  </td>
                  <td className={cn(td, 'hidden text-xs text-muted lg:table-cell')}>{job.publishedAt ? timeAgo(job.publishedAt) : '—'}</td>
                  <td className={cn(td, 'hidden text-xs text-muted lg:table-cell')}>
                    {job.status === 'EXPIRED' ? (job.expiryReason ?? '').replaceAll('_', ' ').toLowerCase() : job.expiresAt ? formatDateTime(job.expiresAt).split(',')[0] : '—'}
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <div className="flex items-center justify-end gap-1">
                      {can('ADMIN') && job.status === 'PENDING_APPROVAL' && (
                        <Button size="xs" variant="success" onClick={() => act(job, 'approve', 'Approved')}>
                          Approve
                        </Button>
                      )}
                      <Dropdown
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.title}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      >
                        <DropdownItem icon={<ExternalLink />} onSelect={() => router.push(`/jobs/${job.id}`)}>View</DropdownItem>
                        <DropdownItem icon={<Pencil />} onSelect={() => router.push(`/admin/jobs/${job.id}/edit`)}>Edit</DropdownItem>
                        {job.sourceUrl && <DropdownItem icon={<RefreshCw />} onSelect={() => act(job, 'verify', '')}>Re-check source</DropdownItem>}
                        {can('ADMIN') && (
                          <>
                            <DropdownSeparator />
                            {job.status === 'PENDING_APPROVAL' && (
                              <DropdownItem icon={<Undo2 />} onSelect={() => act(job, 'reject', 'Sent back to drafts')}>Reject to draft</DropdownItem>
                            )}
                            {['DRAFT', 'EXPIRED', 'SCHEDULED'].includes(job.status) && (
                              <DropdownItem icon={<CheckCircle2 />} onSelect={() => act(job, 'publish', 'Published')}>Publish now</DropdownItem>
                            )}
                            {job.status === 'PUBLISHED' && <DropdownItem icon={<Clock />} onSelect={() => act(job, 'expire', 'Marked expired')}>Mark expired</DropdownItem>}
                            {job.status !== 'ARCHIVED' ? (
                              <DropdownItem icon={<Archive />} onSelect={() => act(job, 'archive', 'Archived')}>Archive</DropdownItem>
                            ) : (
                              <DropdownItem icon={<ArchiveRestore />} onSelect={() => act(job, 'restore', 'Restored to drafts')}>Restore</DropdownItem>
                            )}
                            <DropdownSeparator />
                            <DropdownItem danger icon={<Trash2 />} onSelect={() => act(job, 'delete', 'Deleted')}>Delete permanently</DropdownItem>
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </td>
                </tr>
              ))}
        </Table>
        {data && (
          <div className="border-t border-line px-4">
            <Pager page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
          </div>
        )}
      </Card>
    </>
  );
}

export default function ManageJobsPage() {
  return (
    <Suspense>
      <ManageJobs />
    </Suspense>
  );
}
