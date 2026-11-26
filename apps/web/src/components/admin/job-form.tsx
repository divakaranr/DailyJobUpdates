'use client';

import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  JOB_STATUS_LABELS,
  SALARY_TYPE_LABELS,
  SALARY_TYPES,
  WORK_MODE_LABELS,
  WORK_MODES,
  jobInputSchema,
  type DuplicateCandidateDTO,
  type ExtractionFlag,
  type FieldMeta,
  type JobAction,
  type JobDTO,
  type JobPreviewDTO,
  type JobStatus,
} from '@jobs/shared';
import { AlertCircle, AlertTriangle, CalendarClock, Copy, Eye, Info, Save, Send, Sparkles, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { PostPreview } from '@/components/jobs/post-preview';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, Field, Input, Select, Spinner, Switch, Textarea } from '@/components/ui/primitives';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { ChipsInput } from './chips-input';
import { JobStatusBadge } from './common';
import { fieldKey, flagsByField, formToPayload, type JobFormState } from './job-form-state';
import { TagPicker } from './tag-picker';

type Mode = 'create' | 'edit' | 'extraction';

const FLAG_STYLE: Record<ExtractionFlag['level'], { cls: string; icon: ReactNode }> = {
  error: { cls: 'text-danger', icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" /> },
  warning: { cls: 'text-warning', icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> },
  info: { cls: 'text-info', icon: <Info className="h-3.5 w-3.5 shrink-0" /> },
};

function FlagList({ flags, className }: { flags: ExtractionFlag[]; className?: string }) {
  if (!flags.length) return null;
  return (
    <ul className={cn('space-y-1', className)}>
      {flags.map((f, i) => (
        <li key={i} className={cn('flex items-start gap-1.5 text-xs leading-snug font-medium', FLAG_STYLE[f.level].cls)}>
          <span className="mt-px">{FLAG_STYLE[f.level].icon}</span>
          {f.message}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function JobForm({
  mode,
  initial,
  jobId,
  extractionId,
  status,
  fieldMeta,
  flags = [],
  onDiscard,
  headerExtra,
}: {
  mode: Mode;
  initial: JobFormState;
  jobId?: string;
  extractionId?: string;
  status?: JobStatus;
  fieldMeta?: FieldMeta | null;
  flags?: ExtractionFlag[];
  onDiscard?: () => void;
  headerExtra?: ReactNode;
}) {
  const router = useRouter();
  const { can } = useAuth();
  const [form, setForm] = useState<JobFormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dup, setDup] = useState<{ action: JobAction; candidates: DuplicateCandidateDTO[] } | null>(null);
  const tagsTouched = useRef(initial.tagIds.length > 0);

  const set = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  // Live, server-rendered preview (same formatter + tagging engine as publishing).
  const draftPayload = useMemo(() => formToPayload(form, 'draft'), [form]);
  const debounced = useDebounced(draftPayload, 500);
  const previewable = jobInputSchema.safeParse(debounced).success;
  const previewKey = previewable ? `preview:${jobId ?? ''}:${JSON.stringify(debounced)}` : null;
  const { data: preview, isValidating: previewLoading } = useSWR<JobPreviewDTO>(previewKey, () =>
    api<JobPreviewDTO>(`/jobs/preview${jobId ? `?excludeJobId=${jobId}` : ''}`, { method: 'POST', body: debounced }),
  );

  useEffect(() => {
    if (!preview || tagsTouched.current) return;
    const ids = preview.suggestedTags.map((t) => t.id).filter(Boolean) as string[];
    if (ids.length) setForm((f) => ({ ...f, tagIds: ids }));
  }, [preview]);

  const fieldFlags = useMemo(() => flagsByField(flags), [flags]);
  const inferred = new Set(fieldMeta?.inferred ?? []);
  const aiBadge = (key: string) =>
    inferred.has(key) ? (
      <Badge tone="warning" icon={<Wand2 className="h-3 w-3" />} className="py-0 text-[10px]">
        AI inferred
      </Badge>
    ) : undefined;
  const notes = (key: string) => <FlagList flags={fieldFlags.get(key) ?? []} />;
  const err = (key: string) => errors[key] || null;

  const submit = async (action: JobAction, opts: { confirmDuplicate?: boolean; updateJobId?: string } = {}) => {
    const payload = formToPayload(form, action, { fieldMeta, confirmDuplicate: opts.confirmDuplicate });
    const parsed = jobInputSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = fieldKey(String(issue.path[0]));
        if (k) next[k] = issue.message;
      }
      setErrors(next);
      toast.error('Please fix the highlighted fields');
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(action);
    try {
      let job: JobDTO;
      if (mode === 'edit') job = await api<JobDTO>(`/jobs/${jobId}`, { method: 'PUT', body: payload });
      else if (mode === 'extraction')
        job = await api<JobDTO>(`/extractions/${extractionId}/publish`, { method: 'POST', body: { ...payload, ...(opts.updateJobId ? { updateJobId: opts.updateJobId } : {}) } });
      else job = await api<JobDTO>('/jobs', { method: 'POST', body: payload });

      const msg: Record<JobStatus, string> = {
        PUBLISHED: 'Job published 🎉',
        PENDING_APPROVAL: 'Submitted for approval',
        DRAFT: 'Draft saved',
        SCHEDULED: 'Job scheduled',
        EXPIRED: 'Saved — the job is already past its deadline, so it is marked expired',
        ARCHIVED: 'Saved',
      };
      toast.success(msg[job.status]);
      setDup(null);
      router.push(job.status === 'PUBLISHED' || job.status === 'EXPIRED' ? `/jobs/${job.id}` : '/admin/jobs');
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE_JOB') {
        setDup({ action, candidates: (e.details as { candidates: DuplicateCandidateDTO[] }).candidates });
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
        const next: Record<string, string> = {};
        for (const d of e.details as { path: string; message: string }[]) {
          const k = fieldKey(d.path);
          if (k) next[k] = d.message;
        }
        setErrors(next);
        toast.error(e.message);
      } else toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const canPublish = can('ADMIN');
  const generalFlags = fieldFlags.get('_general') ?? [];
  const allWarnings = [...(preview?.warnings ?? [])];
  const duplicates = preview?.duplicates ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-6">
        {headerExtra}
        {generalFlags.length > 0 && (
          <Card className="p-4">
            <FlagList flags={generalFlags} />
          </Card>
        )}

        <Section title="Role & company">
          <Field label="Job title" htmlFor="title" error={err('title')} badge={aiBadge('title')} className="sm:col-span-2">
            <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} aria-invalid={!!err('title')} placeholder="e.g. QA Automation Engineer" />
            {notes('title')}
          </Field>
          <Field label="Company" htmlFor="companyName" error={err('companyName')} badge={aiBadge('companyName')}>
            <Input id="companyName" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} aria-invalid={!!err('companyName')} />
            {notes('companyName')}
          </Field>
          <Field label="Company website" htmlFor="companyWebsite" error={err('companyWebsite')}>
            <Input id="companyWebsite" type="url" value={form.companyWebsite} onChange={(e) => set('companyWebsite', e.target.value)} placeholder="https://" aria-invalid={!!err('companyWebsite')} />
          </Field>
          <Field label="Company logo URL" htmlFor="companyLogoUrl" error={err('companyLogoUrl')} hint="Only use logos you're permitted to display." className="sm:col-span-2">
            <Input id="companyLogoUrl" type="url" value={form.companyLogoUrl} onChange={(e) => set('companyLogoUrl', e.target.value)} placeholder="https://…/logo.png" aria-invalid={!!err('companyLogoUrl')} />
          </Field>
          <Field label="Location" htmlFor="location" badge={aiBadge('location')}>
            <Input id="location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Bangalore" />
            {notes('location')}
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Input id="industry" value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. E-commerce" />
          </Field>
          <Field label="Work mode" htmlFor="workMode" badge={aiBadge('workMode')}>
            <Select id="workMode" value={form.workMode} onChange={(e) => set('workMode', e.target.value as JobFormState['workMode'])}>
              <option value="">Not specified</option>
              {WORK_MODES.map((m) => (
                <option key={m} value={m}>{WORK_MODE_LABELS[m]}</option>
              ))}
            </Select>
            {notes('workMode')}
          </Field>
          <Field label="Employment type" htmlFor="employmentType" badge={aiBadge('employmentType')}>
            <Select id="employmentType" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as JobFormState['employmentType'])}>
              <option value="">Not specified</option>
              {EMPLOYMENT_TYPES.map((m) => (
                <option key={m} value={m}>{EMPLOYMENT_TYPE_LABELS[m]}</option>
              ))}
            </Select>
            {notes('employmentType')}
          </Field>
        </Section>

        <Section title="Requirements">
          <Field label="Qualification" htmlFor="qualification" badge={aiBadge('qualification')} className="sm:col-span-2">
            <Input id="qualification" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="e.g. Any Graduation, B.E / B.Tech" />
            {notes('qualification')}
          </Field>
          <Field label="Experience (as written)" htmlFor="experienceText" hint='e.g. "Freshers / Experienced" or "2-4 years"' className="sm:col-span-2">
            <Input id="experienceText" value={form.experienceText} onChange={(e) => set('experienceText', e.target.value)} />
          </Field>
          <Field label="Min experience (years)" htmlFor="minExperience" error={err('minExperience')} badge={aiBadge('minExperience')}>
            <Input id="minExperience" inputMode="decimal" value={form.minExperience} onChange={(e) => set('minExperience', e.target.value)} aria-invalid={!!err('minExperience')} />
            {notes('minExperience')}
          </Field>
          <Field label="Max experience (years)" htmlFor="maxExperience" error={err('maxExperience')}>
            <Input id="maxExperience" inputMode="decimal" value={form.maxExperience} onChange={(e) => set('maxExperience', e.target.value)} aria-invalid={!!err('maxExperience')} />
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={form.isFresherFriendly} onChange={(v) => set('isFresherFriendly', v)} label="Freshers can apply" />
          </div>
          <Field label="Required skills" htmlFor="skills" hint="Press Enter or comma to add. Synonyms (ReactJS → React) are normalised automatically." className="sm:col-span-2">
            <ChipsInput id="skills" value={form.skills} onChange={(v) => set('skills', v)} suggestFrom="/skills" placeholder="Java, Selenium, SQL…" />
            {notes('skills')}
          </Field>
          <Field label="Preferred skills" htmlFor="preferredSkills" className="sm:col-span-2">
            <ChipsInput id="preferredSkills" value={form.preferredSkills} onChange={(v) => set('preferredSkills', v)} suggestFrom="/skills" placeholder="Nice to have…" />
          </Field>
        </Section>

        <Section title="Description">
          <Field label="Summary" htmlFor="summary" hint="One or two sentences shown on job cards." badge={aiBadge('summary')} className="sm:col-span-2">
            <Textarea id="summary" rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} className="min-h-16" />
          </Field>
          <Field label="Job description" htmlFor="description" error={err('description')} className="sm:col-span-2">
            <Textarea id="description" rows={8} value={form.description} onChange={(e) => set('description', e.target.value)} />
            {notes('description')}
          </Field>
          <Field label="Responsibilities" htmlFor="responsibilities" hint="One per line." className="sm:col-span-2">
            <Textarea id="responsibilities" rows={4} value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} />
          </Field>
        </Section>

        <Section title="Compensation" description="Leave blank unless the posting states it explicitly.">
          <Field label="Salary from" htmlFor="salaryMin" error={err('salaryMin')}>
            <Input id="salaryMin" inputMode="numeric" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} aria-invalid={!!err('salaryMin')} />
            {notes('salaryMin')}
          </Field>
          <Field label="Salary to" htmlFor="salaryMax" error={err('salaryMax')}>
            <Input id="salaryMax" inputMode="numeric" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} aria-invalid={!!err('salaryMax')} />
          </Field>
          <Field label="Currency" htmlFor="currency" error={err('currency')} badge={aiBadge('currency')}>
            <Input id="currency" maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} aria-invalid={!!err('currency')} />
          </Field>
          <Field label="Pay period" htmlFor="salaryType">
            <Select id="salaryType" value={form.salaryType} onChange={(e) => set('salaryType', e.target.value as JobFormState['salaryType'])}>
              <option value="">Not specified</option>
              {SALARY_TYPES.map((t) => (
                <option key={t} value={t}>{SALARY_TYPE_LABELS[t].replace('per ', 'Per ')}</option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title="Links & dates">
          <Field label="Application URL" htmlFor="applicationUrl" error={err('applicationUrl')} badge={aiBadge('applicationUrl')} hint="Kept exactly as entered — never shortened or rewritten." className="sm:col-span-2">
            <Input id="applicationUrl" type="url" value={form.applicationUrl} onChange={(e) => set('applicationUrl', e.target.value)} placeholder="https://" aria-invalid={!!err('applicationUrl')} />
            {notes('applicationUrl')}
          </Field>
          <Field label="Original job post URL" htmlFor="sourceUrl" error={err('sourceUrl')} className="sm:col-span-2">
            <Input id="sourceUrl" type="url" value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://" readOnly={mode === 'extraction'} aria-invalid={!!err('sourceUrl')} />
          </Field>
          <Field label="Application deadline" htmlFor="deadline" error={err('deadline')}>
            <Input id="deadline" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} aria-invalid={!!err('deadline')} />
            {notes('deadline')}
          </Field>
          <Field label="Walk-in date" htmlFor="walkInDate" error={err('walkInDate')}>
            <Input id="walkInDate" type="date" value={form.walkInDate} onChange={(e) => set('walkInDate', e.target.value)} />
            {notes('walkInDate')}
          </Field>
          <Field label="Posted on (by employer)" htmlFor="postedDate">
            <Input id="postedDate" type="date" value={form.postedDate} onChange={(e) => set('postedDate', e.target.value)} />
          </Field>
          <Field label="Number of openings" htmlFor="openings" error={err('openings')}>
            <Input id="openings" inputMode="numeric" value={form.openings} onChange={(e) => set('openings', e.target.value)} aria-invalid={!!err('openings')} />
          </Field>
        </Section>

        <Card>
          <CardHeader title="Tags" description="Used for filters and hashtags. Suggestions come from the tagging engine." />
          <div className="p-5">
            <TagPicker
              value={form.tagIds}
              onChange={(ids) => {
                tagsTouched.current = true;
                set('tagIds', ids);
              }}
              suggestions={preview?.suggestedTags ?? []}
            />
          </div>
        </Card>
      </div>

      {/* Sticky review column */}
      <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand" /> Post preview
              </span>
            }
            action={previewLoading ? <Spinner className="h-4 w-4" /> : status ? <JobStatusBadge status={status} /> : undefined}
          />
          <div className="p-4">
            {preview ? (
              <PostPreview post={preview.post} compact />
            ) : (
              <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Enter a title and company to see the generated LinkedIn-style post.</p>
            )}
            {allWarnings.length > 0 && <FlagList flags={allWarnings} className="mt-3" />}
          </div>
        </Card>

        {duplicates.length > 0 && (
          <Card className={cn(duplicates.some((d) => d.isLikelyDuplicate) && 'border-warning/50')}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Copy className="h-4 w-4 text-warning" /> {duplicates.some((d) => d.isLikelyDuplicate) ? 'Likely duplicate' : 'Similar listings'}
                </span>
              }
            />
            <ul className="divide-y divide-line">
              {duplicates.map((d) => (
                <li key={d.jobId} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/jobs/${d.jobId}`} target="_blank" className="min-w-0 text-sm font-semibold text-fg hover:text-brand">
                      {d.title}
                      <span className="block text-xs font-normal text-subtle">
                        {d.companyName}
                        {d.location ? ` · ${d.location}` : ''} · {JOB_STATUS_LABELS[d.status]}
                      </span>
                    </Link>
                    <Badge tone={d.isLikelyDuplicate ? 'warning' : 'neutral'}>{Math.round(d.score * 100)}%</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{d.reasons.join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <p className="text-sm font-bold text-fg">Publish</p>
          <p className="mt-0.5 text-xs text-muted">
            {canPublish ? 'Publishing makes the job visible immediately.' : 'As a Content Editor, your jobs go to an admin for approval.'}
          </p>
          <div className="mt-4 grid gap-2">
            {canPublish ? (
              <Button variant="gradient" size="lg" loading={busy === 'publish'} onClick={() => submit('publish')} icon={<Sparkles className="h-4 w-4" />}>
                {mode === 'edit' && status === 'PUBLISHED' ? 'Save & keep published' : 'Publish now'}
              </Button>
            ) : (
              <Button variant="gradient" size="lg" loading={busy === 'submit'} onClick={() => submit('submit')} icon={<Send className="h-4 w-4" />}>
                Submit for approval
              </Button>
            )}
            <Button variant="secondary" loading={busy === 'draft'} onClick={() => submit('draft')} icon={<Save className="h-4 w-4" />}>
              {mode === 'edit' && status && ['PUBLISHED', 'EXPIRED'].includes(status) ? 'Save changes' : 'Save as draft'}
            </Button>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <Field label="Schedule publication" htmlFor="scheduledAt" error={err('scheduledAt')}>
              <div className="flex gap-2">
                <Input id="scheduledAt" type="datetime-local" value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} className="flex-1" aria-invalid={!!err('scheduledAt')} />
                <Button variant="soft" disabled={!form.scheduledAt} loading={busy === 'schedule'} onClick={() => submit('schedule')} icon={<CalendarClock className="h-4 w-4" />}>
                  Schedule
                </Button>
              </div>
            </Field>
          </div>
          {onDiscard && (
            <Button variant="ghost" size="sm" className="mt-3 w-full text-danger" onClick={onDiscard} icon={<Trash2 className="h-4 w-4" />}>
              Discard extraction
            </Button>
          )}
        </Card>
      </div>

      <Dialog
        open={!!dup}
        onOpenChange={(o) => !o && setDup(null)}
        title="This looks like a duplicate"
        description="A matching job already exists. Review it before publishing to avoid duplicate listings."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDup(null)}>Cancel</Button>
            <Button variant="secondary" loading={!!busy} onClick={() => dup && submit(dup.action, { confirmDuplicate: true })}>
              Publish as a new listing anyway
            </Button>
          </>
        }
      >
        <ul className="space-y-3">
          {dup?.candidates.map((c) => (
            <li key={c.jobId} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-fg">{c.title}</p>
                  <p className="text-sm text-muted">
                    {c.companyName}
                    {c.location ? ` · ${c.location}` : ''} · {JOB_STATUS_LABELS[c.status]}
                  </p>
                  <p className="mt-1 text-xs text-subtle">{c.reasons.join(' · ')}</p>
                </div>
                <Badge tone="warning">{Math.round(c.score * 100)}% match</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/jobs/${c.jobId}`} target="_blank" className="text-sm font-semibold text-brand hover:underline">
                  Review existing
                </Link>
                {mode === 'extraction' ? (
                  <Button size="xs" variant="soft" loading={!!busy} onClick={() => dup && submit(dup.action, { updateJobId: c.jobId })}>
                    Update this listing with the new details
                  </Button>
                ) : (
                  <Link href={`/admin/jobs/${c.jobId}/edit`} className="text-sm font-semibold text-brand hover:underline">
                    Edit existing instead
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
