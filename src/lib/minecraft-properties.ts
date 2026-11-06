/** Edit only simple, panel-managed keys; leave comments and unrelated properties intact. */
export function readProperty(text: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${key}\\s*[:=]\\s*(.*?)\\s*$`);
  let value: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match) value = match[1];
  }
  return value;
}

export function updateProperties(text: string, changes: Record<string, string>): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([a-z0-9-]+)\s*[:=]/);
    const key = match?.[1];
    if (!key || !Object.hasOwn(changes, key)) return line;
    seen.add(key);
    return `${key}=${changes[key]}`;
  });
  const missing = Object.keys(changes).filter((key) => !seen.has(key));
  if (missing.length) {
    if (lines.at(-1) === '') lines.pop();
    lines.push(...missing.map((key) => `${key}=${changes[key]}`), '');
  }
  return lines.join(newline);
}
