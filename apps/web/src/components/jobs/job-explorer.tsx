'use client';

import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, type EmploymentType, type JobDTO, type Paginated, type WorkMode } from '@jobs/shared';
import { BriefcaseBusiness, Loader2, Search, SearchX, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Select } from '@/components/ui/primitives';
import { qs } from '@/lib/api';
import { useDebounced, useFilterMeta, useTags } from '@/lib/hooks';
import { cn, compactNumber } from '@/lib/utils';
import { FilterPanel } from './filter-panel';
import { activeFilterCount, filtersToSearch, LIST_KEYS, parseFilters, POSTED_OPTIONS, type Filters, type ListKey } from './filters';
import { JobCard, JobCardSkeleton } from './job-card';

const PAGE_SIZE = 10;

const QUICK_FILTERS: { label: string; patch: (f: Filters) => Partial<Filters>; active: (f: Filters) => boolean }[] = [
  { label: 'Freshers', patch: (f) => ({ experience: f.experience === 'freshers' ? '' : 'freshers' }), active: (f) => f.experience === 'freshers' },
  { label: 'Work From Home', patch: (f) => ({ workMode: toggleIn(f.workMode, 'WFH') }), active: (f) => f.workMode.includes('WFH') },
  { label: 'Remote', patch: (f) => ({ workMode: toggleIn(f.workMode, 'REMOTE') }), active: (f) => f.workMode.includes('REMOTE') },
  { label: 'Internships', patch: (f) => ({ employmentType: toggleIn(f.employmentType, 'INTERNSHIP') }), active: (f) => f.employmentType.includes('INTERNSHIP') },
  { label: 'Testing / QA', patch: (f) => ({ category: toggleIn(f.category, 'testing-qa') }), active: (f) => f.category.includes('testing-qa') },
  { label: 'Software Development', patch: (f) => ({ category: toggleIn(f.category, 'software-development') }), active: (f) => f.category.includes('software-development') },
  { label: 'Data Science', patch: (f) => ({ category: toggleIn(f.category, 'data-science') }), active: (f) => f.category.includes('data-science') },
  { label: 'Non-IT', patch: (f) => ({ category: toggleIn(f.category, 'non-it') }), active: (f) => f.category.includes('non-it') },
];

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function JobExplorer({ variant }: { variant: 'home' | 'search' }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(() => parseFilters(new URLSearchParams(sp.toString())));
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastPushed = useRef(sp.toString());
  const { tags } = useTags();
  const { data: meta } = useFilterMeta();

  // External navigation (links, back button) → adopt URL state.
  useEffect(() => {
    const current = sp.toString();
    if (current !== lastPushed.current) {
      lastPushed.current = current;
      setFilters(parseFilters(new URLSearchParams(current)));
    }
  }, [sp]);

  const debounced = useDebounced(filters, 300);

  // Local state → URL (debounced), so results are shareable and survive refresh.
  useEffect(() => {
    const search = filtersToSearch(debounced);
    const next = search.slice(1);
    if (next !== lastPushed.current) {
      lastPushed.current = next;
      router.replace(`${pathname}${search}`, { scroll: false });
    }
  }, [debounced, pathname, router]);

  const sort = debounced.sort || (debounced.q ? 'relevance' : 'latest');
  const getKey = (index: number, prev: Paginated<JobDTO> | null) => {
    if (prev && index >= prev.meta.totalPages) return null;
    return `/jobs${qs({ ...debounced, sort, page: index + 1, pageSize: PAGE_SIZE })}`;
  };
  const { data, size, setSize, isLoading, isValidating, error } = useSWRInfinite<Paginated<JobDTO>>(getKey, { revalidateFirstPage: false });

  const jobs = useMemo(() => data?.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.[0]?.meta.total ?? 0;
  const hasMore = !!data && data[data.length - 1].meta.page < data[data.length - 1].meta.totalPages;
  const loadingMore = isValidating && size > (data?.length ?? 0);
  const stale = JSON.stringify(filters) !== JSON.stringify(debounced);

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isValidating) setSize((s) => s + 1);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isValidating, setSize]);

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const clearAll = () => setFilters(parseFilters(new URLSearchParams(filters.q ? `q=${encodeURIComponent(filters.q)}` : '')));
  const count = activeFilterCount(filters);

  const chips = useMemo(() => {
    const tagName = (slug: string) => tags.find((t) => t.slug === slug)?.name ?? slug;
    const out: { key: string; label: string; remove: () => void }[] = [];
    for (const k of LIST_KEYS) {
      for (const v of filters[k]) {
        const label = k === 'workMode' ? WORK_MODE_LABELS[v as WorkMode] : k === 'employmentType' ? EMPLOYMENT_TYPE_LABELS[v as EmploymentType] : tagName(v);
        out.push({ key: `${k}:${v}`, label, remove: () => patch({ [k]: filters[k as ListKey].filter((x) => x !== v) } as Partial<Filters>) });
      }
    }
    if (filters.experience) out.push({ key: 'exp', label: filters.experience === 'freshers' ? 'Freshers' : 'Experienced', remove: () => patch({ experience: '' }) });
    if (filters.location) out.push({ key: 'loc', label: `📍 ${filters.location}`, remove: () => patch({ location: '' }) });
    if (filters.company) out.push({ key: 'co', label: `🏢 ${filters.company}`, remove: () => patch({ company: '' }) });
    if (filters.postedWithin) out.push({ key: 'posted', label: POSTED_OPTIONS.find((o) => o.value === filters.postedWithin)?.label ?? '', remove: () => patch({ postedWithin: '' }) });
    if (filters.status) out.push({ key: 'status', label: filters.status === 'expired' ? 'Expired jobs' : 'Active + expired', remove: () => patch({ status: '' }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tags]);

  const searchBox = (
    <div className={cn('relative', variant === 'home' ? 'w-full' : 'flex-1')}>
      <Search className={cn('pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle', variant === 'home' ? 'h-5 w-5' : 'h-[18px] w-[18px]')} />
      <input
        type="search"
        value={filters.q}
        onChange={(e) => patch({ q: e.target.value })}
        placeholder="Search by job title, company, skill or location…"
        aria-label="Search jobs"
        className={cn(
          'w-full rounded-2xl border border-line bg-surface text-fg shadow-card placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none',
          variant === 'home' ? 'h-14 pr-32 pl-12 text-base' : 'h-12 pr-10 pl-11 text-sm',
        )}
      />
      {filters.q && (
        <button
          type="button"
          onClick={() => patch({ q: '' })}
          className={cn('absolute top-1/2 -translate-y-1/2 rounded-full p-1 text-subtle hover:bg-surface-2 hover:text-fg', variant === 'home' ? 'right-28' : 'right-3')}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {variant === 'home' && (
        <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:block">
          <span className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-accent px-4 text-sm font-semibold text-white">
            {stale || (isValidating && !loadingMore) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </span>
        </span>
      )}
    </div>
  );

  return (
    <>
      {variant === 'home' ? (
        <section className="relative overflow-hidden border-b border-line">
          <div className="hero-glow absolute inset-0" aria-hidden />
          <div className="grid-fade absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-4xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-20 sm:pb-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-muted shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {meta ? `${compactNumber(meta.activeJobs)} active openings` : 'Fresh openings'} · updated daily
            </span>
            <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-fg sm:text-6xl">
              Find your next role,{' '}
              <span className="bg-gradient-to-r from-brand via-accent to-brand bg-clip-text text-transparent">verified and in one place</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              We collect openings from company career pages and job boards, check every detail, and publish them in one clean, searchable feed — newest first.
            </p>
            <div className="mx-auto mt-8 max-w-2xl">{searchBox}</div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {QUICK_FILTERS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => patch(q.patch(filters))}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
                    q.active(filters) ? 'border-brand bg-brand text-brand-fg shadow-sm shadow-brand/30' : 'border-line bg-surface/80 text-muted backdrop-blur hover:border-line-strong hover:text-fg',
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-subtle">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" /> Reviewed by editors</span>
              <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-accent" /> AI-assisted, never auto-published</span>
              <span className="flex items-center gap-1.5"><BriefcaseBusiness className="h-4 w-4 text-brand" /> Original apply links only</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="border-b border-line bg-surface/60">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <h1 className="text-2xl font-bold tracking-tight text-fg">Search jobs</h1>
            <p className="mt-1 text-sm text-muted">Combine keywords and filters — results update as you type.</p>
            <div className="mt-4 flex gap-2">{searchBox}</div>
          </div>
        </section>
      )}

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[272px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-card">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-sm font-bold text-fg">Filters</span>
              {count > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-brand hover:underline">
                  Clear all
                </button>
              )}
            </div>
            <FilterPanel filters={filters} onChange={patch} />
          </div>
        </aside>

        <section aria-live="polite" aria-busy={isLoading}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="text-lg font-bold text-fg">
                {isLoading && !data ? 'Loading jobs…' : `${total.toLocaleString()} ${filters.status === 'expired' ? 'expired ' : ''}job${total === 1 ? '' : 's'}`}
              </h2>
              <p className="text-xs text-subtle">{sort === 'relevance' ? 'Most relevant first' : sort === 'oldest' ? 'Oldest first' : 'Newest first'}</p>
            </div>
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)} icon={<SlidersHorizontal className="h-4 w-4" />}>
              Filters{count > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-brand-fg">{count}</span>}
            </Button>
            <Select value={sort} onChange={(e) => patch({ sort: e.target.value })} className="h-9 w-40 text-sm" aria-label="Sort jobs">
              <option value="latest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="relevance">Most relevant</option>
            </Select>
          </div>

          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.remove}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft py-1 pr-2 pl-3 text-xs font-semibold text-brand hover:border-brand"
                >
                  {c.label}
                  <X className="h-3.5 w-3.5" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-muted hover:text-fg">
                Clear all
              </button>
            </div>
          )}

          {error ? (
            <EmptyState icon={<SearchX className="h-6 w-6" />} title="Couldn't load jobs" description="Please check your connection and try again." />
          ) : isLoading && !data ? (
            <div className="grid gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title="No jobs match your search"
              description="Try fewer filters, a broader keyword, or include expired listings."
              action={count > 0 ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button> : undefined}
            />
          ) : (
            <div className={cn('grid gap-4 transition-opacity', stale && 'opacity-60')}>
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
              <div ref={sentinel} />
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="secondary" loading={loadingMore} onClick={() => setSize(size + 1)}>
                    Load more jobs
                  </Button>
                </div>
              )}
              {!hasMore && jobs.length > PAGE_SIZE && <p className="py-4 text-center text-sm text-subtle">You&apos;ve reached the end · {total} jobs</p>}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        side="left"
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={clearAll}>Clear all</Button>
            <Button onClick={() => setMobileOpen(false)}>Show {total} jobs</Button>
          </>
        }
      >
        <FilterPanel filters={filters} onChange={patch} />
      </Dialog>
    </>
  );
}
