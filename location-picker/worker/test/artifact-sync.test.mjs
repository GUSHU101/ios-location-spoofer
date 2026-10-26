import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildArtifact } from "../scripts/build-webui.mjs";

const artifactPath = new URL("../../cloudflare-webui/worker.js", import.meta.url);

test("dashboard worker artifact matches the canonical source", async () => {
  const [actual, expected] = await Promise.all([
    readFile(artifactPath, "utf8"),
    buildArtifact(),
  ]);
  assert.equal(actual.replaceAll("\r\n", "\n"), expected);
});
