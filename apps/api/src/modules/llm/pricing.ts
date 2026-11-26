import type { LlmProviderName } from '@jobs/shared';

export const DEFAULT_MODELS: Record<LlmProviderName, string> = {
  gemini: 'gemini-2.5-flash-lite',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.1-8b-instant',
  ollama: 'llama3.1',
  heuristic: 'rules-v1',
};

/** USD per 1M tokens. Approximate list prices — update as providers change pricing. */
const PRICES: Record<string, { input: number; output: number }> = {
  'gemini:gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini:gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
  'gemini:gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai:gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'openai:gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'groq:llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'groq:llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
};

const PROVIDER_FALLBACK_PRICE: Record<LlmProviderName, { input: number; output: number }> = {
  gemini: { input: 0.1, output: 0.4 },
  openai: { input: 0.15, output: 0.6 },
  groq: { input: 0.05, output: 0.08 },
  ollama: { input: 0, output: 0 },
  heuristic: { input: 0, output: 0 },
};

export function priceFor(provider: LlmProviderName, model: string) {
  return PRICES[`${provider}:${model}`] ?? PROVIDER_FALLBACK_PRICE[provider];
}

export function estimateCost(provider: LlmProviderName, model: string, promptTokens: number, completionTokens: number): number {
  const p = priceFor(provider, model);
  const cost = (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}
