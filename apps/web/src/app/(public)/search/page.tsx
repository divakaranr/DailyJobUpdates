import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JobExplorer } from '@/components/jobs/job-explorer';

export const metadata: Metadata = { title: 'Search jobs' };

export default function SearchPage() {
  return (
    <Suspense>
      <JobExplorer variant="search" />
    </Suspense>
  );
}
