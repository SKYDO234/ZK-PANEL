import { HttpError } from './config.js';

// Fixed upstreams only: never fetch an arbitrary user-supplied URL.
const sources: Record<string, string> = {
  paper: 'https://fill.papermc.io/v3/projects/paper',
  purpur: 'https://api.purpurmc.org/v2/purpur',
  vanilla: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  fabric: 'https://meta.fabricmc.net/v2/versions/game',
  forge: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
  neoforge: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
  spigot: 'https://hub.spigotmc.org/versions/',
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
  let values: unknown[] = [];
  if (software === 'forge' || software === 'neoforge') {
    const xml = await response.text();
    if (xml.length > 5_000_000) throw new HttpError(502, 'Version catalog is too large.');
    const entries = Array.from(xml.matchAll(/<version>([a-zA-Z0-9._-]{1,64})<\/version>/g), (match) => match[1]);
    values = entries.map((version) => {
      if (software === 'forge') return version.match(/^(1\.\d+(?:\.\d+)?)-/)?.[1];
      const parts = version.match(/^(\d+)\.(\d+)\.\d+(?:-.+)?$/);
      return parts && Number(parts[1]) >= 20 ? `1.${Number(parts[1])}.${Number(parts[2])}` : undefined;
    }).filter(Boolean).reverse();
  }
  if (software === 'spigot') {
    const html = await response.text();
    if (html.length > 5_000_000) throw new HttpError(502, 'Version catalog is too large.');
    values = Array.from(html.matchAll(/href=["'](1\.\d+(?:\.\d+)?)\.json["']/gi), (match) => match[1]).reverse();
  }
  const body: any = ['forge', 'neoforge', 'spigot'].includes(software) ? {} : await response.json();
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
