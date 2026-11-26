import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { isHttpUrl } from '@jobs/shared';

export interface ParsedPage {
  title: string | null;
  text: string;
  jsonLd: Record<string, unknown> | null;
  meta: { siteName: string | null; ogTitle: string | null; description: string | null; canonical: string | null };
  applyLinks: string[];
  links: string[];
  logoUrl: string | null;
  /** Set when the page is a CAPTCHA/login wall that we must not try to bypass. */
  blocked: 'captcha' | 'login' | null;
  /** Heuristic: the page is a JS app shell and likely needs browser rendering. */
  looksDynamic: boolean;
  contentHash: string;
}

const MAX_TEXT = 60_000;

const NOISE_SELECTORS = [
  'script:not([type="application/ld+json"])',
  'style',
  'noscript',
  'template',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'nav',
  'aside',
  'button',
  'select',
  'input',
  'textarea',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[aria-hidden="true"]',
  // Visually hidden text is a common prompt-injection vector — drop it.
  '[style*="display:none" i]',
  '[style*="display: none" i]',
  '[style*="visibility:hidden" i]',
  '[style*="visibility: hidden" i]',
  '[style*="font-size:0" i]',
  'ins.adsbygoogle',
  '[class*="advert" i]',
  '[id*="advert" i]',
  '[class*="ad-slot" i]',
  '[class*="ad-container" i]',
  '[class*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="newsletter" i]',
  '[class*="breadcrumb" i]',
  '[class*="share" i]',
  '[class*="social" i]',
  '[class*="related-jobs" i]',
  '[class*="similar-jobs" i]',
  '[class*="popup" i]',
  '[class*="modal" i]',
].join(',');

const CONTENT_SELECTORS = [
  '[itemtype*="JobPosting"]',
  '[class*="job-description" i]',
  '[id*="job-description" i]',
  '[class*="jobdescription" i]',
  '[class*="job-details" i]',
  '[id*="job-details" i]',
  '[class*="posting" i]',
  'main',
  'article',
  '[role="main"]',
  '#content',
  '.content',
];

const BLOCK_ELEMENTS = 'p,div,section,article,li,ul,ol,h1,h2,h3,h4,h5,h6,tr,table,dt,dd,blockquote,pre,header,footer,main';
const APPLY_LABEL = /\bapply\b|submit (your )?application|application form|send (your )?(cv|resume)/;
const APPLY_HREF = /[/?=_-]apply\b|\/apply\/|jobs\.lever\.co\/.+\/apply|boards\.greenhouse\.io\/.+\/jobs\/|myworkdayjobs\.com\/.+\/apply|smartrecruiters\.com\/.+|jobs\.ashbyhq\.com\/.+\/application|apply\.workable\.com|forms\.gle\/|docs\.google\.com\/forms/i;

