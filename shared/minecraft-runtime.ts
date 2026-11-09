/** Choose a Java image only for the panel's native itzg Java Minecraft templates.
 * Unknown/custom version strings remain on Java 21; image selection is still
 * subject to the node's explicit image allowlist. */
export function minecraftJavaVersion(version: string): 8 | 17 | 21 | 25 {
  const v = version.trim().toLowerCase();
  if (v === 'latest' || /^\d{2}\./.test(v)) return 25;
  const match = /^1\.(\d+)(?:\.(\d+))?(?:$|[-_])/.exec(v);
  if (!match) return 21;
  const minor = Number(match[1]), patch = Number(match[2] || 0);
  if (minor <= 16) return 8;
  if (minor < 20 || (minor === 20 && patch <= 4)) return 17;
  return 21;
}
export function runtimeImage(template: { id: string; image: string; source: string }, environment: Record<string, string>): string {
  const nativeJava = ['paper', 'purpur', 'vanilla', 'fabric', 'forge', 'neoforge', 'spigot'];
  if (nativeJava.includes(template.id) && template.source === 'Native ZIYN / itzg/minecraft-server' && template.image === 'itzg/minecraft-server:java21')
    return `itzg/minecraft-server:java${minecraftJavaVersion(environment.VERSION || '')}`;
  return template.image;
}
