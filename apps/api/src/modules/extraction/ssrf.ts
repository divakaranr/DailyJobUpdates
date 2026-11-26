import dns from 'node:dns';
import ipaddr from 'ipaddr.js';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'kubernetes.default']);
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

function parseIp(ip: string) {
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr;
}

/** True only for globally-routable unicast addresses (blocks private, loopback, link-local, metadata, etc.). */
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  return parseIp(ip).range() === 'unicast';
}

export function isLoopbackIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  return parseIp(ip).range() === 'loopback';
}

/** Public addresses are always allowed; loopback only in test mode. Everything else is refused. */
function isAllowedIp(ip: string, allowLoopback: boolean) {
  return isPublicIp(ip) || (allowLoopback && isLoopbackIp(ip));
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // Single-label hostnames resolve via search domains to internal hosts.
  if (!h.includes('.') && !ipaddr.isValid(h)) return true;
  return false;
}

export interface SsrfOptions {
  /**
   * Test-only: permit loopback targets (127.0.0.0/8, ::1, "localhost") on any port so E2E
   * tests can fetch a local fixture server. Private ranges, link-local and cloud metadata
   * addresses stay blocked. Refused in production by the env schema.
   */
  allowLoopback?: boolean;
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
}

const defaultResolve = (host: string) => dns.promises.lookup(host, { all: true, verbatim: true });

/** Validates syntax, protocol, port, hostname and every resolved address of a URL. */
export async function assertSafeUrl(raw: string, opts: SsrfOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SsrfError('Only http and https URLs are allowed');
  if (url.username || url.password) throw new SsrfError('URLs containing credentials are not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopbackHost = !!opts.allowLoopback && (host === 'localhost' || isLoopbackIp(host));
  if (!ALLOWED_PORTS.has(url.port) && !loopbackHost) throw new SsrfError(`Port ${url.port} is not allowed`);

  if (ipaddr.isValid(host)) {
    if (!isAllowedIp(host, !!opts.allowLoopback)) throw new SsrfError('URLs pointing to private or internal addresses are not allowed');
    return url;
  }
  if (isBlockedHostname(host) && !loopbackHost) throw new SsrfError('URLs pointing to internal hostnames are not allowed');

  let addresses: { address: string }[];
  try {
    addresses = await (opts.resolve ?? defaultResolve)(host);
  } catch {
    throw new SsrfError(`Could not resolve host ${host}`);
  }
  if (addresses.length === 0) throw new SsrfError(`Could not resolve host ${host}`);
  if (addresses.some((a) => !isAllowedIp(a.address, !!opts.allowLoopback))) {
    throw new SsrfError('URL resolves to a private or internal address');
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/**
 * `lookup` replacement for socket connections. Validation happens on the exact
 * addresses the socket will connect to, which closes the DNS-rebinding gap
 * between "check" and "use".
 */
export function createSafeLookup(allowLoopback = false) {
  return (hostname: string, options: dns.LookupOptions | number | LookupCallback, callback?: LookupCallback) => {
    const cb = (typeof options === 'function' ? options : callback) as LookupCallback;
    const opts = (typeof options === 'object' ? options : {}) as dns.LookupOptions;
    dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = addresses as dns.LookupAddress[];
      const bad = list.find((a) => !isAllowedIp(a.address, allowLoopback));
      if (bad || list.length === 0) {
        const e = new SsrfError(`Blocked connection to non-public address for ${hostname}`) as unknown as NodeJS.ErrnoException;
        e.code = 'ESSRF';
        return cb(e);
      }
      if (opts.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}