function findJobPosting(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return obj;
  if (obj['@graph']) return findJobPosting(obj['@graph']);
  return null;
}

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base).toString();
    return isHttpUrl(u) ? u : null;
  } catch {
    return null;
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/[ \t\f\v ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts the main job content and metadata from raw HTML. Removes navigation,
 * ads, cookie banners and other boilerplate; never executes page scripts.
 */
export function parseHtml(html: string, baseUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  // Structured data first (before scripts are stripped).
  let jsonLd: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd) return;
    try {
      jsonLd = findJobPosting(JSON.parse($(el).text()));
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  });

  const metaContent = (sel: string) => $(sel).attr('content')?.trim() || null;
  const meta = {
    siteName: metaContent('meta[property="og:site_name"]'),
    ogTitle: metaContent('meta[property="og:title"]'),
    description: metaContent('meta[name="description"]') ?? metaContent('meta[property="og:description"]'),
    canonical: absolute($('link[rel="canonical"]').attr('href'), baseUrl),
  };
  const documentTitle = $('title').first().text().trim() || null;

  const rawBodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const lowerHtml = html.slice(0, 400_000).toLowerCase();
  const captchaMarkers = /g-recaptcha|h-captcha|cf-challenge|challenge-platform|captcha-delivery|verify (that )?you are (a )?human|are you a robot/;
  const loginMarkers = /(sign|log) ?in to (view|continue|see|apply)|please (sign|log) ?in|session expired/;
  let blocked: ParsedPage['blocked'] = null;
  if (rawBodyText.length < 1500 && captchaMarkers.test(lowerHtml)) blocked = 'captcha';
  else if (rawBodyText.length < 1500 && $('input[type="password"]').length > 0 && loginMarkers.test(lowerHtml)) blocked = 'login';

  // Logo: JSON-LD organisation logo, else an <img> that looks like a logo.
  const org = (jsonLd as Record<string, any> | null)?.hiringOrganization;
  const ldLogo = typeof org?.logo === 'string' ? org.logo : org?.logo?.url;
  let logoUrl = absolute(ldLogo, baseUrl);
  if (!logoUrl) {
    const img = $('img')
      .filter((_, el) => /logo/i.test(`${$(el).attr('alt') ?? ''} ${$(el).attr('class') ?? ''} ${$(el).attr('src') ?? ''}`))
      .first();
    logoUrl = absolute(img.attr('src'), baseUrl);
  }

  // Apply links — collected before boilerplate removal since buttons often live in headers.
  const applyLinks: string[] = [];
  $('a[href]').each((_, el) => {
    if ($(el).closest('nav, footer, [role="navigation"]').length) return;
    const label = `${$(el).text()} ${$(el).attr('aria-label') ?? ''} ${$(el).attr('title') ?? ''}`.toLowerCase();
    const href = absolute($(el).attr('href'), baseUrl);
    if (!href) return;
    if (APPLY_LABEL.test(label) || APPLY_HREF.test(href)) {
      if (!applyLinks.includes(href) && href !== baseUrl) applyLinks.push(href);
    }
  });

  // Remove boilerplate. Headers/footers are only removed outside main/article.
  $(NOISE_SELECTORS).not('script[type="application/ld+json"]').remove();
  $('header, footer').filter((_, el) => $(el).closest('main, article').length === 0).remove();
  $('script').remove();

  // Choose the densest content container.
  let root = $('body');
  let best = 0;
  for (const sel of CONTENT_SELECTORS) {
    $(sel).each((_, el) => {
      const len = $(el).text().replace(/\s+/g, ' ').trim().length;
      if (len > best && len >= 300) {
        best = len;
        root = $(el) as unknown as typeof root;
      }
    });
    if (best > 0 && sel === '[class*="posting" i]') break; // prefer specific containers over generic ones
  }

  const links: string[] = [];
  root.find('a[href]').each((_, el) => {
    const href = absolute($(el).attr('href'), baseUrl);
    if (href && links.length < 300 && !links.includes(href)) links.push(href);
  });

  root.find('br').replaceWith('\n');
  root.find('li').each((_, el) => {
    $(el).prepend('• ');
  });
  root.find(BLOCK_ELEMENTS).each((_, el) => {
    $(el).append('\n');
  });
  root.find('td,th').each((_, el) => {
    $(el).append(' | ');
  });
  let text = cleanText(root.text());

  // SPA shells often ship the full description inside JSON-LD only.
  const ldDescription = (jsonLd as Record<string, any> | null)?.description;
  if (text.length < 400 && typeof ldDescription === 'string' && ldDescription.length > text.length) {
    text = cleanText(cheerio.load(`<div>${ldDescription}</div>`)('div').text());
  }
  text = text.slice(0, MAX_TEXT);

  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim() || null;
  const jsonTitle = typeof (jsonLd as Record<string, any> | null)?.title === 'string' ? ((jsonLd as any).title as string) : null;

  const looksDynamic =
    !jsonLd &&
    (text.length < 400 ||
      /enable javascript|requires javascript|you need to enable javascript/i.test(rawBodyText.slice(0, 2000)) ||
      ($('#root, #__next, #app, [data-reactroot], app-root').length > 0 && text.length < 800));

  return {
    title: jsonTitle ?? h1 ?? meta.ogTitle ?? documentTitle,
    text,
    jsonLd,
    meta,
    applyLinks: applyLinks.slice(0, 15),
    links,
    logoUrl,
    blocked,
    looksDynamic,
    contentHash: createHash('sha256').update(text).digest('hex'),
  };
}
