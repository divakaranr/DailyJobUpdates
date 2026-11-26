'use client';

import type { AuditLogDTO, Paginated } from '@jobs/shared';
import { Bot, CheckCircle2, Clock, FilePen, FilePlus2, Link2, LogIn, Send, Settings2, Tag, Trash2, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, Pager } from '@/components/admin/common';
import { Card, Select } from '@/components/ui/primitives';
import { qs } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';

const ACTIONS: Record<string, { label: string; icon: LucideIcon }> = {
  JOB_CREATE: { label: 'created a draft', icon: FilePlus2 },
  JOB_UPDATE: { label: 'edited', icon: FilePen },
  JOB_PUBLISH: { label: 'published', icon: CheckCircle2 },
  JOB_SUBMIT: { label: 'submitted for approval', icon: Send },
  JOB_SCHEDULE: { label: 'scheduled', icon: Clock },
  JOB_APPROVE: { label: 'approved', icon: CheckCircle2 },
  JOB_REJECT: { label: 'sent back to draft', icon: FilePen },
  JOB_EXPIRE: { label: 'marked expired', icon: Clock },
  JOB_ARCHIVE: { label: 'archived', icon: Trash2 },
  JOB_RESTORE: { label: 'restored', icon: FilePen },
  JOB_DELETE: { label: 'deleted', icon: Trash2 },
  JOB_VERIFY: { label: 're-checked the source of', icon: Link2 },
  JOB_AUTO_EXPIRE: { label: 'auto-expired', icon: Bot },
  JOB_AUTO_PUBLISH: { label: 'auto-published (schedule)', icon: Bot },
  EXTRACTION_SUBMIT: { label: 'submitted a URL', icon: Link2 },
  EXTRACTION_DISCARD: { label: 'discarded an extraction', icon: Trash2 },
  TAG_CREATE: { label: 'created tag', icon: Tag },
  TAG_UPDATE: { label: 'updated tag', icon: Tag },
  TAG_DELETE: { label: 'deleted tag', icon: Tag },
  USER_CREATE: { label: 'created a user', icon: User },
  USER_UPDATE: { label: 'updated a user', icon: User },
  SETTINGS_UPDATE: { label: 'changed settings', icon: Settings2 },
  AUTH_LOGIN: { label: 'signed in', icon: LogIn },
  AUTH_REGISTER: { label: 'registered', icon: User },
};

const FILTERS = [
  { value: '', label: 'All publishing activity' },
  { value: 'JOB_PUBLISH', label: 'Published' },
  { value: 'JOB_APPROVE', label: 'Approved' },
  { value: 'JOB_SUBMIT', label: 'Submitted' },
  { value: 'JOB_EXPIRE', label: 'Expired (manual)' },
  { value: 'JOB_AUTO_EXPIRE', label: 'Expired (automatic)' },
  { value: 'JOB_DELETE', label: 'Deleted' },
  { value: 'EXTRACTION_SUBMIT', label: 'URL submissions' },
  { value: 'SETTINGS_UPDATE', label: 'Settings changes' },
];

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data } = useSWR<Paginated<AuditLogDTO>>(`/admin/history${qs({ page, pageSize: 30, action })}`);

  return (
    <>
      <PageHeader
        title="Publishing history"
        description="An audit trail of who did what, and when."
        actions={
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-9 w-56 text-sm" aria-label="Filter activity">
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        }
      />
      <Card className="p-2 sm:p-4">
        <ol className="relative">
          {data?.data.map((log) => {
            const meta = ACTIONS[log.action] ?? { label: log.action.toLowerCase(), icon: FilePen };
            const title = (log.details?.title as string | undefined) ?? (log.details?.name as string | undefined) ?? (log.details?.url as string | undefined);
            return (
              <li key={log.id} className="flex gap-4 rounded-xl px-3 py-3 hover:bg-surface-2/50">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                  <meta.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-fg">
                    <span className="font-semibold">{log.user?.name ?? 'System'}</span> <span className="text-muted">{meta.label}</span>{' '}
                    {log.entityType === 'Job' && log.entityId && log.action !== 'JOB_DELETE' ? (
                      <Link href={`/jobs/${log.entityId}`} className="font-medium text-brand hover:underline">{title ?? 'a job'}</Link>
                    ) : log.entityType === 'Extraction' && log.entityId ? (
                      <Link href={`/admin/extractions/${log.entityId}`} className="font-medium text-brand hover:underline">{title ?? 'extraction'}</Link>
                    ) : (
                      title && <span className="font-medium">{title}</span>
                    )}
                  </p>
                  {typeof log.details?.reason === 'string' && <p className="mt-0.5 text-xs text-muted">Reason: {String(log.details.reason).replaceAll('_', ' ').toLowerCase()}</p>}
                </div>
                <time className="shrink-0 text-xs text-subtle" title={formatDateTime(log.createdAt)}>{timeAgo(log.createdAt)}</time>
              </li>
            );
          })}
        </ol>
        {data && data.data.length === 0 && <p className="p-6 text-center text-sm text-muted">No activity yet.</p>}
        {data && <Pager page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />}
      </Card>
    </>
  );
}
