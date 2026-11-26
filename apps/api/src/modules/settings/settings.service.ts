import type { PrismaClient } from '@prisma/client';
import {
  generalSettingsSchema,
  llmSettingsSchema,
  LLM_PROVIDERS,
  type GeneralSettings,
  type LlmProviderName,
  type LlmSettings,
} from '@jobs/shared';
import type { Env } from '../../config/env';
import { DEFAULT_MODELS } from '../llm/pricing';

const CACHE_TTL_MS = 10_000;

export class SettingsService {
  private cache = new Map<string, { value: unknown; expires: number }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: Env,
  ) {}

  /** Picks a sensible default provider from whichever API keys are configured. */
  defaultLlmSettings(): LlmSettings {
    const envProvider = LLM_PROVIDERS.find((p) => p === this.env.LLM_PROVIDER);
    let provider: LlmProviderName = envProvider ?? 'heuristic';
    if (!envProvider) {
      if (this.env.GEMINI_API_KEY) provider = 'gemini';
      else if (this.env.OPENAI_API_KEY) provider = 'openai';
      else if (this.env.GROQ_API_KEY) provider = 'groq';
    }
    const fallback = LLM_PROVIDERS.find((p) => p === this.env.LLM_FALLBACK_PROVIDER) ?? null;
    return llmSettingsSchema.parse({
      provider,
      model: this.env.LLM_MODEL ?? DEFAULT_MODELS[provider],
      fallbackProvider: fallback,
      fallbackModel: fallback ? DEFAULT_MODELS[fallback] : null,
    });
  }

  private async read<T>(key: string, parse: (v: unknown) => T, defaults: () => T): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    let value: T;
    try {
      value = row ? parse({ ...(defaults() as object), ...(row.value as object) }) : defaults();
    } catch {
      value = defaults();
    }
    this.cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private async write(key: string, value: unknown, userId?: string) {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object, updatedById: userId },
      update: { value: value as object, updatedById: userId },
    });
    this.cache.delete(key);
  }

  getLlm(): Promise<LlmSettings> {
    return this.read('llm', (v) => llmSettingsSchema.parse(v), () => this.defaultLlmSettings());
  }

  async setLlm(value: LlmSettings, userId?: string): Promise<LlmSettings> {
    const parsed = llmSettingsSchema.parse(value);
    await this.write('llm', parsed, userId);
    return parsed;
  }

  getGeneral(): Promise<GeneralSettings> {
    return this.read('general', (v) => generalSettingsSchema.parse(v), () => generalSettingsSchema.parse({}));
  }

  async setGeneral(value: Partial<GeneralSettings>, userId?: string): Promise<GeneralSettings> {
    const current = await this.getGeneral();
    const parsed = generalSettingsSchema.parse({ ...current, ...value });
    await this.write('general', parsed, userId);
    return parsed;
  }

  clearCache() {
    this.cache.clear();
  }
}
