'use client';

import type { JobDTO, Paginated } from '@jobs/shared';
import { Bookmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { JobCard, JobCardSkeleton } from '@/components/jobs/job-card';
import { Button, LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';

export default function SavedJobsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<Paginated<JobDTO>>(user ? `/bookmarks?page=${page}&pageSize=10` : null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=/saved');
  }, [loading, user, router]);

  const expiredCount = data?.data.filter((j) => j.status === 'EXPIRED').length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-fg">Saved jobs</h1>
          <p className="mt-1 text-sm text-muted">
            {data ? `${data.meta.total} saved` : 'Your bookmarked openings'}
            {expiredCount > 0 && ` · ${expiredCount} on this page have expired`}
          </p>
        </div>
        <LinkButton href="/" variant="secondary" size="sm">
          Browse more jobs
        </LinkButton>
      </div>

      <div className="mt-8 grid gap-4">
        {(loading || isLoading) && !data ? (
          Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)
        ) : data && data.data.length > 0 ? (
          <>
            {data.data.map((job) => (
              <JobCard key={job.id} job={job} onBookmarkChange={(saved) => !saved && mutate()} />
            ))}
            {data.meta.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {page} of {data.meta.totalPages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Bookmark className="h-6 w-6" />}
            title="No saved jobs yet"
            description="Tap the bookmark icon on any job to keep it here for later."
            action={<LinkButton href="/">Find jobs</LinkButton>}
          />
        )}
      </div>
    </div>
  );
}
