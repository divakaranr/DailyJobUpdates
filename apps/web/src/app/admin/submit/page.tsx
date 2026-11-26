'use client';

import { EXTRACTION_STATUSES, type ExtractionDTO, type ExtractionStatus, type Paginated } from '@jobs/shared';
import { ArrowRight, Globe, Link2, Lock, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ExtractionStatusBadge, PageHeader, Pager } from '@/components/admin/common';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, EmptyState, Select, Switch } from '@/components/ui/primitives';
import { api, errorText, qs } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

function SubmitUrl() {
  const router = useRouter();
  const sp = useSearchParams();
  const [url, setUrl] = useState('');
  const [forceBrowser, setForceBrowser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ExtractionStatus | ''>((sp.get('status') as ExtractionStatus) ?? '');

  const { data, mutate } = useSWR<Paginated<ExtractionDTO>>(`/extractions${qs({ page, pageSize: 15, status })}`, {
    refreshInterval: (d) => (d?.data.some((e) => ['QUEUED', 'FETCHING', 'EXTRACTING'].includes(e.status)) ? 2000 : 0),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ extraction: ExtractionDTO; existingJob: { id: string; title: string; status: string } | null }>('/extractions', {
        method: 'POST',
        body: { url: url.trim(), forceBrowser },
      });
      if (res.existingJob) toast.warning(`This URL was already used for "${res.existingJob.title}". Duplicates will be flagged on review.`);
      else toast.success('Extraction started');
      setUrl('');
      mutate();
      router.push(`/admin/extractions/${res.extraction.id}`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Submit a job URL" description="Paste a link to a single job posting. We'll fetch it, extract the details with AI, and prepare a post for you to review — nothing is published automatically." />

      <Card className="relative overflow-hidden">
        <div className="hero-glow absolute inset-0 opacity-60" aria-hidden />
        <form onSubmit={submit} className="relative p-5 sm:p-8">
          <label htmlFor="job-url" className="text-sm font-semibold text-fg">
            Job posting URL
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-subtle" />
              <input
                id="job-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://careers.example.com/jobs/investigation-specialist"
                className="h-14 w-full rounded-2xl border border-line bg-surface pr-4 pl-12 text-base text-fg shadow-card placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
              />
            </div>
            <Button type="submit" size="lg" variant="gradient" loading={busy} className="h-14 px-7" icon={<Sparkles className="h-5 w-5" />}>
              Extract job
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Switch checked={forceBrowser} onChange={setForceBrowser} label="Render with a browser (for JavaScript-heavy pages)" />
          </div>
          <div className="mt-6 grid gap-3 text-xs text-muted sm:grid-cols-3">
            <p className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-success" /> Private/internal addresses are blocked and robots.txt is respected.</p>
            <p className="flex items-start gap-2"><Lock className="h-4 w-4 shrink-0 text-warning" /> Pages behind logins or CAPTCHAs are not bypassed — create those manually.</p>
            <p className="flex items-start gap-2"><ScanSearch className="h-4 w-4 shrink-0 text-brand" /> Unverifiable values (salary, links) are flagged or removed, never invented.</p>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recent extractions"
          action={
            <Select value={status} onChange={(e) => { setStatus(e.target.value as ExtractionStatus | ''); setPage(1); }} className="h-9 w-44 text-sm" aria-label="Filter by status">
              <option value="">All statuses</option>
              {EXTRACTION_STATUSES.map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </Select>
          }
        />
        {data && data.data.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Globe className="h-6 w-6" />} title="Nothing here yet" description="Submitted URLs will appear here with their extraction status." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data?.data.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/extractions/${e.id}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{e.pageTitle ?? new URL(e.sourceUrl).hostname}</p>
                    <p className="truncate text-xs text-subtle">{e.status === 'FAILED' && e.error ? e.error : e.sourceUrl}</p>
                  </div>
                  <span className="hidden text-xs text-subtle md:block">{e.submittedBy?.name}</span>
                  <ExtractionStatusBadge status={e.status} />
                  <span className="hidden w-16 text-right text-xs text-subtle sm:block">{timeAgo(e.createdAt)}</span>
                  <ArrowRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && <div className="border-t border-line px-4"><Pager page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} /></div>}
      </Card>
    </>
  );
}

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitUrl />
    </Suspense>
  );
}
