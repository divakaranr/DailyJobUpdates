'use client';

import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Free-text multi-value input (Enter or comma adds). Optional server suggestions. */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  suggestFrom,
  id,
  max = 50,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestFrom?: '/skills';
  id?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const q = useDebounced(draft, 200);
  const { data } = useSWR<{ data: string[] }>(suggestFrom && q.length >= 1 ? `${suggestFrom}?q=${encodeURIComponent(q)}` : null);

  const add = (raw: string) => {
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const it of items) if (!lower.has(it.toLowerCase()) && next.length < max) next.push(it.slice(0, 60));
    onChange(next);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 shadow-xs transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 hover:border-line-strong',
      )}
    >
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft py-0.5 pr-1 pl-2 text-xs font-semibold text-brand">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 hover:bg-brand/15" aria-label={`Remove ${v}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        list={suggestFrom ? listId : undefined}
        placeholder={value.length ? '' : placeholder}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle focus:outline-none"
      />
      {suggestFrom && (
        <datalist id={listId}>
          {data?.data.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}
