import test from "node:test";
import assert from "node:assert/strict";
import { minecraftJavaVersion, runtimeImage } from "../shared/minecraft-runtime.js";
import { dockerCpuPercent } from "../server/docker-runtime.js";

const native = { id: "paper", image: "itzg/minecraft-server:java21", source: "Native ZIYN / itzg/minecraft-server" };
test("Minecraft Java image selection covers common release eras", () => {
  for (const [version, expected] of [["1.12.2", 8], ["1.16.5", 8], ["1.17.1", 17], ["1.20.4", 17], ["1.20.5", 21], ["1.21.11", 21], ["26.1", 25], ["LATEST", 25], ["custom", 21]] as const) {
    assert.equal(minecraftJavaVersion(version), expected, version);
    assert.equal(runtimeImage(native, { VERSION: version }), `itzg/minecraft-server:java${expected}`);
  }
});
test("only native templates select Java images automatically", () => {
  assert.equal(runtimeImage({ ...native, source: "Imported" }, { VERSION: "1.12.2" }), native.image);
  assert.equal(runtimeImage({ ...native, id: "bedrock" }, { VERSION: "1.12.2" }), native.image);
  assert.equal(runtimeImage({ ...native, image: "example/custom:v1" }, { VERSION: "26.1" }), "example/custom:v1");
});
test("CPU percentage uses Docker's precpu and system deltas", () => {
  const stats = { cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 5000, online_cpus: 4 }, precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 4000 } };
  assert.equal(dockerCpuPercent(stats), 40);
  assert.equal(dockerCpuPercent({ cpu_stats: stats.cpu_stats }), 0);
  assert.equal(dockerCpuPercent({ ...stats, precpu_stats: { ...stats.precpu_stats, system_cpu_usage: 5000 } }), 0);
});
