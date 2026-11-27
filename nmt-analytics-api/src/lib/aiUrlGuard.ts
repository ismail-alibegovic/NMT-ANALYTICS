import net from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === '::' || norm === '::1') return true;
  if (norm.startsWith('fe80:') || norm.startsWith('fc') || norm.startsWith('fd')) return true;
  if (norm.startsWith('::ffff:')) {
    const v4 = norm.slice(7);
    if (net.isIPv4(v4)) return isPrivateIpv4(v4);
  }
  return false;
}

export function validateAiBaseUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid AI provider base URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('AI provider base URL must use https://');
  }

  if (parsed.username || parsed.password) {
    throw new Error('AI provider base URL must not contain embedded credentials');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('AI provider base URL hostname is not allowed');
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) {
    throw new Error('Private or loopback IPv4 addresses are not allowed for AI provider base URL');
  }
  if (ipVersion === 6 && isPrivateIpv6(host)) {
    throw new Error('Private or loopback IPv6 addresses are not allowed for AI provider base URL');
  }

  return parsed;
}

/**
 * Safely normalizes an AI Base URL, preventing duplicate endpoint suffixes such as
 * `/chat/completions/chat/completions` when a user pastes a full endpoint URL.
 */
export function normalizeAiBaseUrl(rawUrl: string): string {
  const parsed = validateAiBaseUrl(rawUrl);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  const suffixes = ['/chat/completions', '/responses', '/messages', '/models'];
  for (const suffix of suffixes) {
    if (pathname.endsWith(suffix)) {
      pathname = pathname.slice(0, -suffix.length);
      break;
    }
  }
  return `${parsed.origin}${pathname}`.replace(/\/+$/, '');
}
