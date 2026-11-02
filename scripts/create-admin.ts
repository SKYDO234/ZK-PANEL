import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createUser } from "../server/auth.js";
import { db } from "../server/db.js";
const rl = stdin.isTTY
  ? createInterface({ input: stdin, output: stdout })
  : null;
const pipedLines = stdin.isTTY
  ? null
  : (async function* () {
      let text = "";
      for await (const chunk of stdin) {
        text += chunk.toString("utf8");
        let index;
        while ((index = text.indexOf("\n")) >= 0) {
          yield text.slice(0, index).replace(/\r$/, "");
          text = text.slice(index + 1);
        }
      }
      if (text) yield text;
    })();
async function prompt(question: string) {
  if (rl) return rl.question(question);
  stdout.write(question);
  const next = await pipedLines!.next();
  if (next.done) throw new Error("Expected a value on standard input.");
  return next.value;
}
try {
  const name = (await prompt("Administrator name: ")).trim();
  const email = (await prompt("Administrator email: ")).trim().toLowerCase();
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Enter a valid name and email.");
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    throw new Error("An account with that email already exists.");
  const password = await hiddenPassword();
  if (password.length < 12 || password.length > 128)
    throw new Error("Use a password between 12 and 128 characters.");
  const user = await createUser(name, email, password, "admin");
  console.log(
    `\nCreated administrator ${user.email}. Sign in at your configured PUBLIC_URL.`,
  );
} finally {
  rl?.close();
  db.close();
}

async function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY) {
    const next = await pipedLines!.next();
    if (next.done) throw new Error("Expected a password on standard input.");
    return next.value.trim();
  }
  stdout.write("Password (at least 12 characters): ");
  rl!.pause();
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    let value = "";
    const listener = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (text === "\r" || text === "\n") {
        stdin.removeListener("data", listener);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        resolve(value);
      } else if (text === "\u0003") {
        stdin.setRawMode(false);
        process.exit(1);
      } else if (text === "\u007f") {
        value = value.slice(0, -1);
      } else value += text;
    };
    stdin.on("data", listener);
  });
}
