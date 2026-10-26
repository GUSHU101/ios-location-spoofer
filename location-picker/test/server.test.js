const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { after, before, test } = require("node:test");

const adminToken = "a".repeat(48);
const readToken = "b".repeat(48);
const proxyOrigin = "https://picker.example";
const proxyHeaders = {
  "X-Forwarded-For": "198.51.100.7, 203.0.113.15",
  "X-Forwarded-Host": "picker.example",
  "X-Forwarded-Proto": "https"
};
const customProxyOrigin = "https://ios.caseora.test";
const customProxyHeaders = {
  "X-Forwarded-For": "198.51.100.7, 203.0.113.15",
  "X-Forwarded-Host": "generated.example, ios.caseora.test",
  "X-Forwarded-Proto": "http, https"
};
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "location-picker-test-"));
const dataFile = path.join(temporaryDirectory, "loc.json");
let child;
let baseUrl;

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      TOKEN: adminToken,
      READ_TOKEN: readToken,
      DATA_FILE: dataFile,
      TRUST_PROXY: "1",
      PUBLIC_ORIGIN: proxyOrigin,
      NODE_ENV: "production"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  baseUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("server did not start")), 10000);
    child.once("exit", code => reject(new Error("server exited before startup: " + code)));
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.stdout.on("data", chunk => {
      output += chunk.toString();
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve("http://127.0.0.1:" + match[1]);
      }
    });
  });
});

test("production rejects a shared admin and read token", () => {
  const sharedToken = "s".repeat(48);
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      TOKEN: sharedToken,
      READ_TOKEN: sharedToken
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /READ_TOKEN.*TOKEN/);
});

test("production rejects an invalid public origin", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      TOKEN: adminToken,
      READ_TOKEN: readToken,
      PUBLIC_ORIGIN: "javascript:alert(1)"
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PUBLIC_ORIGIN/);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise(resolve => child.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("health, scoped authentication, clean browser sessions and persistence work together", async () => {
  const health = await fetch(baseUrl + "/healthz");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const anonymous = await fetch(baseUrl + "/", { redirect: "manual" });
  assert.equal(anonymous.status, 200);
  assert.match(await anonymous.text(), /<form method="post" action="\/session">/);

  const readOnlyUi = await fetch(baseUrl + "/?token=" + readToken, { redirect: "manual" });
  assert.equal(readOnlyUi.status, 200);
  assert.doesNotMatch(await readOnlyUi.text(), /id="map"/);

  const login = await fetch(baseUrl + "/session", {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...proxyHeaders },
    body: new URLSearchParams({ token: adminToken })
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "/");
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /^location_picker_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, new RegExp(adminToken));

  const sessionCookie = cookie.split(";")[0];
  const page = await fetch(baseUrl + "/", { headers: { Cookie: sessionCookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(page.headers.get("content-security-policy"), /form-action 'self'/);
  assert.equal(page.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.doesNotMatch(html, new RegExp(adminToken));
  assert.doesNotMatch(html, /__CSP_NONCE__/);
  assert.match(html, /integrity="sha256-/);
  assert.match(html, /<main class="shell" id="main">/);
  assert.match(html, /<label class="sr-only" for="q">搜索地点<\/label>/);
  assert.match(html, /id="toast" role="status" aria-live="polite"/);
  assert.match(html, /action="\/session\/logout"/);
  assert.match(html, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(html, /https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.match(html, /OpenStreetMap<\/a> contributors/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/);

  const queryWrite = await fetch(baseUrl + "/set?token=" + adminToken, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ lat: 1, lng: 2 })
  });
  assert.equal(queryWrite.status, 401);

  const save = await fetch(baseUrl + "/set", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      Origin: proxyOrigin,
      ...proxyHeaders
    },
    body: JSON.stringify({
      lat: 39.9042,
      lng: 116.4074,
      altitude: 43,
      horizontalAccuracy: 18,
      verticalAccuracy: 60
    })
  });
  assert.equal(save.status, 200);

  const invalidMetrics = await fetch(baseUrl + "/set", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + adminToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ lat: 39.9042, lng: 116.4074, horizontalAccuracy: -1 })
  });
  assert.equal(invalidMetrics.status, 400);

  const location = await fetch(baseUrl + "/loc.json?token=" + readToken);
  assert.equal(location.status, 200);
  assert.deepEqual(await location.json(), {
    enabled: true,
    latitude: 39.9042,
    longitude: 116.4074,
    altitude: 43,
    horizontalAccuracy: 18,
    verticalAccuracy: 60
  });
  if (process.platform !== "win32") assert.equal(fs.statSync(dataFile).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(temporaryDirectory).filter(name => name.endsWith(".tmp")).length, 0);

  const forbiddenOrigin = await fetch(baseUrl + "/enable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      Origin: "https://attacker.example",
      ...proxyHeaders
    },
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(forbiddenOrigin.status, 403);

  const bearerWrite = await fetch(baseUrl + "/enable", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + adminToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(bearerWrite.status, 200);
  assert.equal((await bearerWrite.json()).enabled, false);

  const logout = await fetch(baseUrl + "/session/logout", {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: sessionCookie,
      Origin: customProxyOrigin,
      ...customProxyHeaders
    }
  });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get("location"), "/");
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});
