"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const primary = ["gs-loc.apple.com", "gs-loc-cn.apple.com"];
const expanded = [
  ...primary,
  "gsp-ssl.ls.apple.com",
  "bluedot.is.autonavi.com",
  "bluedot.is.autonavi.com.gds.alibabadns.com"
];
const files = [
  { name: "Shadowrocket", path: "ios-location-spoofer.sgmodule", hosts: expanded },
  { name: "Shadowrocket minimal", path: "ios-location-spoofer-minimal.sgmodule", hosts: primary },
  { name: "Surge", path: "ios-location-spoofer-surge.sgmodule", hosts: expanded },
  { name: "Loon", path: "ios-location-spoofer.lnplugin", hosts: expanded },
  { name: "Stash", path: "ios-location-spoofer.stoverride", hosts: expanded },
  { name: "Quantumult X", path: "ios-location-spoofer.snippet", hosts: expanded }
];
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function regexPatterns(file, content) {
  if (file.path.endsWith(".sgmodule")) {
    return content.split(/\r?\n/).filter(line => /type=http-(response|request)/.test(line))
      .map(line => {
        const m = line.match(/pattern=(.*?),requires-body=/);
        assert.ok(m, file.name + ": missing script pattern");
        return m[1];
      });
  }
  if (file.path.endsWith(".lnplugin")) {
    return content.split(/\r?\n/).filter(line => /^http-(response|request)\s/.test(line))
      .map(line => line.split(/\s+/)[1]);
  }
  if (file.path.endsWith(".stoverride")) {
    return content.split(/\r?\n/).filter(line => /^\s+- match: /.test(line))
      .map(line => line.trim().replace(/^- match:\s*/, ""));
  }
  return content.split(/\r?\n/).filter(line => /^\^https:\\\/\\\//.test(line))
    .map(line => line.split(/\s+/)[0]);
}
function mitmHosts(file, content) {
  if (file.path.endsWith(".stoverride")) {
    const m = content.match(/^\s{2}mitm:\r?\n((?:\s+-\s+[^\r\n]+\r?\n?)*)/m);
    assert.ok(m, file.name + ": missing Stash mitm");
    return m[1].split(/\r?\n/).filter(Boolean).map(x => x.trim().replace(/^- /, ""));
  }
  const m = content.match(/^hostname\s*=\s*(.+)$/mi);
  assert.ok(m, file.name + ": missing MITM hostname");
  return m[1].replace(/%APPEND%\s*/g, "").split(",").map(x => x.trim()).filter(Boolean);
}

for (const file of files) {
  test(file.name + ": MITM hosts are an explicit, bounded allowlist", () => {
    const content = read(file.path);
    assert.deepEqual(mitmHosts(file, content), file.hosts);
    assert.doesNotMatch(content, /hostname\s*=\s*\*\.apple\.com/i);
    assert.equal(content.includes("skip-server-cert-verify"), false);
    assert.equal(content.includes("gs-loc-new.apple.com"), false,
      "unconfirmed host must not be enabled by default");
    if (file.path.endsWith(".sgmodule")) {
      assert.match(content, /hostname\s*=\s*%APPEND% /);
    }
  });
  test(file.name + ": rewriting matches HTTPS WLOC only, never unrelated APIs", () => {
    const content = read(file.path);
    const patterns = regexPatterns(file, content);
    assert.ok(patterns.length > 0, file.name + ": no script URL pattern found");
    for (const pattern of patterns) {
      const regex = new RegExp(pattern);
      for (const host of file.hosts) {
        assert.equal(regex.test("https://" + host + "/clls/wloc"), true, file.name + ": " + host);
        assert.equal(regex.test("https://" + host + "/clls/wloc?device=test"), true);
      }
      for (const invalid of [
        "http://gs-loc.apple.com/clls/wloc",
        "https://another.apple.com/clls/wloc",
        "https://sub.gs-loc.apple.com/clls/wloc",
        "https://gs-loc.apple.com.evil.test/clls/wloc",
        "https://gs-loc-new.apple.com/clls/wloc",
        "https://gs-loc.apple.com/clls/wloc/extra",
        "https://gs-loc.apple.com/clls/wlocation",
        "https://gs-loc.apple.com/account",
        "https://gs-loc.apple.com/wloc-settings/save"
      ]) {
        assert.equal(regex.test(invalid), false, file.name + ": unexpectedly matched " + invalid);
      }
    }
  });
}
test("Shadowrocket and Surge include a request-stage identity-encoding preflight", () => {
  for (const p of ["ios-location-spoofer.sgmodule","ios-location-spoofer-minimal.sgmodule",
                   "ios-location-spoofer-surge.sgmodule"]) {
    const text = read(p);
    assert.match(text, /type=http-request,pattern=/);
    assert.match(text, /argument=mode=prepare&debug=false/);
    assert.match(text, /type=http-response,pattern=/);
  }
});
test("public modules have no embedded secret or wildcard TLS bypass", () => {
  for (const file of files) {
    const content = read(file.path);
    assert.doesNotMatch(content, /(?:token=|token%3D)[0-9a-f]{32,}/i);
    const activeConfig = content.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join("\n");
    assert.doesNotMatch(activeConfig, /(?:\*\.apple\.com|\*\.ls\.apple\.com)/);
    assert.doesNotMatch(content, /\bskip-cert(?:ificate)?-verify\b/i);
  }
});
