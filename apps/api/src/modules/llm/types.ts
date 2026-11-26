import type { LlmProviderName } from '@jobs/shared';

export interface LlmCompletionRequest {
  system: string;
  user: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface LlmCompletionResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  isConfigured(): boolean;
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

/** Error from a provider HTTP call; `retryable` covers rate limits, 5xx and timeouts. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

/** Everything the extractor knows about a fetched page. Page content is untrusted. */
export interface ExtractionContext {
  sourceUrl: string;
  pageTitle: string | null;
  text: string;
  jsonLd: Record<string, unknown> | null;
  meta: { siteName: string | null; ogTitle: string | null; description: string | null };
  applyLinks: string[];
  links: string[];
  logoUrl: string | null;
}
