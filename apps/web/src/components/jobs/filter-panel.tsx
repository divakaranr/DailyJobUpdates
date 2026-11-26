'use client';

import { EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES, WORK_MODE_LABELS, WORK_MODES, type TagCategory } from '@jobs/shared';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Checkbox, Input } from '@/components/ui/primitives';
import { useFilterMeta, useTags } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { POSTED_OPTIONS, type Filters, type ListKey } from './filters';

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-3 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-2 py-1 text-sm font-semibold text-fg" aria-expanded={open}>
        {title}
        <ChevronDown className={cn('h-4 w-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="mx-2 grid grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (patch: Partial<Filters>) => void }) {
  const { byCategory } = useTags();
  const { data: meta } = useFilterMeta();
  const [showAllSkills, setShowAllSkills] = useState(false);

  const toggle = (key: ListKey, value: string) => {
    const set = new Set(filters[key]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange({ [key]: [...set] } as Partial<Filters>);
  };

  const tagList = (category: TagCategory, key: ListKey, limit?: number) => {
    const tags = byCategory.get(category) ?? [];
    const visible = limit ? tags.slice(0, limit) : tags;
    return visible.map((t) => <Checkbox key={t.id} checked={filters[key].includes(t.slug)} onChange={() => toggle(key, t.slug)} label={t.name} />);
  };

  const skills = byCategory.get('SKILL') ?? [];

  return (
    <div className="text-sm">
      <Section title="Job status">
        <Segmented
          value={(filters.status || 'active') as 'active' | 'expired' | 'all'}
          onChange={(v) => onChange({ status: v === 'active' ? '' : v })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'expired', label: 'Expired' },
            { value: 'all', label: 'All' },
          ]}
        />
      </Section>

      <Section title="Experience">
        <Segmented
          value={(filters.experience || 'any') as 'any' | 'freshers' | 'experienced'}
          onChange={(v) => onChange({ experience: v === 'any' ? '' : v })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'freshers', label: 'Freshers' },
            { value: 'experienced', label: 'Experienced' },
          ]}
        />
        <div className="mt-2">{tagList('EXPERIENCE', 'experienceLevel')}</div>
      </Section>

      <Section title="Work mode">
        {WORK_MODES.map((m) => (
          <Checkbox key={m} checked={filters.workMode.includes(m)} onChange={() => toggle('workMode', m)} label={WORK_MODE_LABELS[m]} />
        ))}
      </Section>

      <Section title="Employment type">
        {EMPLOYMENT_TYPES.map((m) => (
          <Checkbox key={m} checked={filters.employmentType.includes(m)} onChange={() => toggle('employmentType', m)} label={EMPLOYMENT_TYPE_LABELS[m]} />
        ))}
      </Section>

      <Section title="Job category">{tagList('JOB_CATEGORY', 'category')}</Section>

      <Section title="Skills">
        {tagList('SKILL', 'skills', showAllSkills ? undefined : 8)}
        {skills.length > 8 && (
          <button type="button" onClick={() => setShowAllSkills((s) => !s)} className="px-2 pt-1 text-xs font-semibold text-brand hover:underline">
            {showAllSkills ? 'Show fewer' : `Show all ${skills.length} skills`}
          </button>
        )}
      </Section>

      <Section title="Qualification" defaultOpen={false}>
        {tagList('QUALIFICATION', 'qualification')}
      </Section>

      <Section title="Location">
        <div className="px-2">
          <Input
            placeholder="City or region"
            value={filters.location}
            onChange={(e) => onChange({ location: e.target.value })}
            list="location-suggestions"
            aria-label="Filter by location"
          />
          <datalist id="location-suggestions">
            {meta?.locations.map((l) => <option key={l.name} value={l.name} />)}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {meta?.locations.slice(0, 6).map((l) => (
              <button
                key={l.name}
                type="button"
                onClick={() => onChange({ location: filters.location === l.name ? '' : l.name })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  filters.location === l.name ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Company" defaultOpen={false}>
        <div className="px-2">
          <Input placeholder="Company name" value={filters.company} onChange={(e) => onChange({ company: e.target.value })} list="company-suggestions" aria-label="Filter by company" />
          <datalist id="company-suggestions">
            {meta?.companies.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </Section>

      <Section title="Date posted">
        {POSTED_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-fg hover:bg-surface-2">
            <input type="radio" name="postedWithin" checked={filters.postedWithin === o.value} onChange={() => onChange({ postedWithin: o.value })} className="h-4 w-4 accent-[var(--brand)]" />
            {o.label}
          </label>
        ))}
      </Section>
    </div>
  );
}
