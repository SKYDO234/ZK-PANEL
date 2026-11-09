import test from 'node:test';
import assert from 'node:assert/strict';
import { dnsRecord, createCloudflareRecord } from '../server/subdomain.js';

test('manual DNS validates names and IP addresses', () => {
  assert.deepEqual(dnsRecord('PLAY.example.com.', '203.0.113.10'), { name: 'play.example.com', type: 'A', content: '203.0.113.10', ttl: 1, proxied: false });
  assert.equal(dnsRecord('play.example.com', '2001:db8::1').type, 'AAAA');
  assert.throws(() => dnsRecord('bad/name', '203.0.113.10'));
  assert.throws(() => dnsRecord('play.example.com', 'example.com'));
});
test('Cloudflare creates only new DNS-only records within configured zone', async () => {
  process.env.CLOUDFLARE_ZONE_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_ZONE_NAME = 'example.com';
  process.env.CLOUDFLARE_API_TOKEN = 'secret';
  const real = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  try {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json(calls.length === 1 ? { success: true, result: [] } : { success: true }); };
    const record = dnsRecord('game.example.com', '203.0.113.10');
    await createCloudflareRecord(record);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init?.method, 'POST');
    assert.equal(JSON.parse(String(calls[1].init?.body)).proxied, false);
    await assert.rejects(createCloudflareRecord(dnsRecord('example.com.evil.com', '203.0.113.10')), /configured Cloudflare zone/);
    globalThis.fetch = async () => Response.json({ success: true, result: [{ id: 'existing' }] });
    await assert.rejects(createCloudflareRecord(record), /already has records/);
  } finally { globalThis.fetch = real; delete process.env.CLOUDFLARE_API_TOKEN; delete process.env.CLOUDFLARE_ZONE_ID; delete process.env.CLOUDFLARE_ZONE_NAME; }
});
