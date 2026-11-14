"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "location-spoofer.js"), "utf8");
const core = require("../../location-spoofer.js");
const configUrl = "https://picker.example.test/loc.json?token=secret-not-for-logs";
const remote = {
  enabled: true, latitude: 39.9042, longitude: 116.4074,
  altitude: 44, horizontalAccuracy: 15, verticalAccuracy: 20
};

function freshStore() {
  const state = new Map();
  return {
    state,
    api: {
      read(key) { return state.get(key) ?? null; },
      write(data, key) {
        assert.equal(typeof data, "string");
        assert.equal(typeof key, "string");
        state.set(key, data);
        return true;
      }
    }
  };
}
function vmCore(store) {
  const context = { module: { exports: {} }, $persistentStore: store.api };
  vm.runInNewContext(source, context, { filename: "location-spoofer.js" });
  return context.module.exports;
}
function originalResponse() {
  const location = core.concatBytes([
    core.makeVarintField(1, 3733490000),
    core.makeVarintField(2, -12200902000)
  ]);
  const wifi = core.makeLengthDelimitedField(2, location);
  const payload = core.makeLengthDelimitedField(2, wifi);
  return core.buildAppleWLocResponse(payload);
}
function invokeScript({ responseBytes = originalResponse(), status = 200, body = JSON.stringify(remote),
                        error = null, store = freshStore(), encoding = "", utils = undefined,
                        argument = null } = {}) {
  const calls = [];
  const logs = [];
  const ctx = {
    $argument: argument ?? "mode=response&debug=true&configUrl=" + encodeURIComponent(configUrl),
    $request: { url: "https://gs-loc.apple.com/clls/wloc" },
    $response: {
      status: 200,
      headers: encoding ? { "Content-Encoding": encoding } : {},
      bodyBytes: responseBytes
    },
    $persistentStore: store.api,
    $httpClient: {
      get(options, callback) {
        assert.equal(options.url, configUrl);
        callback(error, { status }, body);
      }
    },
    $done(value) { calls.push(value); },
    $utils: utils,
    console: { log(message) { logs.push(String(message)); } }
  };
  vm.runInNewContext(source, ctx, { filename: "location-spoofer.js" });
  assert.equal(calls.length, 1, "script must finish once");
  return { done: calls[0], logs, store };
}

test("encoded remote URL parses without leaking token into other arguments", () => {
  const args = core.parseArgumentString("mode=response&configUrl=" +
    encodeURIComponent(configUrl) + "&debug=true");
  assert.equal(args.configUrl, configUrl);
  assert.equal(args.debug, "true");
});
test("duplicate configUrl is rejected instead of silently picking an old endpoint", () => {
  assert.throws(() => core.parseArgumentString("configUrl=" + encodeURIComponent(configUrl) +
    "&configUrl=" + encodeURIComponent("https://picker.example.test/loc.json?token=other")),
  /DUPLICATE_CONFIG_URL/);
});
test("remote schema accepts only valid coordinates and supported fields", () => {
  assert.equal(core.validateRemoteConfig(remote).latitude, 39.9042);
  for (const invalid of [
    null, {}, { latitude: "invalid", longitude: 1 },
    { latitude: 99, longitude: 1 },
    { latitude: 1, longitude: -181 },
    { latitude: 1, longitude: 2, enabled: "false" }
  ]) {
    assert.throws(() => core.validateRemoteConfig(invalid), /REMOTE_CONFIG_INVALID/);
  }
  const out = core.validateRemoteConfig({ ...remote, unexpected: "not forwarded" });
  assert.equal(Object.hasOwn(out, "unexpected"), false);
});
test("cache writes data as first parameter, key as second", () => {
  const store = freshStore();
  const api = vmCore(store);
  api.writeRemoteConfigCache(configUrl, remote);
  const entry = JSON.parse(store.state.get("location_spoofer_remote_cfg"));
  assert.equal(entry.data.latitude, remote.latitude);
  assert.equal(api.readRemoteConfigCache(configUrl).latitude, remote.latitude);
  assert.equal(api.readRemoteConfigCache("https://other.invalid"), null);
});
test("network-first response uses newly saved coordinates on this very request", () => {
  const result = invokeScript();
  assert.ok(result.done.body);
  const extracted = core.extractAppleWLocPayload(result.done.body);
  const wifi = core.firstFieldByNumber(core.parseFields(extracted.payload), 2);
  const location = core.firstFieldByNumber(core.parseFields(wifi.valueBytes), 2);
  assert.match(core.locationSummary(location.valueBytes), /^39\.9042,116\.4074/);
  assert.ok(result.logs.some(x => x.includes("REMOTE_CONFIG_FRESH")));
  assert.ok(result.store.state.has("location_spoofer_remote_cfg"));
  assert.equal(result.logs.some(x => x.includes("secret-not-for-logs")), false);
});
test("HTTP 401 without a last-known-good cache passes through without applying default location", () => {
  const result = invokeScript({ status: 401, body: JSON.stringify({ error: "authentication required" }) });
  assert.equal(Object.hasOwn(result.done, "body"), false);
  assert.ok(result.logs.some(x => x.includes("REMOTE_CONFIG_UNAVAILABLE")));
});
test("failed request uses validated last-known-good cache", () => {
  const store = freshStore();
  vmCore(store).writeRemoteConfigCache(configUrl, remote);
  const result = invokeScript({ error: "offline", store });
  assert.ok(result.done.body);
  assert.ok(result.logs.some(x => x.includes("REMOTE_CONFIG_STALE_FALLBACK")));
});
test("gzip input uses decompressed bytes, not the original bodyBytes", () => {
  const compressed = zlib.gzipSync(Buffer.from(originalResponse()));
  const result = invokeScript({
    responseBytes: compressed, encoding: "gzip",
    utils: { ungzip(input) { return zlib.gunzipSync(Buffer.from(input)); } }
  });
  assert.ok(result.done.body);
  assert.match(result.logs.join("\n"), /response decompressed/);
});
test("preserves synthetic trailing bytes and bare protobuf framing", () => {
  const raw = originalResponse();
  const withSuffix = core.concatBytes([raw, new Uint8Array([0xaa, 0xbb])]);
  const patched = core.spoofAppleResponse(withSuffix, remote);
  assert.equal(patched.response.at(-2), 0xaa);
  assert.equal(patched.response.at(-1), 0xbb);
  const bare = core.extractAppleWLocPayload(raw).payload;
  const barePatched = core.spoofAppleResponse(bare, remote);
  assert.equal(barePatched.kind, "bare");
  assert.equal(barePatched.response[0], bare[0]);
});
test("no matching Wi-Fi or cell payload reports failure and passes through", () => {
  const other = core.buildAppleWLocResponse(core.makeVarintField(6, 10));
  const result = invokeScript({ responseBytes: other });
  assert.equal(Object.hasOwn(result.done, "body"), false);
  assert.match(result.logs.join("\n"), /NO_PATCHABLE_LOCATION_FIELDS/);
});
test("public Shadowrocket module does not embed a live picker credential", () => {
  const moduleText = fs.readFileSync(path.join(root, "ios-location-spoofer.sgmodule"), "utf8");
  assert.doesNotMatch(moduleText, /token(?:=|%3D)[0-9a-f]{32,}/i);
});
