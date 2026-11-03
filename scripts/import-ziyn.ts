import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseZiynDocument } from "../shared/ziyn.js";
import { templates, db, log } from "../server/db.js";
try {
  const files = process.argv.slice(2);
  if (!files.length)
    throw new Error(
      "Usage: npm run ziyn:import -- path/to/template.json [another.json]",
    );
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
    const t = parseZiynDocument(raw);
    if (templates.get(t.id))
      throw new Error(
        `Template ${t.id} already exists; no files were overwritten.`,
      );
    templates.save(t);
    log(
      "system",
      "ziyn.imported",
      `${t.name} imported from ${path.basename(file)}; disabled pending review`,
      "warning",
    );
    console.log(
      `Imported ${t.name} (${t.id}) — disabled until an administrator reviews it.`,
    );
  }
} finally {
  db.close();
}
