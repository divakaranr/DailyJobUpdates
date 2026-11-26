'use client';

import { LLM_PROVIDER_LABELS, LLM_PROVIDERS, type GeneralSettings, type LlmProviderName, type LlmProviderStatusDTO, type LlmSettings } from '@jobs/shared';
import { CheckCircle2, CircleDashed, KeyRound, PlayCircle, Plug, RefreshCw, Save, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { PageHeader } from '@/components/admin/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Field, Input, Select, Skeleton, Switch } from '@/components/ui/primitives';
import { api, errorText } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SettingsResponse {
  llm: LlmSettings;
  general: GeneralSettings;
  providers: LlmProviderStatusDTO[];
  promptVersions: string[];
  queue: 'bullmq' | 'in-process';
  browserRendering: boolean;
}

export default function SettingsPage() {
  const { data, mutate } = useSWR<SettingsResponse>('/admin/settings');
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<Record<string, { ok: boolean; message: string; latencyMs: number }>>({});

  useEffect(() => {
    if (data) {
      setLlm(data.llm);
      setGeneral(data.general);
    }
  }, [data]);

  if (!data || !llm || !general) return <Skeleton className="h-96 rounded-2xl" />;
  const providerInfo = (n: LlmProviderName | null) => data.providers.find((p) => p.name === n);

  const saveLlm = async () => {
    setBusy('llm');
    try {
      await api('/admin/settings/llm', { method: 'PUT', body: llm });
      toast.success('LLM configuration saved');
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const saveGeneral = async () => {
    setBusy('general');
    try {
      await api('/admin/settings/general', { method: 'PUT', body: general });
      toast.success('Settings saved');
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const runTest = async (provider: LlmProviderName, model: string) => {
    setBusy(`test-${provider}`);
    try {
      const r = await api<{ ok: boolean; message: string; latencyMs: number }>('/admin/llm/test', { method: 'POST', body: { provider, model } });
      setTest((t) => ({ ...t, [provider]: r }));
      toast[r.ok ? 'success' : 'error'](r.ok ? `${LLM_PROVIDER_LABELS[provider]} connected (${r.latencyMs} ms)` : r.message);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const runMaintenance = async () => {
    setBusy('maint');
    try {
      const r = await api<Record<string, number>>('/admin/maintenance/run', { method: 'POST' });
      toast.success('Maintenance complete', {
        description: `Published ${r.published} scheduled · expired ${r.expiredByDeadline + r.expiredByWalkIn + r.expiredByRule} job(s)`,
      });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="LLM & settings" description="Choose the extraction model, fallbacks and publishing rules. API keys are read from the server environment and never sent to the browser." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.providers.map((p) => (
          <Card key={p.name} className={cn('p-4', llm.provider === p.name && 'border-brand ring-2 ring-brand/20')}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-fg">{p.label}</p>
              {p.configured ? (
                <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>Ready</Badge>
              ) : (
                <Badge tone="neutral" icon={<KeyRound className="h-3 w-3" />}>No key</Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted">{p.defaultModel}</p>
            <p className="mt-2 text-xs text-subtle tabular-nums">
              {p.costPer1MInput === 0 ? 'No API cost' : `$${p.costPer1MInput} / $${p.costPer1MOutput} per 1M tokens`}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="xs" variant="secondary" disabled={!p.configured} loading={busy === `test-${p.name}`} onClick={() => runTest(p.name, llm.provider === p.name ? llm.model : p.defaultModel)} icon={<Plug className="h-3.5 w-3.5" />}>
                Test
              </Button>
              {test[p.name] && <span className={cn('text-xs font-medium', test[p.name].ok ? 'text-success' : 'text-danger')}>{test[p.name].ok ? `${test[p.name].latencyMs} ms` : 'Failed'}</span>}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Extraction model" description="Primary provider, fallback chain, limits and prompt version." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Primary provider" htmlFor="provider" hint={providerInfo(llm.provider)?.configured ? undefined : 'This provider has no API key configured — extraction will fall back.'}>
              <Select id="provider" value={llm.provider} onChange={(e) => {
                const p = e.target.value as LlmProviderName;
                setLlm({ ...llm, provider: p, model: providerInfo(p)?.defaultModel ?? llm.model });
              }}>
                {LLM_PROVIDERS.map((p) => (
                  <option key={p} value={p}>{LLM_PROVIDER_LABELS[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Model" htmlFor="model">
              <Input id="model" value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value })} />
            </Field>
            <Field label="Fallback provider" htmlFor="fallback" hint="The rule-based extractor is always the last resort.">
              <Select id="fallback" value={llm.fallbackProvider ?? ''} onChange={(e) => {
                const p = (e.target.value || null) as LlmProviderName | null;
                setLlm({ ...llm, fallbackProvider: p, fallbackModel: p ? providerInfo(p)?.defaultModel ?? null : null });
              }}>
                <option value="">None</option>
                {LLM_PROVIDERS.filter((p) => p !== llm.provider).map((p) => (
                  <option key={p} value={p}>{LLM_PROVIDER_LABELS[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fallback model" htmlFor="fallbackModel">
              <Input id="fallbackModel" value={llm.fallbackModel ?? ''} disabled={!llm.fallbackProvider} onChange={(e) => setLlm({ ...llm, fallbackModel: e.target.value })} />
            </Field>
            <Field label="Temperature" htmlFor="temperature" hint="Keep low (0–0.2) for faithful extraction.">
              <Input id="temperature" type="number" step="0.05" min={0} max={1} value={llm.temperature} onChange={(e) => setLlm({ ...llm, temperature: Number(e.target.value) })} />
            </Field>
            <Field label="Timeout (ms)" htmlFor="timeoutMs">
              <Input id="timeoutMs" type="number" step={1000} value={llm.timeoutMs} onChange={(e) => setLlm({ ...llm, timeoutMs: Number(e.target.value) })} />
            </Field>
            <Field label="Retries per provider" htmlFor="maxRetries">
              <Input id="maxRetries" type="number" min={0} max={5} value={llm.maxRetries} onChange={(e) => setLlm({ ...llm, maxRetries: Number(e.target.value) })} />
            </Field>
            <Field label="Max input characters" htmlFor="maxInputChars" hint="Caps tokens (and cost) per extraction.">
              <Input id="maxInputChars" type="number" step={1000} value={llm.maxInputChars} onChange={(e) => setLlm({ ...llm, maxInputChars: Number(e.target.value) })} />
            </Field>
            <Field label="Prompt version" htmlFor="promptVersion" className="sm:col-span-2">
              <Select id="promptVersion" value={llm.promptVersion} onChange={(e) => setLlm({ ...llm, promptVersion: e.target.value })}>
                {data.promptVersions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button onClick={saveLlm} loading={busy === 'llm'} icon={<Save className="h-4 w-4" />}>Save model settings</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Publishing & expiry rules" />
            <div className="grid gap-4 p-5">
              <Field label="Default listing period (days)" htmlFor="expiry" hint="Applied when a job has no deadline or walk-in date. Jobs are never assumed active forever.">
                <Input id="expiry" type="number" min={1} max={365} value={general.defaultExpiryDays} onChange={(e) => setGeneral({ ...general, defaultExpiryDays: Number(e.target.value) })} className="max-w-40" />
              </Field>
              <Switch checked={general.requireApprovalForEditors} onChange={(v) => setGeneral({ ...general, requireApprovalForEditors: v })} label="Content Editors need approval to publish" />
              <Switch checked={general.respectRobotsTxt} onChange={(v) => setGeneral({ ...general, respectRobotsTxt: v })} label="Respect robots.txt when fetching URLs" />
              <Switch checked={general.includeSourceAttribution} onChange={(v) => setGeneral({ ...general, includeSourceAttribution: v })} label="Include source attribution in generated posts" />
              <Switch checked={general.showUnavailableFields} onChange={(v) => setGeneral({ ...general, showUnavailableFields: v })} label="Show missing fields in posts" />
              {general.showUnavailableFields && (
                <Field label='Text for missing fields' htmlFor="ns">
                  <Input id="ns" value={general.notSpecifiedText} onChange={(e) => setGeneral({ ...general, notSpecifiedText: e.target.value })} className="max-w-56" />
                </Field>
              )}
              <div className="flex justify-end">
                <Button onClick={saveGeneral} loading={busy === 'general'} icon={<Save className="h-4 w-4" />}>Save rules</Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="System" />
            <dl className="grid gap-3 p-5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted"><Server className="h-4 w-4" /> Job queue</dt>
                <dd><Badge tone={data.queue === 'bullmq' ? 'success' : 'neutral'}>{data.queue === 'bullmq' ? 'Redis / BullMQ' : 'In-process'}</Badge></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted"><CircleDashed className="h-4 w-4" /> JavaScript rendering</dt>
                <dd><Badge tone={data.browserRendering ? 'success' : 'neutral'}>{data.browserRendering ? 'Enabled (Playwright)' : 'Disabled'}</Badge></dd>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-4">
                <dt className="text-muted">Publish scheduled jobs & expire old ones now</dt>
                <dd>
                  <Button size="sm" variant="secondary" loading={busy === 'maint'} onClick={runMaintenance} icon={<RefreshCw className="h-4 w-4" />}>
                    Run
                  </Button>
                </dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-subtle">
              <PlayCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Maintenance also runs automatically every few minutes.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
