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

test('Forge and NeoForge derive game releases from upstream Maven metadata', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const versions = String(url).includes('forge.net')
      ? '<version>1.20.1-47.3.0</version><version>1.21.1-52.0.1</version>'
      : '<version>20.4.1</version><version>21.1.100</version>';
    return new Response(`<metadata><versioning><versions>${versions}</versions></versioning></metadata>`);
  }) as typeof fetch;
  try {
    assert.deepEqual(await minecraftVersions('forge'), ['1.21.1', '1.20.1']);
    assert.deepEqual(await minecraftVersions('neoforge'), ['1.21.1', '1.20.4']);
  } finally { globalThis.fetch = original; }
});

test('Spigot version index provides only version JSON filenames', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<a href="1.21.10.json">release</a><a href="../../secret.json">skip</a><a href="1.21.11.json">release</a>')) as typeof fetch;
  try { assert.deepEqual(await minecraftVersions('spigot'), ['1.21.11', '1.21.10']); }
  finally { globalThis.fetch = original; }
});

test('Bedrock and Velocity use their own provider catalogs', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => String(url).includes('BDS-Versions')
    ? new Response(JSON.stringify({linux: {versions: ['1.21.0.1', '1.21.2.1']}}))
    : new Response(JSON.stringify({versions: {'3.4': ['3.4.0-SNAPSHOT', '3.3.0']}}))) as typeof fetch;
  try {
    assert.deepEqual(await minecraftVersions('bedrock'), ['1.21.2.1', '1.21.0.1']);
    assert.deepEqual(await minecraftVersions('velocity'), ['3.4.0-SNAPSHOT', '3.3.0']);
  } finally { globalThis.fetch = original; }
});
