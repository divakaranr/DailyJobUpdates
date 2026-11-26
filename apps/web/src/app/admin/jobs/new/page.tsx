'use client';

import { PageHeader } from '@/components/admin/common';
import { JobForm } from '@/components/admin/job-form';
import { emptyForm } from '@/components/admin/job-form-state';

export default function NewJobPage() {
  return (
    <>
      <PageHeader title="Create a job" description="Enter the details manually. Tags and the share-ready post are generated as you type." />
      <JobForm mode="create" initial={emptyForm} />
    </>
  );
}
