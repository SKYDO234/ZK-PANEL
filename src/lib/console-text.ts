/** Normalize terminal output for a text console, including older persisted log lines. */
export function cleanConsoleText(message: string): string {
  return message
    // OSC sequences (e.g. terminal titles), then CSI and single-character escapes.
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/^\s*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\s+/, '');
}
