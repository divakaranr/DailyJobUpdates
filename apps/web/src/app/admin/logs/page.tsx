'use client';

import type { ExtractionLogDTO, Paginated } from '@jobs/shared';
import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, Pager, Table, td, th } from '@/components/admin/common';
import { Badge, Card, Select } from '@/components/ui/primitives';
import { qs } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const { data } = useSWR<Paginated<ExtractionLogDTO>>(`/admin/extraction-logs${qs({ page, pageSize: 30, stage, status })}`, { refreshInterval: 10_000 });
  const totals = data?.data.reduce((a, l) => ({ tokens: a.tokens + l.totalTokens, cost: a.cost + l.estimatedCost }), { tokens: 0, cost: 0 });

  return (
    <>
      <PageHeader title="Extraction logs" description="Every fetch, render, LLM call and pipeline run — with tokens, estimated cost, latency and errors." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }} className="h-9 w-40 text-sm" aria-label="Stage">
            <option value="">All stages</option>
            {['FETCH', 'RENDER', 'LLM', 'PIPELINE'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 w-40 text-sm" aria-label="Status">
            <option value="">All results</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
          </Select>
          {totals && <span className="ml-auto text-xs text-muted tabular-nums">This page: {totals.tokens.toLocaleString()} tokens · ${totals.cost.toFixed(5)}</span>}
        </div>
        <Table
          head={
            <tr>
              <th className={th}>Time</th>
              <th className={th}>Stage</th>
              <th className={th}>Result</th>
              <th className={th}>Provider / model</th>
              <th className={cn(th, 'text-right')}>Tokens</th>
              <th className={cn(th, 'text-right')}>Cost</th>
              <th className={cn(th, 'text-right')}>Duration</th>
              <th className={th}>Source / error</th>
            </tr>
          }
        >
          {data?.data.map((l) => (
            <tr key={l.id} className="hover:bg-surface-2/40">
              <td className={cn(td, 'text-xs whitespace-nowrap text-muted')}>{formatDateTime(l.createdAt)}</td>
              <td className={td}><Badge tone="outline">{l.stage}</Badge></td>
              <td className={td}><Badge tone={l.status === 'SUCCESS' ? 'success' : 'danger'}>{l.status === 'SUCCESS' ? 'Success' : 'Failure'}</Badge></td>
              <td className={cn(td, 'text-xs whitespace-nowrap')}>{l.provider ? `${l.provider} · ${l.model}` : '—'}{l.promptVersion && <span className="block text-subtle">{l.promptVersion}</span>}</td>
              <td className={cn(td, 'text-right text-xs tabular-nums')}>{l.totalTokens ? l.totalTokens.toLocaleString() : '—'}</td>
              <td className={cn(td, 'text-right text-xs tabular-nums')}>{l.estimatedCost ? `$${l.estimatedCost.toFixed(5)}` : '—'}</td>
              <td className={cn(td, 'text-right text-xs tabular-nums')}>{l.durationMs != null ? `${l.durationMs} ms` : '—'}</td>
              <td className={cn(td, 'max-w-sm text-xs')}>
                {l.extractionId ? (
                  <Link href={`/admin/extractions/${l.extractionId}`} className="block truncate text-brand hover:underline">{l.sourceUrl}</Link>
                ) : (
                  <span className="block truncate text-muted">{l.sourceUrl}</span>
                )}
                {l.errorMessage && <span className="mt-0.5 block line-clamp-2 text-danger">{l.errorMessage}</span>}
              </td>
            </tr>
          ))}
        </Table>
        {data && <div className="border-t border-line px-4"><Pager page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} /></div>}
      </Card>
    </>
  );
}
