import { isIP } from 'node:net';
import { assert } from './config.js';

/** Produces a DNS-only A/AAAA record; DNS does not forward ports or provide TLS. */
export function dnsRecord(hostname: string, target: string) {
  const name = hostname.trim().toLowerCase().replace(/\.$/, '');
  assert(name.length <= 253 && name.includes('.') && name.split('.').every(x => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(x)), 'Enter a valid fully qualified subdomain.');
  const ip = target.trim();
  const version = isIP(ip);
  assert(version === 4 || version === 6, 'Enter a public IPv4 or IPv6 address.');
  return { name, type: version === 4 ? 'A' : 'AAAA', content: ip, ttl: 1, proxied: false } as const;
}
export async function createCloudflareRecord(record: ReturnType<typeof dnsRecord>) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  const domain = process.env.CLOUDFLARE_ZONE_NAME?.toLowerCase().replace(/\.$/, '');
  assert(token && zone && /^[a-f0-9]{32}$/i.test(zone) && domain, 'Cloudflare is not configured. Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID and CLOUDFLARE_ZONE_NAME on the panel.', 503);
  assert(record.name.endsWith('.' + domain), 'Subdomain must be within the configured Cloudflare zone.');
  const base = `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const existing = await fetch(`${base}?name=${encodeURIComponent(record.name)}&per_page=100`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert(existing.ok, 'Cloudflare could not check existing records. Verify the zone and token.', 502);
  const current = await existing.json() as { success?: boolean; result?: unknown[] };
  assert(current.success && Array.isArray(current.result), 'Cloudflare returned an invalid response.', 502);
  assert(current.result.length === 0, 'This DNS name already has records; ZK will not overwrite them.', 409);
  const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(record), signal: AbortSignal.timeout(15000), redirect: 'error' });
  assert(response.ok, 'Cloudflare could not create the DNS record. Check your token permissions and zone.', 502);
  const result = await response.json() as { success?: boolean };
  assert(result.success, 'Cloudflare did not confirm the DNS record.', 502);
  return record;
}
