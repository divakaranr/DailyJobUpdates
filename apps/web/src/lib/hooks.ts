'use client';

import type { TagCategory, TagDTO } from '@jobs/shared';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useTags(opts: { all?: boolean } = {}) {
  const { data, mutate, isLoading } = useSWR<{ data: TagDTO[] }>(opts.all ? '/tags?all=true' : '/tags');
  const byCategory = useMemo(() => {
    const map = new Map<TagCategory, TagDTO[]>();
    for (const t of data?.data ?? []) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [data]);
  return { tags: data?.data ?? [], byCategory, mutate, isLoading };
}

export interface FilterMeta {
  locations: { name: string; count: number }[];
  companies: string[];
  activeJobs: number;
  expiredJobs: number;
}

export function useFilterMeta() {
  return useSWR<FilterMeta>('/meta/filters');
}
