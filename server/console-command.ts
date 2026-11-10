import type { Duplex } from "node:stream";
import { assert, HttpError } from "./config.js";

/** Prepare one command, without allowing terminal controls or additional lines. */
export function consoleInput(line: string, minecraft: boolean): string {
  assert(line.length <= 2000, "Command is too long.");
  assert(!/[\x00-\x1f\x7f-\x9f]/.test(line), "Enter a single command without control characters.");
  const input = minecraft ? line.trim().replace(/^\//, "") : line;
  assert(input.trim().length > 0, "Enter a command.");
  return input;
}

type ConsoleContainer = {
  inspect(): Promise<{ State: { Running: boolean }; Config: { OpenStdin: boolean; StdinOnce?: boolean } }>;
  attach(): Promise<Duplex>;
};

/** Write once to Docker's open stdin. Completion means sent, not executed. */
export async function sendConsoleCommand(container: ConsoleContainer, line: string, minecraft: boolean): Promise<string> {
  const input = consoleInput(line, minecraft);
  const info = await container.inspect();
  assert(info.State.Running, "Start this deployment before sending commands.");
  assert(info.Config.OpenStdin && !info.Config.StdinOnce, "This container does not have persistent console input. Restart the deployment to recreate it with console input enabled.");
  const stream = await container.attach();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let written = false;
    let attachError = false;
    const timeout = setTimeout(() => finish(new HttpError(504, "Timed out sending the command. Check the console before retrying; it may have been received.")), 10000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      // Keep an error listener until destruction; a late socket error must not crash the node.
      stream.destroy();
      if (error) reject(error); else resolve();
    };
    stream.on("error", () => finish(new HttpError(502, "Console connection failed. Check the console before retrying; the command may have been received.")));
    // stdout/stderr are disabled on this attachment, so any response is a
    // Docker attach error, not Minecraft command output (which comes via logs).
    stream.on("data", (chunk: Buffer) => { if (chunk.length) attachError = true; });
    const closed = () => finish(attachError
      ? new HttpError(502, "Docker reported a console attach error. Check the server console and node logs before retrying; the command may have been received.")
      : (written || stream.writableFinished) ? undefined : new HttpError(502, "Console connection closed before the command was sent. Check the console before retrying."));
    stream.once("end", closed);
    stream.once("close", closed);
    // Half-close only the write side. Wait for Docker to finish consuming the
    // input before closing the read side; an immediate destroy can race Docker.
    stream.end(input + "\n", () => { written = true; });
  });
  return "Command sent to the server console. Check the console output for the result.";
}
