import { Suspense } from 'react';
import { JobExplorer } from '@/components/jobs/job-explorer';

export default function HomePage() {
  return (
    <Suspense>
      <JobExplorer variant="home" />
    </Suspense>
  );
}
