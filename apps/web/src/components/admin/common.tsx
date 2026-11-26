'use client';

import { JOB_STATUS_LABELS, type ExtractionStatus, type JobStatus } from '@jobs/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, StatusDot, type Tone } from '@/components/ui/primitives';

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  EXPIRED: 'danger',
  ARCHIVED: 'outline',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={JOB_STATUS_TONE[status]} icon={<StatusDot tone={JOB_STATUS_TONE[status]} />}>
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

const EXTRACTION_META: Record<ExtractionStatus, { tone: Tone; label: string }> = {
  QUEUED: { tone: 'neutral', label: 'Queued' },
  FETCHING: { tone: 'info', label: 'Fetching page' },
  EXTRACTING: { tone: 'info', label: 'Extracting' },
  READY: { tone: 'brand', label: 'Ready for review' },
  FAILED: { tone: 'danger', label: 'Failed' },
  PUBLISHED: { tone: 'success', label: 'Published' },
  DISCARDED: { tone: 'outline', label: 'Discarded' },
};

export function ExtractionStatusBadge({ status }: { status: ExtractionStatus }) {
  const m = EXTRACTION_META[status];
  const busy = ['QUEUED', 'FETCHING', 'EXTRACTING'].includes(status);
  return (
    <Badge tone={m.tone} icon={<span className={busy ? 'animate-pulse' : ''}><StatusDot tone={m.tone} /></span>}>
      {m.label}
    </Badge>
  );
}

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="px-1 py-3 text-xs text-subtle">{total} result{total === 1 ? '' : 's'}</p>;
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3">
      <p className="text-xs text-subtle">
        Page {page} of {totalPages} · {total} results
      </p>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-2/60 text-xs font-semibold text-muted">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const th = 'px-4 py-3 font-semibold whitespace-nowrap';
export const td = 'px-4 py-3 align-middle';
