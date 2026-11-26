'use client';

import { TAG_CATEGORIES, TAG_CATEGORY_LABELS, type TagCategory, type TagDTO } from '@jobs/shared';
import { Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChipsInput } from '@/components/admin/chips-input';
import { PageHeader, Table, td, th } from '@/components/admin/common';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTags } from '@/lib/hooks';
import { cn } from '@/lib/utils';

interface Draft {
  id?: string;
  name: string;
  category: TagCategory;
  synonyms: string[];
  description: string;
  isActive: boolean;
  isSystem?: boolean;
}

export default function TagsPage() {
  const { can } = useAuth();
  const isAdmin = can('ADMIN');
  const { tags, mutate } = useTags({ all: true });
  const [category, setCategory] = useState<TagCategory | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () =>
      tags.filter(
        (t) =>
          (category === 'ALL' || t.category === category) &&
          (!q || t.name.toLowerCase().includes(q.toLowerCase()) || t.synonyms.some((s) => s.includes(q.toLowerCase()))),
      ),
    [tags, category, q],
  );

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { name: draft.name, category: draft.category, synonyms: draft.synonyms, description: draft.description || null, isActive: draft.isActive };
      if (draft.id) await api(`/tags/${draft.id}`, { method: 'PUT', body });
      else await api('/tags', { method: 'POST', body });
      toast.success(draft.id ? 'Tag updated' : 'Tag created');
      setDraft(null);
      mutate();
    } catch (err) {
      const existing = err instanceof ApiError ? (err.details as { existing?: TagDTO })?.existing : undefined;
      toast.error(existing ? `Duplicate of existing tag "${existing.name}" (${TAG_CATEGORY_LABELS[existing.category]})` : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: TagDTO) => {
    try {
      await api(`/tags/${t.id}`, { method: 'PUT', body: { isActive: !t.isActive } });
      toast.success(t.isActive ? `"${t.name}" deactivated` : `"${t.name}" activated`);
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const remove = async (t: TagDTO) => {
    if (!confirm(`Delete tag "${t.name}"? It will be removed from ${t.jobCount ?? 0} job(s).`)) return;
    try {
      await api(`/tags/${t.id}`, { method: 'DELETE' });
      toast.success('Tag deleted');
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Tag taxonomy"
        description="Controlled tags used for filters, hashtags and categorisation. Synonyms map spelling variants onto one tag; for job categories they also act as title keywords."
        actions={
          <Button onClick={() => setDraft({ name: '', category: category === 'ALL' ? 'SKILL' : category, synonyms: [], description: '', isActive: true })} icon={<Plus className="h-4 w-4" />}>
            New tag
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['ALL', ...TAG_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              category === c ? 'border-brand bg-brand text-brand-fg' : 'border-line bg-surface text-muted hover:text-fg',
            )}
          >
            {c === 'ALL' ? 'All' : TAG_CATEGORY_LABELS[c]} <span className="opacity-70">{c === 'ALL' ? tags.length : tags.filter((t) => t.category === c).length}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tags or synonyms" className="h-9 pl-9" aria-label="Search tags" />
        </div>
      </div>

      <Card>
        <Table
          head={
            <tr>
              <th className={th}>Tag</th>
              <th className={th}>Category</th>
              <th className={cn(th, 'hidden md:table-cell')}>Synonyms / keywords</th>
              <th className={cn(th, 'text-right')}>Jobs</th>
              <th className={th}>Active</th>
              <th className={cn(th, 'text-right')}>Actions</th>
            </tr>
          }
        >
          {visible.map((t) => (
            <tr key={t.id} className={cn('hover:bg-surface-2/40', !t.isActive && 'opacity-60')}>
              <td className={td}>
                <span className="flex items-center gap-1.5 font-semibold text-fg">
                  {t.name}
                  {t.isSystem && <Lock className="h-3 w-3 text-subtle" aria-label="System tag" />}
                </span>
                <span className="text-xs text-subtle">{t.slug}</span>
              </td>
              <td className={td}>
                <Badge tone="outline">{TAG_CATEGORY_LABELS[t.category]}</Badge>
              </td>
              <td className={cn(td, 'hidden max-w-md md:table-cell')}>
                <div className="flex flex-wrap gap-1">
                  {t.synonyms.slice(0, 8).map((s) => (
                    <span key={s} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{s}</span>
                  ))}
                  {t.synonyms.length > 8 && <span className="text-[11px] text-subtle">+{t.synonyms.length - 8}</span>}
                </div>
              </td>
              <td className={cn(td, 'text-right tabular-nums')}>{t.jobCount ?? 0}</td>
              <td className={td}>
                <Switch checked={t.isActive} onChange={() => toggleActive(t)} disabled={!isAdmin} />
              </td>
              <td className={cn(td, 'text-right')}>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!isAdmin}
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setDraft({ id: t.id, name: t.name, category: t.category, synonyms: t.synonyms, description: t.description ?? '', isActive: t.isActive, isSystem: t.isSystem })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={!isAdmin || t.isSystem} aria-label={`Delete ${t.name}`} onClick={() => remove(t)} className="hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {!isAdmin && <p className="mt-3 text-xs text-subtle">Content Editors can add tags; editing, deactivating and deleting requires an Admin.</p>}

      <Dialog
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? 'Edit tag' : 'New tag'}
        description="Tags that differ only by case, punctuation or a known synonym are rejected as duplicates."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} loading={busy} disabled={!draft?.name.trim()}>Save tag</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Name" htmlFor="t-name" hint={draft.isSystem ? 'System tags cannot be renamed.' : undefined}>
              <Input id="t-name" value={draft.name} disabled={draft.isSystem} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="t-cat">
              <Select id="t-cat" value={draft.category} disabled={draft.isSystem} onChange={(e) => setDraft({ ...draft, category: e.target.value as TagCategory })}>
                {TAG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{TAG_CATEGORY_LABELS[c]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Synonyms / keywords" htmlFor="t-syn" hint="Alternative spellings that should map to this tag (e.g. reactjs, react.js).">
              <ChipsInput id="t-syn" value={draft.synonyms} onChange={(v) => setDraft({ ...draft, synonyms: v })} placeholder="Add a synonym…" />
            </Field>
            <Field label="Description" htmlFor="t-desc">
              <Textarea id="t-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="min-h-16" />
            </Field>
            <Switch checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="Active (available for tagging and filters)" />
          </div>
        )}
      </Dialog>
    </>
  );
}
