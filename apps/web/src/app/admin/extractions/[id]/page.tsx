'use client';

import type { ExtractionDTO, ExtractionStatus } from '@jobs/shared';
import { ArrowLeft, Bot, Check, ExternalLink, FilePlus2, Globe, Loader2, MonitorPlay, RotateCcw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ExtractionStatusBadge, PageHeader } from '@/components/admin/common';
import { JobForm } from '@/components/admin/job-form';
import { formFromDraft } from '@/components/admin/job-form-state';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';

const STEPS: { key: ExtractionStatus; label: string; detail: string }[] = [
  { key: 'QUEUED', label: 'Queued', detail: 'Waiting for a worker' },
  { key: 'FETCHING', label: 'Fetching page', detail: 'Safe fetch · robots.txt · JS rendering if needed' },
  { key: 'EXTRACTING', label: 'Extracting with AI', detail: 'Structured extraction · validation · tagging · duplicate check' },
  { key: 'READY', label: 'Ready for review', detail: 'Check the draft and publish' },
];

function Progress({ status }: { status: ExtractionStatus }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return (
    <Card className="mx-auto max-w-xl p-8">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Bot className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-fg">Working on it…</h2>
        <p className="mt-1 text-sm text-muted">This usually takes a few seconds. You can leave this page — the result will wait for you.</p>
      </div>
      <ol className="mt-8 space-y-4">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold',
                  done ? 'border-success bg-success text-white dark:text-bg' : active ? 'border-brand text-brand' : 'border-line text-subtle',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
              </span>
              <div>
                <p className={cn('text-sm font-semibold', active || done ? 'text-fg' : 'text-subtle')}>{s.label}</p>
                <p className="text-xs text-subtle">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function ExtractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: ex, mutate } = useSWR<ExtractionDTO>(`/extractions/${id}`, {
    refreshInterval: (d) => (d && ['QUEUED', 'FETCHING', 'EXTRACTING'].includes(d.status) ? 1500 : 0),
    keepPreviousData: false,
  });

  const retry = async (forceBrowser?: boolean) => {
    setBusy(forceBrowser ? 'browser' : 'retry');
    try {
      await api(`/extractions/${id}/retry`, { method: 'POST', body: forceBrowser ? { forceBrowser: true } : {} });
      toast.success('Extraction restarted');
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!confirm('Discard this extraction? The draft will not be published.')) return;
    try {
      await api(`/extractions/${id}/discard`, { method: 'POST' });
      toast.success('Extraction discarded');
      router.push('/admin/submit');
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  if (!ex) return <Skeleton className="h-96 rounded-2xl" />;
  const r = ex.result;
  const host = new URL(ex.sourceUrl).hostname;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/submit" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> All extractions
          </Link>
        }
        title={ex.status === 'READY' ? 'Review extracted job' : ex.pageTitle ?? host}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <a href={ex.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate text-brand hover:underline">
              <Globe className="h-3.5 w-3.5 shrink-0" /> {ex.sourceUrl}
            </a>
          </span>
        }
        actions={<ExtractionStatusBadge status={ex.status} />}
      />

      {['QUEUED', 'FETCHING', 'EXTRACTING'].includes(ex.status) && <Progress status={ex.status} />}

      {ex.status === 'FAILED' && (
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger-soft text-danger">
            <XCircle className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-fg">Extraction failed</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">{ex.error}</p>
          <p className="mt-1 text-xs text-subtle">
            Attempt {ex.attempts} · {timeAgo(ex.completedAt ?? ex.updatedAt)}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" loading={busy === 'retry'} onClick={() => retry()} icon={<RotateCcw className="h-4 w-4" />}>
              Retry
            </Button>
            <Button variant="secondary" loading={busy === 'browser'} onClick={() => retry(true)} icon={<MonitorPlay className="h-4 w-4" />}>
              Retry with browser rendering
            </Button>
            <LinkButton href="/admin/jobs/new" icon={<FilePlus2 className="h-4 w-4" />}>
              Create manually
            </LinkButton>
          </div>
        </Card>
      )}

      {(ex.status === 'PUBLISHED' || ex.status === 'DISCARDED') && (
        <Card className="mx-auto max-w-xl p-8 text-center">
          <h2 className="text-lg font-bold text-fg">{ex.status === 'PUBLISHED' ? 'This extraction has been saved as a job' : 'This extraction was discarded'}</h2>
          {ex.jobId && (
            <div className="mt-5 flex justify-center gap-2">
              <LinkButton href={`/jobs/${ex.jobId}`} icon={<ExternalLink className="h-4 w-4" />}>
                View job
              </LinkButton>
              <LinkButton href={`/admin/jobs/${ex.jobId}/edit`} variant="secondary">
                Edit job
              </LinkButton>
            </div>
          )}
          {ex.status === 'DISCARDED' && (
            <Button className="mt-5" variant="secondary" onClick={() => retry()} icon={<RotateCcw className="h-4 w-4" />}>
              Run extraction again
            </Button>
          )}
        </Card>
      )}

      {ex.status === 'READY' && r && (
        <JobForm
          key={ex.id}
          mode="extraction"
          extractionId={ex.id}
          initial={formFromDraft(r.draft)}
          fieldMeta={r.fieldMeta}
          flags={r.flags}
          onDiscard={discard}
          headerExtra={
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-brand" /> {r.provider === 'heuristic' ? 'Rule-based extractor' : `${r.provider} · ${r.model}`}
              </span>
              <span>Prompt {r.promptVersion}</span>
              <span>Fetched via {ex.fetchMethod === 'BROWSER' ? 'headless browser' : 'static HTML'}</span>
              <span>
                {r.flags.filter((f) => f.level !== 'info').length} item(s) need attention ·{' '}
                {r.fieldMeta.inferred.length ? (
                  <>
                    fields marked <Badge tone="warning" className="py-0 text-[10px]">AI inferred</Badge> were not stated verbatim
                  </>
                ) : (
                  'all values read directly from the page'
                )}
              </span>
            </Card>
          }
        />
      )}
    </>
  );
}
