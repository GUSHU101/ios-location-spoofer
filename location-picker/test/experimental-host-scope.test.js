"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const five = [
  "gs-loc.apple.com",
  "gs-loc-cn.apple.com",
  "gsp-ssl.ls.apple.com",
  "bluedot.is.autonavi.com",
  "bluedot.is.autonavi.com.gds.alibabadns.com"
];
const seven = [...five, "gs-loc-new.apple.com", "gsp10-ssl.apple.com"];
const wloc = [...five, "gs-loc-new.apple.com"];
const cases = [
  ["Shadowrocket", "ios-location-spoofer-experimental.sgmodule", "sgmodule"],
  ["Surge", "ios-location-spoofer-experimental-surge.sgmodule", "sgmodule"],
  ["Loon", "ios-location-spoofer-experimental.lnplugin", "lnplugin"],
  ["Stash", "ios-location-spoofer-experimental.stoverride", "stoverride"],
  ["Quantumult X", "ios-location-spoofer-experimental.snippet", "snippet"]
];

function contentOf(file) {return fs.readFileSync(path.join(root,file),"utf8");}
function getHosts(content, kind) {
  if (kind === "stoverride") {
    const m = content.match(/^  mitm:\s*\r?\n((?:\s+-\s+[^\r\n]+\r?\n?)*)/m);
    assert.ok(m, "missing Stash mitm");
    return m[1].split(/\r?\n/).filter(Boolean).map(x=>x.trim().replace(/^- /,""));
  }
  const m = content.match(/^hostname\s*=\s*(.*)$/mi);
  assert.ok(m, "missing MITM hostname");
  return m[1].replace(/%APPEND%\s*/,"").split(",").map(s=>s.trim());
}
function getPatterns(content, kind) {
  if (kind === "sgmodule")
    return content.split(/\r?\n/).filter(x=>/type=http-(request|response)/.test(x))
      .map(x=>x.match(/pattern=(.*?),requires-body=/)?.[1]);
  if (kind === "lnplugin")
    return content.split(/\r?\n/).filter(x=>/^http-(request|response)\s/.test(x))
      .map(x=>x.split(/\s+/)[1]);
  if (kind === "stoverride")
    return content.split(/\r?\n/).filter(x=>/^\s+- match: /.test(x))
      .map(x=>x.trim().replace(/^- match:\s*/,""));
  return content.split(/\r?\n/).filter(x=>/^\^https:\\\/\\\//.test(x))
    .map(x=>x.split(/\s+/)[0]);
}
for (const [name,file,kind] of cases) {
  test(name + " experimental profile explicitly lists all seven hosts", () => {
    const source = contentOf(file);
    assert.deepEqual(getHosts(source,kind),seven);
    assert.match(source,/EXPERIMENTAL|实验/);
    assert.doesNotMatch(source,/(?:token=|token%3D)[0-9a-f]{32,}/i);
    const active = source.split(/\r?\n/).filter(x=>!x.trim().startsWith("#")).join("\n");
    assert.doesNotMatch(active,/hostname\s*=\s*%APPEND%\s*\*\.apple\.com/i);
  });
  test(name + " scripts only rewrite exact WLOC paths on six hosts", () => {
    const source = contentOf(file);
    const patterns = getPatterns(source,kind);
    assert.ok(patterns.length > 0, "expected at least one script pattern");
    for(const raw of patterns){
      assert.ok(raw, "missing script regex");
      const regex = new RegExp(raw);
      for(const host of wloc) {
        assert.equal(regex.test("https://"+host+"/clls/wloc"),true,host);
        assert.equal(regex.test("https://"+host+"/clls/wloc?x=1"),true,host);
      }
      for(const invalid of [
        "https://gsp10-ssl.apple.com/clls/wloc",
        "https://gsp10-ssl.apple.com/hcy/pbcwloc",
        "https://gsp10-ssl.apple.com/pds/pd",
        "https://gsp10-ssl.apple.com/hvr/trc",
        "https://gs-loc-new.apple.com/hcy/pbcwloc",
        "https://gs-loc-new.apple.com/clls/wloc/extra",
        "http://gs-loc-new.apple.com/clls/wloc",
        "https://gs-loc-new.apple.com.evil.example/clls/wloc",
        "https://gs-loc-new.apple.com/security",
        "https://gs-loc.apple.com/wloc-settings/save"
      ]) assert.equal(regex.test(invalid),false,name+": unexpected rewrite "+invalid);
    }
  });
}
test("stable profiles remain five hosts and minimal remains two", () => {
  for(const [name,file,kind] of [
    ["Shadowrocket","ios-location-spoofer.sgmodule","sgmodule"],
    ["Surge","ios-location-spoofer-surge.sgmodule","sgmodule"],
    ["Loon","ios-location-spoofer.lnplugin","lnplugin"],
    ["Stash","ios-location-spoofer.stoverride","stoverride"],
    ["QX","ios-location-spoofer.snippet","snippet"]]){
    assert.deepEqual(getHosts(contentOf(file),kind),five,name);
  }
  assert.deepEqual(getHosts(contentOf("ios-location-spoofer-minimal.sgmodule"),"sgmodule"),five.slice(0,2));
});
test("runtime defense-in-depth blocks telemetry hosts even if module regex is changed", () => {
  const core = require("../../location-spoofer.js");
  const qx = require("../../location-spoofer-qx.js");
  for(const api of [core,qx]){
    for(const host of wloc) assert.equal(api.isApprovedWlocUrl("https://"+host+"/clls/wloc"),true);
    for(const path of ["/hcy/pbcwloc","/pds/pd","/hvr/trc","/clls/wloc"]){
      assert.equal(api.isApprovedWlocUrl("https://gsp10-ssl.apple.com"+path),false);
    }
    for(const path of ["/hcy/pbcwloc","/clls/wloc/extra"]){
      assert.equal(api.isApprovedWlocUrl("https://gs-loc-new.apple.com"+path),false);
    }
    assert.equal(api.isApprovedWlocUrl("https://gs-loc-new.apple.com.evil.test/clls/wloc"),false);
    assert.equal(api.isSuccessfulResponseStatus({status:200}),true);
    assert.equal(api.isSuccessfulResponseStatus({status:"HTTP/2 200 OK"}),true);
    assert.equal(api.isSuccessfulResponseStatus({status:404}),false);
    assert.equal(api.isSuccessfulResponseStatus({status:500}),false);
  }
});
