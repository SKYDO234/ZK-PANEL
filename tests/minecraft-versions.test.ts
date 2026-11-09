import test from 'node:test';
import assert from 'node:assert/strict';
import { minecraftVersions } from '../server/minecraft-versions.js';

test('version lookup uses the selected fixed upstream and returns available versions', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(
      JSON.stringify({ versions: { '1.21': ['1.21.11', '1.21.10'], '1.20': ['1.20.6'] } }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    assert.deepEqual(await minecraftVersions('paper'), ['1.21.11', '1.21.10', '1.20.6']);
    assert.equal(urls[0], 'https://fill.papermc.io/v3/projects/paper');
    await assert.rejects(minecraftVersions('https://evil.example'), /not yet available/);
    assert.equal(urls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
