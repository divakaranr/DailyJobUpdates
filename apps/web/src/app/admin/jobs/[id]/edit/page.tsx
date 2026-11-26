'use client';

import type { JobDTO } from '@jobs/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import useSWR from 'swr';
import { PageHeader } from '@/components/admin/common';
import { JobForm } from '@/components/admin/job-form';
import { formFromJob } from '@/components/admin/job-form-state';
import { EmptyState, Skeleton } from '@/components/ui/primitives';

export default function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: job, error } = useSWR<JobDTO>(`/jobs/${id}`, { revalidateOnFocus: false, keepPreviousData: false });

  if (error) return <EmptyState title="Job not found" description="It may have been deleted." />;
  if (!job) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/jobs" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Manage jobs
          </Link>
        }
        title={`Edit: ${job.title}`}
        description={`${job.company.name} · ${job.sourceType === 'URL' ? 'Extracted from URL' : 'Created manually'}`}
      />
      <JobForm key={job.id} mode="edit" jobId={job.id} status={job.status} initial={formFromJob(job)} fieldMeta={job.fieldMeta} />
    </>
  );
}
