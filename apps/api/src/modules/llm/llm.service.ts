import { llmExtractionSchema, type LlmExtraction, type LlmProviderName, type LlmSettings } from '@jobs/shared';
import { errorMessage } from '../../lib/errors';
import type { SettingsService } from '../settings/settings.service';
import { heuristicExtract } from './heuristic';
import { parseModelJson } from './json';
import { DEFAULT_MODELS, estimateCost } from './pricing';
import { getPrompt, REPAIR_SUFFIX } from './prompts';
import { LlmProviderError, type ExtractionContext, type LlmProvider } from './types';

export interface LlmLogEntry {
  extractionId?: string | null;
  sourceUrl: string;
  stage: 'LLM';
  status: 'SUCCESS' | 'FAILURE';
  provider: string;
  model: string;
  promptVersion: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  durationMs: number;
  errorMessage?: string | null;
}

export type LlmLogWriter = (entry: LlmLogEntry) => Promise<void>;

export interface LlmRunResult {
  extraction: LlmExtraction;
  provider: LlmProviderName;
  model: string;
  promptVersion: string;
  usage: { promptTokens: number; completionTokens: number; cost: number };
  /** Messages about providers that failed before this one succeeded. */
  fallbackNotes: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Provider-agnostic LLM orchestration: prompt versioning, JSON validation with a
 * repair retry, transient-error retries with backoff, fallback providers, token
 * and cost accounting. The final fallback is the rule-based extractor so the
 * pipeline still produces a reviewable draft when every LLM is unavailable.
 */
export class LlmService {
  constructor(
    private readonly providers: Partial<Record<LlmProviderName, LlmProvider>>,
    private readonly settings: SettingsService,
    private readonly writeLog: LlmLogWriter,
    private readonly opts: { backoffMs?: number } = {},
  ) {}

  providerStatus(name: LlmProviderName): boolean {
    if (name === 'heuristic') return true;
    return this.providers[name]?.isConfigured() ?? false;
  }

  async extractJob(ctx: ExtractionContext, meta: { extractionId?: string } = {}): Promise<LlmRunResult> {
    const cfg = await this.settings.getLlm();
    const chain: { provider: LlmProviderName; model: string }[] = [{ provider: cfg.provider, model: cfg.model }];
    if (cfg.fallbackProvider && cfg.fallbackProvider !== cfg.provider) {
      chain.push({ provider: cfg.fallbackProvider, model: cfg.fallbackModel || DEFAULT_MODELS[cfg.fallbackProvider] });
    }
    if (!chain.some((c) => c.provider === 'heuristic')) {
      chain.push({ provider: 'heuristic', model: DEFAULT_MODELS.heuristic });
    }

    const notes: string[] = [];
    for (const step of chain) {
      try {
        const result = await this.runProvider(step.provider, step.model, cfg, ctx, meta.extractionId);
        return { ...result, fallbackNotes: notes };
      } catch (err) {
        notes.push(`${step.provider} (${step.model}) failed: ${errorMessage(err)}`);
      }
    }
    throw new Error(`All extraction providers failed. ${notes.join(' | ')}`);
  }

  private async runProvider(
    providerName: LlmProviderName,
    model: string,
    cfg: LlmSettings,
    ctx: ExtractionContext,
    extractionId?: string,
  ): Promise<Omit<LlmRunResult, 'fallbackNotes'>> {
    const prompt = getPrompt(cfg.promptVersion);
    const base = { extractionId, sourceUrl: ctx.sourceUrl, stage: 'LLM' as const, provider: providerName, model, promptVersion: prompt.version };

    if (providerName === 'heuristic') {
      const started = Date.now();
      const extraction = heuristicExtract(ctx);
      await this.writeLog({ ...base, status: 'SUCCESS', promptTokens: 0, completionTokens: 0, estimatedCost: 0, durationMs: Date.now() - started });
      return { extraction, provider: providerName, model, promptVersion: 'rules@v1', usage: { promptTokens: 0, completionTokens: 0, cost: 0 } };
    }

    const provider = this.providers[providerName];
    if (!provider || !provider.isConfigured()) {
      const msg = `${providerName} is not configured (missing API key or endpoint)`;
      await this.writeLog({ ...base, status: 'FAILURE', promptTokens: 0, completionTokens: 0, estimatedCost: 0, durationMs: 0, errorMessage: msg });
      throw new Error(msg);
    }

    let userPrompt = prompt.buildUser(ctx, cfg.maxInputChars);
    let totalPrompt = 0;
    let totalCompletion = 0;
    let lastError: unknown;
    const attempts = cfg.maxRetries + 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const started = Date.now();
      try {
        const res = await provider.complete({ system: prompt.system, user: userPrompt, model, temperature: cfg.temperature, timeoutMs: cfg.timeoutMs });
        totalPrompt += res.promptTokens;
        totalCompletion += res.completionTokens;
        const cost = estimateCost(providerName, model, res.promptTokens, res.completionTokens);
        let parsed: LlmExtraction;
        try {
          const json = parseModelJson(res.text);
          if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Expected a JSON object');
          parsed = llmExtractionSchema.parse(json);
        } catch (validationErr) {
          await this.writeLog({ ...base, status: 'FAILURE', promptTokens: res.promptTokens, completionTokens: res.completionTokens, estimatedCost: cost, durationMs: Date.now() - started, errorMessage: `Invalid structured output: ${errorMessage(validationErr)}` });
          lastError = validationErr;
          userPrompt = prompt.buildUser(ctx, cfg.maxInputChars) + REPAIR_SUFFIX;
          continue;
        }
        await this.writeLog({ ...base, status: 'SUCCESS', promptTokens: res.promptTokens, completionTokens: res.completionTokens, estimatedCost: cost, durationMs: Date.now() - started });
        return {
          extraction: parsed,
          provider: providerName,
          model,
          promptVersion: prompt.version,
          usage: { promptTokens: totalPrompt, completionTokens: totalCompletion, cost: estimateCost(providerName, model, totalPrompt, totalCompletion) },
        };
      } catch (err) {
        lastError = err;
        await this.writeLog({ ...base, status: 'FAILURE', promptTokens: 0, completionTokens: 0, estimatedCost: 0, durationMs: Date.now() - started, errorMessage: errorMessage(err) });
        const retryable = err instanceof LlmProviderError ? err.retryable : true;
        if (!retryable) break;
        if (attempt < attempts) await sleep((this.opts.backoffMs ?? 750) * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Sends a tiny request to verify credentials/connectivity for a provider. */
  async testProvider(name: LlmProviderName, model: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
    const started = Date.now();
    if (name === 'heuristic') return { ok: true, latencyMs: 0, message: 'Rule-based extractor is always available' };
    const provider = this.providers[name];
    if (!provider?.isConfigured()) return { ok: false, latencyMs: 0, message: 'Provider is not configured (set its API key in the server environment)' };
    try {
      const res = await provider.complete({
        system: 'Respond with JSON only.',
        user: 'Return {"ok": true}',
        model,
        temperature: 0,
        timeoutMs: 20_000,
      });
      const json = parseModelJson(res.text) as { ok?: boolean };
      return { ok: json?.ok === true, latencyMs: Date.now() - started, message: json?.ok ? 'Connected' : 'Unexpected response' };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, message: errorMessage(err) };
    }
  }
}
