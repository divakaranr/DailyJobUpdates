import type { Env } from '../../config/env';
import { assertSafeUrl } from './ssrf';

export interface RenderResult {
  html: string;
  finalUrl: string;
  status: number | null;
}

export interface BrowserRenderer {
  render(url: string): Promise<RenderResult>;
  close(): Promise<void>;
}

type Browser = import('playwright').Browser;

/**
 * Headless Chromium fallback for JavaScript-rendered pages. Every network
 * request the page makes is SSRF-checked; images, media and fonts are blocked
 * to save bandwidth; downloads and service workers are disabled. It does not
 * attempt to solve CAPTCHAs or log in.
 */
export class PlaywrightRenderer implements BrowserRenderer {
  private browser: Promise<Browser> | null = null;
  private active = 0;
  private readonly maxConcurrent = 2;

  constructor(private readonly env: Env) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = (async () => {
        let chromium: typeof import('playwright').chromium;
        try {
          ({ chromium } = await import('playwright'));
        } catch {
          throw new Error('Playwright is not installed');
        }
        try {
          return await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
        } catch (err) {
          throw new Error(
            `Could not launch headless Chromium (run "pnpm --filter @jobs/api playwright:install"): ${(err as Error).message.split('\n')[0]}`,
          );
        }
      })();
      this.browser.catch(() => {
        this.browser = null;
      });
    }
    return this.browser;
  }

  async render(url: string): Promise<RenderResult> {
    if (!this.env.ENABLE_BROWSER_RENDERING) throw new Error('Browser rendering is disabled');
    await assertSafeUrl(url, { allowLoopback: this.env.ALLOW_LOOPBACK_FETCH });
    while (this.active >= this.maxConcurrent) await new Promise((r) => setTimeout(r, 200));
    this.active++;
    const browser = await this.getBrowser().catch((e) => {
      this.active--;
      throw e;
    });
    const context = await browser.newContext({
      userAgent: this.env.FETCH_USER_AGENT,
      serviceWorkers: 'block',
      acceptDownloads: false,
      javaScriptEnabled: true,
    });
    try {
      await context.route('**/*', async (route) => {
        const req = route.request();
        if (['image', 'media', 'font'].includes(req.resourceType())) return route.abort();
        const reqUrl = req.url();
        if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) return route.continue();
        try {
          await assertSafeUrl(reqUrl, { allowLoopback: this.env.ALLOW_LOOPBACK_FETCH });
          return route.continue();
        } catch {
          return route.abort('blockedbyclient');
        }
      });
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.env.BROWSER_TIMEOUT_MS });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      const finalUrl = page.url();
      await assertSafeUrl(finalUrl, { allowLoopback: this.env.ALLOW_LOOPBACK_FETCH });
      const html = await page.content();
      if (html.length > this.env.FETCH_MAX_BYTES * 2) throw new Error('Rendered page is too large');
      return { html, finalUrl, status: response?.status() ?? null };
    } finally {
      await context.close().catch(() => undefined);
      this.active--;
    }
  }

  async close() {
    if (this.browser) {
      const b = await this.browser.catch(() => null);
      await b?.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
