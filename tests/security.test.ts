import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "../server/auth.js";
import { encrypt, decrypt, db } from "../server/db.js";
import { catalog } from "../server/catalog.js";
import { validateVariables } from "../server/services.js";
test("password hashes are salted and verify without plaintext storage", async () => {
  const a = await hashPassword("a-long-unique-password"),
    b = await hashPassword("a-long-unique-password");
  assert.notEqual(a, b);
  assert.ok(!a.includes("a-long-unique-password"));
  assert.equal(await verifyPassword("a-long-unique-password", a), true);
  assert.equal(await verifyPassword("wrong-password", a), false);
  assert.equal(await verifyPassword("anything", "!disabled"), false);
});
test("secret encryption authenticates ciphertext", () => {
  const value = randomBytes(32).toString("hex");
  const encrypted = encrypt(value);
  assert.notEqual(encrypted, value);
  assert.equal(decrypt(encrypted), value);
  const parts = encrypted.split(".");
  parts[2] = (parts[2][0] === "0" ? "1" : "0") + parts[2].slice(1);
  assert.throws(() => decrypt(parts.join(".")));
});
test("startup variables enforce EULA and template rules", () => {
  const t = catalog.find((t) => t.id === "paper")!;
  assert.throws(() =>
    validateVariables(t, { EULA: "FALSE", VERSION: "1.21.4" }),
  );
  assert.throws(() =>
    validateVariables(t, {
      EULA: "TRUE",
      VERSION: "1.21.4",
      MAX_PLAYERS: "not-a-number",
    }),
  );
  assert.equal(
    validateVariables(t, { EULA: "TRUE", VERSION: "1.21.4" }).TYPE,
    "PAPER",
  );
});
test("users cannot override runtime isolation variables", () => {
  const t = catalog.find((t) => t.id === "node")!;
  for (const key of ["LD_PRELOAD", "NODE_OPTIONS", "SERVER_PORT", "PATH"])
    assert.throws(() => validateVariables(t, { [key]: "injected" }));
});
test.after(() => db.close());
