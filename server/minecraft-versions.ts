import { HttpError } from './config.js';

// Fixed upstreams only: never fetch an arbitrary user-supplied URL.
const sources: Record<string, string> = {
  paper: 'https://fill.papermc.io/v3/projects/paper',
  purpur: 'https://api.purpurmc.org/v2/purpur',
  vanilla: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  fabric: 'https://meta.fabricmc.net/v2/versions/game',
};
const cache = new Map<string, { until: number; versions: string[] }>();
export async function minecraftVersions(software: string): Promise<string[]> {
  const url = Object.hasOwn(sources, software) ? sources[software] : undefined;
  if (!url)
    throw new HttpError(
      400,
      'Version lookup is not yet available for this software. Enter a supported version manually.',
    );
  const saved = cache.get(software);
  if (saved && saved.until > Date.now()) return saved.versions;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ZK-PANEL/1.0 (Minecraft version lookup)', Accept: 'application/json' },
    });
  } catch {
    throw new HttpError(
      502,
      'Could not reach the software version provider. Enter a version manually or try again later.',
    );
  }
  if (!response.ok)
    throw new HttpError(
      502,
      'The software version provider is unavailable. Enter a version manually or try again later.',
    );
  const body: any = await response.json();
  let values: unknown[] = [];
  if (software === 'paper')
    values = Array.isArray(body.versions)
      ? body.versions
      : (Object.values(body.versions || {}).flat() as unknown[]);
  if (software === 'purpur') values = body.versions || [];
  if (software === 'vanilla')
    values = (body.versions || []).filter((v: any) => v.type === 'release').map((v: any) => v.id);
  if (software === 'fabric')
    values = (Array.isArray(body) ? body : []).filter((v: any) => v.stable).map((v: any) => v.version);
  const versions = [
    ...new Set(values.filter((v): v is string => typeof v === 'string' && /^[a-zA-Z0-9._-]{1,32}$/.test(v))),
  ];
  if (!versions.length)
    throw new HttpError(
      502,
      'The provider returned no versions. Enter a version manually or try again later.',
    );
  cache.set(software, { until: Date.now() + 15 * 60_000, versions });
  return versions;
}
