'use client';

import { JOB_STATUS_LABELS, type JobDTO } from '@jobs/shared';
import { Archive, CheckCircle2, Clock, Pencil, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Quick moderation controls shown on the public detail page to staff only. */
export function StaffJobActions({ job }: { job: JobDTO }) {
  const { can } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!can('EDITOR')) return null;

  const run = async (action: string, label: string) => {
    setBusy(action);
    try {
      if (action === 'verify') {
        const r = await api<{ status: string; note: string }>(`/admin/jobs/${job.id}/verify`, { method: 'POST' });
        toast[r.status === 'ACTIVE' ? 'success' : 'warning'](`Source check: ${r.status.replace('_', ' ').toLowerCase()}`, { description: r.note });
      } else {
        await api(`/admin/jobs/${job.id}/${action}`, { method: 'POST' });
        toast.success(label);
      }
      router.refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-brand/30 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-fg">Editor tools</h2>
        <span className="text-xs font-medium text-muted">{JOB_STATUS_LABELS[job.status]}</span>
      </div>
      <div className="mt-3 grid gap-2">
        <LinkButton href={`/admin/jobs/${job.id}/edit`} variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />}>
          Edit job
        </LinkButton>
        {can('ADMIN') && ['PENDING_APPROVAL', 'DRAFT'].includes(job.status) && (
          <Button size="sm" variant="success" loading={busy === 'approve'} onClick={() => run('approve', 'Job approved')} icon={<CheckCircle2 className="h-4 w-4" />}>
            Approve & publish
          </Button>
        )}
        {job.sourceUrl && (
          <Button size="sm" variant="secondary" loading={busy === 'verify'} onClick={() => run('verify', '')} icon={<RefreshCw className="h-4 w-4" />}>
            Re-check source
          </Button>
        )}
        {can('ADMIN') && job.status === 'PUBLISHED' && (
          <Button size="sm" variant="danger-soft" loading={busy === 'expire'} onClick={() => run('expire', 'Marked as expired')} icon={<Clock className="h-4 w-4" />}>
            Mark expired
          </Button>
        )}
        {can('ADMIN') && job.status !== 'ARCHIVED' && (
          <Button size="sm" variant="ghost" loading={busy === 'archive'} onClick={() => run('archive', 'Archived')} icon={<Archive className="h-4 w-4" />}>
            Archive
          </Button>
        )}
      </div>
    </Card>
  );
}
