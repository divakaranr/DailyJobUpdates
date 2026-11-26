'use client';

import { TAG_CATEGORIES, TAG_CATEGORY_LABELS, type TagAssignment, type TagCategory, type TagDTO } from '@jobs/shared';
import { Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { api, ApiError, errorText } from '@/lib/api';
import { useTags } from '@/lib/hooks';

export function TagPicker({ value, onChange, suggestions }: { value: string[]; onChange: (ids: string[]) => void; suggestions: TagAssignment[] }) {
  const { tags, byCategory, mutate } = useTags();
  const [browse, setBrowse] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<TagCategory>('SKILL');
  const [busy, setBusy] = useState(false);

  const selected = value.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as TagDTO[];
  const pending = suggestions.filter((s) => s.id && !value.includes(s.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const create = async () => {
    setBusy(true);
    try {
      const tag = await api<TagDTO>('/tags', { method: 'POST', body: { name: newName, category: newCat } });
      await mutate();
      onChange([...value, tag.id]);
      toast.success(`Tag "${tag.name}" created`);
      setNewName('');
      setCreating(false);
    } catch (err) {
      const existing = err instanceof ApiError ? (err.details as { existing?: TagDTO })?.existing : undefined;
      if (existing) {
        toast.info(`"${existing.name}" already exists — selected it instead`);
        if (!value.includes(existing.id)) onChange([...value, existing.id]);
        setCreating(false);
      } else toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex min-h-11 flex-wrap gap-1.5 rounded-xl border border-line bg-surface-2/50 p-2">
        {selected.length === 0 && <span className="px-1 py-1 text-sm text-subtle">No tags selected — suggestions appear as you fill the form.</span>}
        {selected.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface py-0.5 pr-1 pl-2 text-xs font-semibold text-fg">
            <span className="text-subtle">{TAG_CATEGORY_LABELS[t.category]}:</span> {t.name}
            <button type="button" onClick={() => toggle(t.id)} className="rounded p-0.5 text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Remove tag ${t.name}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-brand/40 bg-brand-soft/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> Suggested tags
            </p>
            <Button size="xs" variant="soft" onClick={() => onChange([...value, ...pending.map((p) => p.id!)])}>
              Add all
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pending.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.reason}
                onClick={() => toggle(s.id!)}
                className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-surface px-2 py-0.5 text-xs font-medium text-brand hover:border-brand"
              >
                <Plus className="h-3 w-3" /> {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="secondary" onClick={() => setBrowse(true)}>
          Browse all tags
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setCreating(true)} icon={<Plus className="h-3.5 w-3.5" />}>
          New tag
        </Button>
      </div>

      <Dialog open={browse} onOpenChange={setBrowse} title="Select tags" size="lg" footer={<Button onClick={() => setBrowse(false)}>Done ({value.length})</Button>}>
        <div className="grid gap-5 sm:grid-cols-2">
          {TAG_CATEGORIES.filter((c) => byCategory.get(c)?.length).map((c) => (
            <div key={c}>
              <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-subtle uppercase">{TAG_CATEGORY_LABELS[c]}</p>
              {byCategory.get(c)!.map((t) => (
                <Checkbox key={t.id} checked={value.includes(t.id)} onChange={() => toggle(t.id)} label={t.name} />
              ))}
            </div>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Create a tag"
        description="Near-duplicates (different case, spelling or a known synonym) are detected automatically."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} loading={busy} disabled={!newName.trim()}>Create tag</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="tag-name">
            <Input id="tag-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Golang" autoFocus />
          </Field>
          <Field label="Category" htmlFor="tag-cat">
            <Select id="tag-cat" value={newCat} onChange={(e) => setNewCat(e.target.value as TagCategory)}>
              {TAG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TAG_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
