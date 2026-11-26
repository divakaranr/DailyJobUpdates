import type { LlmProviderName } from '@jobs/shared';
import type { Env } from '../../config/env';
import { LlmProviderError, type LlmCompletionRequest, type LlmCompletionResult, type LlmProvider } from './types';

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new LlmProviderError(timeout ? `Request timed out after ${timeoutMs}ms` : `Network error: ${(err as Error).message}`, true);
  }
  const text = await res.text();
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    // Never echo request headers/keys — only the provider's error body (truncated).
    throw new LlmProviderError(`HTTP ${res.status}: ${text.slice(0, 300)}`, retryable, res.status);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmProviderError('Provider returned a non-JSON response', true);
  }
}

/** OpenAI Chat Completions API — also used for Groq (OpenAI-compatible). */
export class OpenAICompatibleProvider implements LlmProvider {
  constructor(
    public readonly name: LlmProviderName,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {}

  isConfigured() {
    return !!this.apiKey;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.apiKey) throw new LlmProviderError(`${this.name} API key is not configured`, false);
    const data = await postJson(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model: req.model,
        temperature: req.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      { authorization: `Bearer ${this.apiKey}` },
      req.timeoutMs,
    );
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new LlmProviderError('Empty completion', true);
    return {
      text,
      model: data.model ?? req.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  constructor(private readonly apiKey: string | undefined) {}

  isConfigured() {
    return !!this.apiKey;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.apiKey) throw new LlmProviderError('Gemini API key is not configured', false);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`;
    const data = await postJson(
      url,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: { temperature: req.temperature, responseMimeType: 'application/json' },
      },
      { 'x-goog-api-key': this.apiKey },
      req.timeoutMs,
    );
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const reason = data?.promptFeedback?.blockReason;
      throw new LlmProviderError(reason ? `Blocked by provider: ${reason}` : 'No candidates returned', !reason);
    }
    const text = (candidate.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    return {
      text,
      model: req.model,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama' as const;
  constructor(private readonly baseUrl: string) {}

  isConfigured() {
    return !!this.baseUrl;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const data = await postJson(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        model: req.model,
        stream: false,
        format: 'json',
        options: { temperature: req.temperature },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      },
      {},
      req.timeoutMs,
    );
    return {
      text: data?.message?.content ?? '',
      model: data?.model ?? req.model,
      promptTokens: data?.prompt_eval_count ?? 0,
      completionTokens: data?.eval_count ?? 0,
    };
  }
}

export function createProviders(env: Env): Partial<Record<LlmProviderName, LlmProvider>> {
  return {
    gemini: new GeminiProvider(env.GEMINI_API_KEY),
    openai: new OpenAICompatibleProvider('openai', env.OPENAI_BASE_URL, env.OPENAI_API_KEY),
    groq: new OpenAICompatibleProvider('groq', 'https://api.groq.com/openai/v1', env.GROQ_API_KEY),
    ollama: new OllamaProvider(env.OLLAMA_BASE_URL),
  };
}
