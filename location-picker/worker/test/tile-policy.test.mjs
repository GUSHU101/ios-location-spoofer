import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../src/index.js";
import { PAGE } from "../src/page.js";

const repositoryRoot = new URL("../../../", import.meta.url);
const standardTileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

test("Worker sends an origin-only referrer policy without leaking token paths", async () => {
  const token = "a".repeat(64);
  const response = await worker.fetch(
    new Request(`https://picker.example.test/?token=${token}`),
    {
      TOKEN: token,
      LOC_KV: {
        get: async () => null,
        put: async () => undefined,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});

test("every picker uses the policy-compliant OSM tile URL and attribution", async () => {
  const [artifact, nodeServer] = await Promise.all([
    readFile(new URL("location-picker/cloudflare-webui/worker.js", repositoryRoot), "utf8"),
    readFile(new URL("server.js", new URL("location-picker/", repositoryRoot)), "utf8"),
  ]);

  for (const [name, content] of [
    ["Worker source", PAGE],
    ["dashboard artifact", artifact],
    ["Node server", nodeServer],
  ]) {
    assert.ok(content.includes(standardTileUrl), `${name} does not use the standard OSM tile URL`);
    assert.ok(content.includes("OpenStreetMap</a> contributors"), `${name} has incomplete OSM attribution`);
    assert.doesNotMatch(content, /https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  }
});
