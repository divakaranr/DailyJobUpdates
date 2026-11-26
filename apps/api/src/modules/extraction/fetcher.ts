import robotsParser from 'robots-parser';
import { Agent, request } from 'undici';
import type { Env } from '../../config/env';
import { ExtractionError } from '../../lib/errors';
import { assertSafeUrl, createSafeLookup, SsrfError } from './ssrf';

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  redirects: string[];
}

export interface FetchOptions {
  checkRobots?: boolean;
  /** When true, non-2xx responses are returned instead of thrown. */
  allowErrorStatus?: boolean;
}

export interface PageFetcher {
  fetchPage(url: string, opts?: FetchOptions): Promise<FetchResult>;
  assertRobotsAllowed(url: string): Promise<void>;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const ACCEPTED_TYPES = /text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RobotsDisallowedError extends ExtractionError {
  constructor(url: string) {
    super(`robots.txt for ${new URL(url).host} disallows automated access to this page. Create the job manually instead.`);
  }
}

/**
 * HTTP client for untrusted URLs: SSRF-validated on every hop and at socket
 * connect time, manual redirect handling, response size cap, timeouts,
 * retries with backoff, per-host throttling and optional robots.txt checks.
 */
export class SafeFetcher implements PageFetcher {
  private readonly agent: Agent;
  private readonly hostNextSlot = new Map<string, number>();
  private readonly robotsCache = new Map<string, { robots: ReturnType<typeof robotsParser> | null; expires: number }>();

  constructor(private readonly env: Env) {
    this.agent = new Agent({
      connect: { lookup: createSafeLookup(env.ALLOW_LOOPBACK_FETCH) as any, timeout: env.FETCH_TIMEOUT_MS },
      headersTimeout: env.FETCH_TIMEOUT_MS,
      bodyTimeout: env.FETCH_TIMEOUT_MS,
    });
  }

  private async throttle(host: string) {
    const now = Date.now();
    const slot = Math.max(now, this.hostNextSlot.get(host) ?? 0);
    this.hostNextSlot.set(host, slot + this.env.FETCH_HOST_INTERVAL_MS);
    if (slot > now) await sleep(slot - now);
  }

  private async once(url: URL, maxBytes: number) {
    const res = await request(url, {
      method: 'GET',
      dispatcher: this.agent,
      signal: AbortSignal.timeout(this.env.FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': this.env.FETCH_USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const headers = res.headers;
    const status = res.statusCode;
    if (REDIRECT_CODES.has(status)) {
      await res.body.dump();
      return { status, headers, body: '' };
    }
    const contentType = String(headers['content-type'] ?? '');
    if (status < 400 && contentType && !ACCEPTED_TYPES.test(contentType)) {
      await res.body.dump();
      throw new ExtractionError(`Unsupported content type "${contentType.split(';')[0]}" — only HTML pages can be extracted`);
    }
    const declared = Number(headers['content-length'] ?? 0);
    if (declared > maxBytes) {
      await res.body.dump();
      throw new ExtractionError(`Page is too large (${declared} bytes; limit ${maxBytes})`);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) {
        res.body.destroy();
        throw new ExtractionError(`Page is too large (limit ${maxBytes} bytes)`);
      }
      chunks.push(chunk as Buffer);
    }
    const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/["']/g, '') ?? 'utf-8';
    let body: string;
    try {
      body = new TextDecoder(charset).decode(Buffer.concat(chunks));
    } catch {
      body = new TextDecoder('utf-8').decode(Buffer.concat(chunks));
    }
    return { status, headers, body };
  }

  private async withRetry(url: URL, maxBytes: number) {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.env.FETCH_RETRIES; attempt++) {
      try {
        const res = await this.once(url, maxBytes);
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.env.FETCH_RETRIES) {
          const retryAfter = Number(res.headers['retry-after']);
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * 3 ** attempt);
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        const code = (err as NodeJS.ErrnoException)?.code;
        if (err instanceof SsrfError || code === 'ESSRF' || err instanceof ExtractionError) throw err;
        if (attempt < this.env.FETCH_RETRIES) await sleep(500 * 3 ** attempt);
      }
    }
    const e = lastErr as NodeJS.ErrnoException;
    if (e?.code === 'ESSRF' || e?.cause instanceof SsrfError) throw new SsrfError(e.message);
    throw new ExtractionError(`Could not reach the page: ${e?.message ?? 'network error'}`, true);
  }

  async fetchPage(rawUrl: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const redirects: string[] = [];
    let current = rawUrl;
    for (let hop = 0; hop <= this.env.FETCH_MAX_REDIRECTS; hop++) {
      const url = await assertSafeUrl(current, { allowLoopback: this.env.ALLOW_LOOPBACK_FETCH });
      if (opts.checkRobots) await this.assertRobotsAllowed(url.toString());
      await this.throttle(url.host);
      const res = await this.withRetry(url, this.env.FETCH_MAX_BYTES);
      if (REDIRECT_CODES.has(res.status)) {
        const location = res.headers.location;
        if (!location || Array.isArray(location)) throw new ExtractionError('Redirect without a valid Location header');
        current = new URL(location, url).toString();
        redirects.push(current);
        continue;
      }
      if (res.status >= 400 && !opts.allowErrorStatus) {
        throw new ExtractionError(`The page returned HTTP ${res.status}`, res.status >= 500);
      }
      return { url: url.toString(), status: res.status, contentType: String(res.headers['content-type'] ?? ''), body: res.body, redirects };
    }
    throw new ExtractionError(`Too many redirects (more than ${this.env.FETCH_MAX_REDIRECTS})`);
  }

  async assertRobotsAllowed(rawUrl: string): Promise<void> {
    const url = new URL(rawUrl);
    const origin = url.origin;
    let entry = this.robotsCache.get(origin);
    if (!entry || entry.expires < Date.now()) {
      let robots: ReturnType<typeof robotsParser> | null = null;
      try {
        const robotsUrl = `${origin}/robots.txt`;
        const res = await this.fetchPage(robotsUrl, { allowErrorStatus: true });
        if (res.status >= 200 && res.status < 300) robots = robotsParser(robotsUrl, res.body.slice(0, 500_000));
      } catch (err) {
        if (err instanceof SsrfError) throw err;
        robots = null; // unreachable robots.txt → treat as no restrictions
      }
      entry = { robots, expires: Date.now() + 60 * 60 * 1000 };
      this.robotsCache.set(origin, entry);
    }
    if (entry.robots && entry.robots.isAllowed(rawUrl, this.env.FETCH_USER_AGENT) === false) {
      throw new RobotsDisallowedError(rawUrl);
    }
  }

  async close() {
    await this.agent.close();
  }
}
