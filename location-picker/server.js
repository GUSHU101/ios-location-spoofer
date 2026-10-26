// 定位选点服务 —— 单文件、零依赖（仅用 Node 内置模块）
// 支持：高德矢量 / 高德卫星 / 国外 OSM 多地图切换，自动 GCJ-02<->WGS-84 坐标转换
// 搜索显示多个候选（只移动视野）；点地图/拖图钉移动定位点；点“保存定位”才写入
// 点地图自动按地形获取海拔；海拔/水平精度/垂直精度可手动微调
// 可选自带 https（复用 3x-ui 的 acme.sh 证书）
//
// 启动示例（http）：
//   TOKEN=管理密钥 READ_TOKEN=只读密钥 PORT=8080 node server.js
//
// 启动示例（https，复用已有证书）：
//   TOKEN=管理密钥 READ_TOKEN=只读密钥 PORT=8443 \
//   CERT=/root/cert/你的域名/fullchain.pem \
//   KEY=/root/cert/你的域名/privkey.pem \
//   node server.js
//
// Shadowrocket 模块 argument 末尾加：
//   &configUrl=https://你的域名:8443/loc.json?token=你的只读密钥
//
// 模块读取地址使用 READ_TOKEN。管理页面通过 POST 登录表单换取 HttpOnly 会话
// Cookie，避免管理密钥进入 URL、浏览器脚本和后续请求。

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = String(process.env.TOKEN || "");
const READ_TOKEN = String(process.env.READ_TOKEN || TOKEN);
const CERT = process.env.CERT || "";
const KEY = process.env.KEY || "";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "loc.json");
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const PUBLIC_ORIGIN_INPUT = String(process.env.PUBLIC_ORIGIN || "").trim();
const PUBLIC_ORIGIN = normalizeOrigin(PUBLIC_ORIGIN_INPUT);
const SESSION_TTL = Math.max(300, Math.min(86400, Number.parseInt(process.env.SESSION_TTL || "43200", 10) || 43200));
const COOKIE_NAME = "location_picker_session";
const MAX_BODY_BYTES = 10 * 1024;
const authFailures = new Map();

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error("启动失败：PORT 必须是 0 到 65535 之间的整数。");
  process.exit(1);
}
if (Buffer.byteLength(TOKEN) < 32 || Buffer.byteLength(READ_TOKEN) < 32) {
  console.error("启动失败：TOKEN 和 READ_TOKEN 必须分别至少包含 32 个字符。");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && safeEqual(TOKEN, READ_TOKEN)) {
  console.error("启动失败：生产环境的 READ_TOKEN 必须与 TOKEN 不同。");
  process.exit(1);
}
if (PUBLIC_ORIGIN_INPUT && !PUBLIC_ORIGIN) {
  console.error("启动失败：PUBLIC_ORIGIN 必须是有效的 http 或 https 站点地址。");
  process.exit(1);
}
if ((CERT && !KEY) || (!CERT && KEY)) {
  console.error("启动失败：CERT 与 KEY 必须同时设置，或同时留空交给反向代理终止 HTTPS。");
  process.exit(1);
}

// 常量时间比较，避免通过响应时延逐字节爆破 token
function safeEqual(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch (e) {
    return "";
  }
}

// 字段名/默认值与 location-spoofer.js 的 DEFAULT_CONFIG 对齐
const DEFAULT = Object.freeze({
  enabled: true,          // false = 脚本放行原始响应（恢复真实定位）
  latitude: 37.3349,
  longitude: -122.00902,
  altitude: 530,
  horizontalAccuracy: 39,
  verticalAccuracy: 1000
});

function finiteInRange(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
}

function optionalRoundedNumber(value, minimum, maximum) {
  if (value === undefined || value === null || value === "") return { provided: false };
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return { provided: true, valid: false };
  return { provided: true, valid: true, value: Math.round(number) };
}

function normalizeLoc(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: input.enabled !== false,
    latitude: finiteInRange(input.latitude, -90, 90, DEFAULT.latitude),
    longitude: finiteInRange(input.longitude, -180, 180, DEFAULT.longitude),
    altitude: Math.round(finiteInRange(input.altitude, -12000, 100000, DEFAULT.altitude)),
    horizontalAccuracy: Math.round(finiteInRange(input.horizontalAccuracy, 0, 100000, DEFAULT.horizontalAccuracy)),
    verticalAccuracy: Math.round(finiteInRange(input.verticalAccuracy, 0, 100000, DEFAULT.verticalAccuracy))
  };
}

function ensureDataDirectory() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true, mode: 0o700 });
}

function readLoc() {
  try {
    return normalizeLoc(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (e) {
    return Object.assign({}, DEFAULT);
  }
}

function writeLoc(obj) {
  ensureDataDirectory();
  const next = normalizeLoc(obj);
  const temporary = DATA_FILE + "." + process.pid + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(next, null, 2) + "\n", "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, DATA_FILE);
    fs.chmodSync(DATA_FILE, 0o600);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (e) {}
  }
  return next;
}

function send(res, code, type, body, extraHeaders) {
  const headers = Object.assign({
    "Content-Type": type,
    "Cache-Control": "no-store, private",
    "Content-Length": Buffer.byteLength(body),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  }, extraHeaders || {});
  res.writeHead(code, headers);
  res.end(body);
}

function sendJson(res, code, value, extraHeaders) {
  send(res, code, "application/json; charset=utf-8", JSON.stringify(value), extraHeaders);
}

function bearerToken(req) {
  const authorization = String(req.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function cookies(req) {
  return String(req.headers.cookie || "").split(";").reduce(function (all, entry) {
    const index = entry.indexOf("=");
    if (index > 0) all[entry.slice(0, index).trim()] = entry.slice(index + 1).trim();
    return all;
  }, {});
}

function sessionSignature(issuedAt) {
  return crypto.createHmac("sha256", TOKEN).update("location-picker-ui-v1|" + issuedAt).digest("base64url");
}

function createSessionValue() {
  const issuedAt = String(Math.floor(Date.now() / 1000));
  return issuedAt + "." + sessionSignature(issuedAt);
}

function hasValidSession(req) {
  const value = cookies(req)[COOKIE_NAME] || "";
  const parts = value.split(".");
  if (parts.length !== 2 || !/^\d{10}$/.test(parts[0]) || !safeEqual(parts[1], sessionSignature(parts[0]))) return false;
  const age = Math.floor(Date.now() / 1000) - Number(parts[0]);
  return age >= 0 && age <= SESSION_TTL;
}

function isAdminRequest(req, url, allowQuery) {
  if (hasValidSession(req)) return true;
  const supplied = bearerToken(req) || (allowQuery ? url.searchParams.get("token") || "" : "");
  return supplied !== "" && safeEqual(supplied, TOKEN);
}

function isReadRequest(req, url) {
  if (hasValidSession(req)) return true;
  const supplied = bearerToken(req) || url.searchParams.get("token") || "";
  return supplied !== "" && (safeEqual(supplied, READ_TOKEN) || safeEqual(supplied, TOKEN));
}

function rejectAuth(res) {
  sendJson(res, 401, { error: "authentication required" }, { "WWW-Authenticate": 'Bearer realm="location-picker"' });
}

function clientAddress(req) {
  if (TRUST_PROXY) {
    // The trusted edge appends the actual peer address. Reading from the right
    // prevents a client-supplied first value from bypassing login throttling.
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").at(-1).trim();
    if (forwarded) return forwarded;
  }
  return String(req.socket.remoteAddress || "unknown");
}

function loginBlocked(req) {
  const entry = authFailures.get(clientAddress(req));
  return entry && entry.blockedUntil > Date.now() ? Math.ceil((entry.blockedUntil - Date.now()) / 1000) : 0;
}

function recordLoginFailure(req) {
  const key = clientAddress(req);
  const now = Date.now();
  const previous = authFailures.get(key);
  const entry = !previous || now - previous.firstAttempt > 10 * 60 * 1000
    ? { count: 1, firstAttempt: now, blockedUntil: 0 }
    : { count: previous.count + 1, firstAttempt: previous.firstAttempt, blockedUntil: previous.blockedUntil };
  if (entry.count >= 5) entry.blockedUntil = now + 15 * 60 * 1000;
  authFailures.set(key, entry);
  if (authFailures.size > 10000) {
    for (const [address, value] of authFailures) {
      if (now - value.firstAttempt > 30 * 60 * 1000) authFailures.delete(address);
    }
  }
}

function forwardedValue(req, name) {
  return String(req.headers[name] || "").split(",")[0].trim();
}

function requestOrigin(req) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const directProtocol = req.socket.encrypted ? "https" : "http";
  const protocol = TRUST_PROXY ? forwardedValue(req, "x-forwarded-proto") || directProtocol : directProtocol;
  const host = TRUST_PROXY ? forwardedValue(req, "x-forwarded-host") || req.headers.host : req.headers.host;
  return protocol && host ? protocol + "://" + host : "";
}

function validWriteOrigin(req) {
  if (bearerToken(req)) return true;
  const origin = String(req.headers.origin || "");
  return origin !== "" && safeEqual(origin, requestOrigin(req));
}

function sessionCookie(req) {
  const secure = requestOrigin(req).startsWith("https://");
  return COOKIE_NAME + "=" + createSessionValue() + "; Path=/; Max-Age=" + SESSION_TTL + "; HttpOnly; SameSite=Strict" + (secure ? "; Secure" : "");
}

function expiredSessionCookie(req) {
  const secure = requestOrigin(req).startsWith("https://");
  return COOKIE_NAME + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict" + (secure ? "; Secure" : "");
}

function readJson(req, res, callback) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "content type must be application/json" });
    return;
  }
  let body = "";
  let oversized = false;
  req.setEncoding("utf8");
  req.on("data", function (chunk) {
    if (oversized) return;
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) oversized = true;
  });
  req.on("end", function () {
    if (oversized) return sendJson(res, 413, { error: "request body too large" });
    let value;
    try {
      value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad json");
    } catch (e) {
      return sendJson(res, 400, { error: "bad json" });
    }
    try {
      callback(value);
    } catch (e) {
      console.error("请求处理失败：" + e.message);
      if (!res.headersSent) sendJson(res, 500, { error: "storage unavailable" });
    }
  });
  req.on("error", function () {
    if (!res.headersSent) sendJson(res, 400, { error: "request interrupted" });
  });
}

function readForm(req, res, callback) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    sendJson(res, 415, { error: "content type must be application/x-www-form-urlencoded" });
    return;
  }
  let body = "";
  let oversized = false;
  req.setEncoding("utf8");
  req.on("data", function (chunk) {
    if (oversized) return;
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) oversized = true;
  });
  req.on("end", function () {
    if (oversized) return sendJson(res, 413, { error: "request body too large" });
    callback(new URLSearchParams(body));
  });
  req.on("error", function () {
    if (!res.headersSent) sendJson(res, 400, { error: "request interrupted" });
  });
}

function renderPage() {
  const nonce = crypto.randomBytes(18).toString("base64");
  return {
    nonce: nonce,
    body: PAGE.replaceAll("__CSP_NONCE__", nonce)
  };
}

function renderLogin(error) {
  const nonce = crypto.randomBytes(18).toString("base64");
  return {
    nonce: nonce,
    body: LOGIN_PAGE
      .replaceAll("__CSP_NONCE__", nonce)
      .replace("__LOGIN_ERROR__", error ? "密钥错误，请重试。" : "")
  };
}

function pageCsp(nonce) {
  return "default-src 'none'; base-uri 'none'; connect-src 'self' https://api.open-meteo.com https://nominatim.openstreetmap.org; " +
    "font-src 'self'; frame-ancestors 'none'; img-src 'self' data: blob: https://unpkg.com https://*.autonavi.com https://tile.openstreetmap.org; " +
    "form-action 'self'; object-src 'none'; script-src 'nonce-" + nonce + "' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com";
}

function handler(req, res) {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch (e) {
    return sendJson(res, 400, { error: "bad request target" });
  }

  if (url.pathname === "/healthz" && req.method === "GET") {
    try {
      ensureDataDirectory();
      fs.accessSync(path.dirname(DATA_FILE), fs.constants.R_OK | fs.constants.W_OK);
      return sendJson(res, 200, { status: "ok" });
    } catch (e) {
      return sendJson(res, 503, { status: "unavailable" });
    }
  }

  if (url.pathname === "/loc.json" && req.method === "GET") {
    if (!isReadRequest(req, url)) return rejectAuth(res);
    return sendJson(res, 200, readLoc());
  }

  if (url.pathname === "/set" && req.method === "POST") {
    if (!isAdminRequest(req, url, false)) return rejectAuth(res);
    if (!validWriteOrigin(req)) return sendJson(res, 403, { error: "invalid request origin" });
    readJson(req, res, function (value) {
      const latitude = Number(value.lat);
      const longitude = Number(value.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return sendJson(res, 400, { error: "bad coords" });
      }
      const current = readLoc();
      current.enabled = true;
      current.latitude = latitude;
      current.longitude = longitude;
      const altitude = optionalRoundedNumber(value.altitude, -12000, 100000);
      const horizontalAccuracy = optionalRoundedNumber(value.horizontalAccuracy, 0, 100000);
      const verticalAccuracy = optionalRoundedNumber(value.verticalAccuracy, 0, 100000);
      if ((altitude.provided && !altitude.valid) || (horizontalAccuracy.provided && !horizontalAccuracy.valid) || (verticalAccuracy.provided && !verticalAccuracy.valid)) {
        return sendJson(res, 400, { error: "altitude or accuracy is out of range" });
      }
      if (altitude.provided) current.altitude = altitude.value;
      if (horizontalAccuracy.provided) current.horizontalAccuracy = horizontalAccuracy.value;
      if (verticalAccuracy.provided) current.verticalAccuracy = verticalAccuracy.value;
      return sendJson(res, 200, writeLoc(current));
    });
    return;
  }

  if (url.pathname === "/enable" && req.method === "POST") {
    if (!isAdminRequest(req, url, false)) return rejectAuth(res);
    if (!validWriteOrigin(req)) return sendJson(res, 403, { error: "invalid request origin" });
    readJson(req, res, function (value) {
      if (typeof value.enabled !== "boolean") return sendJson(res, 400, { error: "enabled must be a boolean" });
      const current = readLoc();
      current.enabled = value.enabled;
      return sendJson(res, 200, writeLoc(current));
    });
    return;
  }

  if (url.pathname === "/session" && req.method === "POST") {
    const retryAfter = loginBlocked(req);
    if (retryAfter > 0) return sendJson(res, 429, { error: "too many login attempts" }, { "Retry-After": String(retryAfter) });
    readForm(req, res, function (form) {
      const supplied = form.get("token") || "";
      if (!safeEqual(supplied, TOKEN)) {
        recordLoginFailure(req);
        const login = renderLogin(true);
        return send(res, 401, "text/html; charset=utf-8", login.body, {
          "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'nonce-" + login.nonce + "'"
        });
      }
      authFailures.delete(clientAddress(req));
      return send(res, 303, "text/plain; charset=utf-8", "redirecting", {
        "Location": "/",
        "Set-Cookie": sessionCookie(req)
      });
    });
    return;
  }

  if (url.pathname === "/session/logout" && req.method === "POST") {
    if (!hasValidSession(req)) return rejectAuth(res);
    if (!validWriteOrigin(req)) return sendJson(res, 403, { error: "invalid request origin" });
    return send(res, 303, "text/plain; charset=utf-8", "signed out", {
      "Location": "/",
      "Set-Cookie": expiredSessionCookie(req)
    });
  }

  if (url.pathname === "/" && req.method === "GET") {
    if (!hasValidSession(req)) {
      const login = renderLogin(false);
      return send(res, 200, "text/html; charset=utf-8", login.body, {
        "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'nonce-" + login.nonce + "'"
      });
    }
    const page = renderPage();
    return send(res, 200, "text/html; charset=utf-8", page.body, {
      "Content-Security-Policy": pageCsp(page.nonce)
    });
  }

  return sendJson(res, 404, { error: "not found" });
}

// ---- 启动：有证书走 https，否则 http ----
function onListenError(err) {
  if (err.code === "EADDRINUSE") {
    console.error("启动失败：端口 " + PORT + " 已被占用，请改用其它空闲端口（修改 PORT 环境变量）。");
  } else if (err.code === "EACCES") {
    console.error("启动失败：没有权限监听端口 " + PORT + "（1024 以下端口需 root 权限）。");
  } else {
    console.error("启动失败：" + err.message);
  }
  process.exit(1);
}

function start() {
  ensureDataDirectory();
  let server;
  if (CERT && KEY) {
    try {
      const opts = { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) };
      server = https.createServer(opts, handler);
      setInterval(function () {
        try {
          server.setSecureContext({ cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) });
        } catch (e) {
          console.error("证书热加载失败：" + e.message);
        }
      }, 12 * 3600 * 1000).unref();
    } catch (e) {
      console.error("启动失败：无法读取 HTTPS 证书：" + e.message);
      process.exit(1);
    }
  } else {
    server = http.createServer(handler);
  }

  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 64;
  server.on("error", onListenError);
  server.listen(PORT, HOST, function () {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : PORT;
    console.log("location picker (" + (CERT ? "https" : "http") + ") listening on " + HOST + ":" + port);
  });

  function shutdown(signal) {
    console.log(signal + " received; stopping location picker");
    server.close(function () { process.exit(0); });
    setTimeout(function () { process.exit(1); }, 10000).unref();
  }
  process.once("SIGTERM", function () { shutdown("SIGTERM"); });
  process.once("SIGINT", function () { shutdown("SIGINT"); });

  return server;
}

if (require.main === module) start();

const LOGIN_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>定位选点登录</title>
<style nonce="__CSP_NONCE__">
  :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7fb;color:#101828}
  *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px}
  .skip-link{position:fixed;top:.5rem;left:.5rem;z-index:10;padding:.75rem 1rem;background:#101828;color:#fff;border-radius:.5rem;transform:translateY(-150%)}
  .skip-link:focus{transform:none}
  main{width:min(100%,420px);padding:28px;border:1px solid #e4e7ec;border-radius:18px;background:#fff;box-shadow:0 18px 48px rgba(16,24,40,.1)}
  h1{margin:0 0 8px;font-size:1.5rem}p{margin:0 0 20px;color:#667085;line-height:1.5}
  label{display:block;margin-bottom:8px;font-weight:700}input{width:100%;min-height:48px;border:1px solid #d0d5dd;border-radius:10px;padding:10px 12px;font:inherit}
  input:focus-visible{outline:3px solid #84adff;outline-offset:2px}button{width:100%;min-height:48px;margin-top:16px;border:0;border-radius:10px;background:#155eef;color:#fff;font:inherit;font-weight:750;cursor:pointer}
  button:hover{background:#004eeb}.error{margin:0 0 16px;color:#b42318}.error:empty{display:none}
</style>
</head>
<body>
<a class="skip-link" href="#main">跳到登录表单</a>
<main id="main">
  <h1>定位选点</h1>
  <p id="login-help">输入部署时配置的管理密钥。密钥只在本次登录请求中提交，不会写入页面 URL。</p>
  <p id="login-error" class="error" role="alert" aria-live="assertive">__LOGIN_ERROR__</p>
  <form method="post" action="/session">
    <label for="token">管理密钥</label>
    <input id="token" name="token" type="password" minlength="32" required aria-required="true" aria-describedby="login-help login-error" autocomplete="current-password" autofocus>
    <button type="submit">安全登录</button>
  </form>
</main>
</body>
</html>`;

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>定位选点</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
<style nonce="__CSP_NONCE__">
  :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828;background:#f6f7f9}
  *{box-sizing:border-box}html{min-width:320px}body{margin:0;min-height:100%;font-size:1rem}button,input{font:inherit}
  .skip-link{position:fixed;top:.5rem;left:.5rem;z-index:10001;padding:.75rem 1rem;background:#101828;color:#fff;border-radius:.5rem;transform:translateY(-150%)}
  .skip-link:focus{transform:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.65rem clamp(.75rem,3vw,1.5rem);background:#fff;border-bottom:1px solid #d0d5dd}
  .topbar h1{margin:0;font-size:clamp(1.125rem,4vw,1.4rem)}.logout-form{margin:0}
  #logoutbtn{min-width:4.5rem;min-height:44px;padding:.55rem .8rem;border:1px solid #98a2b3;border-radius:.6rem;background:#fff;color:#344054;font-weight:650}
  .shell{width:min(100%,78rem);margin:0 auto;background:#fff;min-height:calc(100vh - 62px)}
  .bar{padding:.75rem;display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
  .bar input{grid-column:1/-1;min-width:0;min-height:48px;padding:.7rem .8rem;font-size:1rem;border:1px solid #98a2b3;border-radius:.6rem}
  .bar button{min-height:48px;padding:.65rem .9rem;border:0;border-radius:.6rem;background:#075fca;color:#fff;font-weight:700}
  button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}
  button:focus-visible,input:focus-visible,#map:focus-visible{outline:3px solid #84adff;outline-offset:2px}
  .results{margin:0 .75rem .75rem;border:1px solid #d0d5dd;border-radius:.6rem;max-height:34vh;overflow:auto;display:none;background:#fff}
  .results.show{display:block}
  .rrow{width:100%;min-height:48px;padding:.65rem .75rem;font-size:.9rem;border:0;border-bottom:1px solid #e4e7ec;color:#1d2939;background:#fff;display:flex;align-items:center;gap:.5rem;text-align:left}
  .rrow:last-child{border-bottom:0}
  .rrow:active{background:#f0f6ff}
  .rrow .fname{flex:1;min-width:0;min-height:44px;padding:.5rem;border:0;background:transparent;color:inherit;text-align:left}
  .rrow .fdel{min-width:44px;min-height:44px;padding:.5rem .75rem;font-size:.85rem;border:0;border-radius:.45rem;background:#b42318;color:#fff;flex-shrink:0}
  #map{height:clamp(18rem,48dvh,36rem);border-block:1px solid #d0d5dd;background:#e4e7ec}
  #info{margin:0;padding:.75rem;font-size:.9rem;line-height:1.5;overflow-wrap:anywhere}
  .opts{padding:.25rem .75rem 1rem;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;align-items:end}
  .opts h2{grid-column:1/-1;margin:.25rem 0 0;font-size:1rem}.opts label{font-size:.85rem;color:#344054;display:flex;flex-direction:column;gap:.25rem}
  .opts input{width:100%;min-width:0;min-height:44px;padding:.55rem .65rem;font-size:1rem;border:1px solid #98a2b3;border-radius:.5rem}
  .opts button{min-height:48px;padding:.65rem .75rem;font-size:.95rem;border:0;border-radius:.6rem;color:#fff;font-weight:700}
  #savebtn{background:#18723c}#restorebtn{background:#475467}#favadd,#favlistbtn{background:#5145cd}
  .toast{position:fixed;bottom:max(1rem,env(safe-area-inset-bottom));left:50%;width:max-content;max-width:calc(100% - 2rem);transform:translateX(-50%);background:rgba(16,24,40,.94);color:#fff;padding:.7rem 1rem;border-radius:.55rem;font-size:.9rem;opacity:0;transition:opacity .3s;pointer-events:none;z-index:9999;text-align:center}
  .toast.show{opacity:1}
  @media (min-width:40rem){.bar{grid-template-columns:minmax(12rem,1fr) auto auto}.bar input{grid-column:auto}.opts{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (min-width:64rem){.shell{margin-block:1rem;border:1px solid #d0d5dd;border-radius:1rem;overflow:hidden;min-height:0}body{background:#eef1f5}}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<header class="topbar">
  <h1>定位选点</h1>
  <form class="logout-form" method="post" action="/session/logout"><button id="logoutbtn" type="submit">退出登录</button></form>
</header>
<main class="shell" id="main">
  <form class="bar" id="searchform" role="search">
    <label class="sr-only" for="q">搜索地点</label>
    <input id="q" type="search" autocomplete="off" placeholder="搜索地点（只预览，不会立即修改定位）">
    <button id="locatebtn" type="button" disabled>当前位置</button>
    <button id="btn" type="submit">搜索</button>
  </form>
  <section class="results" id="results" aria-label="搜索结果"></section>
  <div id="map" role="region" aria-label="定位地图，可点击或使用键盘移动图钉" aria-busy="true" tabindex="0"></div>
  <p id="info" role="status" aria-live="polite">加载中…</p>
  <section class="opts" aria-labelledby="settings-title">
    <h2 id="settings-title">定位参数</h2>
    <label for="alt">海拔（米）<input id="alt" type="number" inputmode="numeric" min="-12000" max="100000"></label>
    <label for="hacc">水平精度<input id="hacc" type="number" inputmode="numeric" min="0" max="100000"></label>
    <label for="vacc">垂直精度<input id="vacc" type="number" inputmode="numeric" min="0" max="100000"></label>
    <button id="savebtn" type="button">保存定位</button>
    <button id="restorebtn" type="button">恢复真实定位</button>
    <button id="favadd" type="button">收藏此点</button>
    <button id="favlistbtn" type="button">我的收藏</button>
  </section>
  <section class="results" id="favs" aria-label="收藏地点"></section>
</main>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script nonce="__CSP_NONCE__">

// ---------- GCJ-02 <-> WGS-84 坐标转换（中国地图偏移修正） ----------
var GCJ = (function(){
  var PI = Math.PI, a = 6378245.0, ee = 0.00669342162296594323;
  function outOfChina(lat,lng){return (lng<72.004||lng>137.8347)||(lat<0.8293||lat>55.8271);}
  function tLat(x,y){
    var r=-100.0+2.0*x+3.0*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
    r+=(20.0*Math.sin(6.0*x*PI)+20.0*Math.sin(2.0*x*PI))*2.0/3.0;
    r+=(20.0*Math.sin(y*PI)+40.0*Math.sin(y/3.0*PI))*2.0/3.0;
    r+=(160.0*Math.sin(y/12.0*PI)+320*Math.sin(y*PI/30.0))*2.0/3.0;return r;
  }
  function tLng(x,y){
    var r=300.0+x+2.0*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
    r+=(20.0*Math.sin(6.0*x*PI)+20.0*Math.sin(2.0*x*PI))*2.0/3.0;
    r+=(20.0*Math.sin(x*PI)+40.0*Math.sin(x/3.0*PI))*2.0/3.0;
    r+=(150.0*Math.sin(x/12.0*PI)+300.0*Math.sin(x/30.0*PI))*2.0/3.0;return r;
  }
  function wgs2gcj(lat,lng){
    if(outOfChina(lat,lng))return [lat,lng];
    var dLat=tLat(lng-105.0,lat-35.0), dLng=tLng(lng-105.0,lat-35.0);
    var radLat=lat/180.0*PI, m=Math.sin(radLat); m=1-ee*m*m; var sm=Math.sqrt(m);
    dLat=(dLat*180.0)/((a*(1-ee))/(m*sm)*PI);
    dLng=(dLng*180.0)/(a/sm*Math.cos(radLat)*PI);
    return [lat+dLat,lng+dLng];
  }
  function gcj2wgs(lat,lng){ // 迭代反解，往返误差 <0.001 米
    if(outOfChina(lat,lng))return [lat,lng];
    var wlat=lat, wlng=lng;
    for(var i=0;i<3;i++){ var g=wgs2gcj(wlat,wlng); wlat+=lat-g[0]; wlng+=lng-g[1]; }
    return [wlat,wlng];
  }
  return {wgs2gcj:wgs2gcj, gcj2wgs:gcj2wgs};
})();

// ---------- 状态 ----------
var map, marker;
var WGS = {lat:0, lng:0};   // 当前“定位点(图钉)”的真值 WGS-84（预览用，未必已保存）
var datum = "gcj";          // 当前底图坐标系：'gcj'(高德) 或 'wgs'(OSM)
var saved = true;           // 图钉当前位置是否已保存到设备
var enabledState = true;    // true=伪造中；false=已恢复真实定位（脚本放行）
var toastTimer;

function $(id){return document.getElementById(id);}
function toast(t){var e=$("toast");clearTimeout(toastTimer);e.textContent=t;e.classList.add("show");toastTimer=setTimeout(function(){e.classList.remove("show");},2200);}
function numOrNull(id){var v=$(id).value.trim();return v===""?null:Number(v);}
function wrapLng(lng){return ((((Number(lng)+180)%360)+360)%360)-180;}

function setLocateBusy(busy){
  var b=$("locatebtn");
  b.disabled=!!busy;
  b.textContent=busy?"定位中…":"当前位置";
}

function geolocationErrorMessage(err){
  if(err&&err.code===1)return "定位权限被拒绝，请在 Safari 设置中允许定位";
  if(err&&err.code===2)return "暂时无法获取当前位置";
  if(err&&err.code===3)return "获取当前位置超时，请到开阔处重试";
  return "获取当前位置失败";
}

var FAV_KEY="lp_favs_v1";
var FAV_MAX=12;
function loadFavs(){
  try{
    var raw=localStorage.getItem(FAV_KEY);
    var a=raw?JSON.parse(raw):[];
    return Array.isArray(a)?a:[];
  }catch(e){return [];}
}
function saveFavs(list){
  try{localStorage.setItem(FAV_KEY,JSON.stringify(list.slice(0,FAV_MAX)));}catch(e){}
}
function applyFavorite(it){
  var lat=Number(it.lat), lng=wrapLng(it.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast("收藏坐标无效");return;}
  WGS={lat:lat,lng:lng};
  saved=false;
  if(it.alt!=null&&it.alt!=="")$("alt").value=it.alt;
  if(it.hacc!=null&&it.hacc!=="")$("hacc").value=it.hacc;
  if(it.vacc!=null&&it.vacc!=="")$("vacc").value=it.vacc;
  var p=dispPos();
  marker.setLatLng(p);
  map.setView(p,15);
  info();
  toast("已加载收藏，确认后保存");
}
function renderFavs(){
  var box=$("favs");
  var list=loadFavs();
  box.innerHTML="";
  if(!list.length){box.classList.remove("show");return;}
  list.forEach(function(it,idx){
    var row=document.createElement("div");
    row.className="rrow";
    var name=document.createElement("button");
    name.className="fname";
    name.type="button";
    name.textContent=it.name||(Number(it.lat).toFixed(4)+","+Number(it.lng).toFixed(4));
    name.addEventListener("click",function(){
      $("results").classList.remove("show");
      applyFavorite(it);
    });
    var del=document.createElement("button");
    del.className="fdel";
    del.type="button";
    del.textContent="删";
    del.addEventListener("click",function(e){
      e.stopPropagation();
      var next=loadFavs();
      next.splice(idx,1);
      saveFavs(next);
      if(next.length)renderFavs();else{box.innerHTML="";box.classList.remove("show");}
      toast("已删除收藏");
    });
    row.appendChild(name);
    row.appendChild(del);
    box.appendChild(row);
  });
  box.classList.add("show");
}
function addFavorite(){
  if(!Number.isFinite(WGS.lat)||!Number.isFinite(WGS.lng)){toast("当前坐标无效");return;}
  var def=$("q").value.trim()||(WGS.lat.toFixed(4)+","+WGS.lng.toFixed(4));
  var name=window.prompt("收藏名称",def);
  if(name===null)return;
  name=String(name).trim()||def;
  var list=loadFavs().filter(function(it){
    return Math.abs(Number(it.lat)-WGS.lat)>1e-5||Math.abs(Number(it.lng)-WGS.lng)>1e-5;
  });
  list.unshift({
    name:name,
    lat:WGS.lat,
    lng:WGS.lng,
    alt:numOrNull("alt"),
    hacc:numOrNull("hacc"),
    vacc:numOrNull("vacc"),
    ts:Date.now()
  });
  saveFavs(list);
  renderFavs();
  toast("已收藏");
}
function toggleFavs(){
  var box=$("favs");
  if(box.classList.contains("show")){box.classList.remove("show");return;}
  $("results").classList.remove("show");
  if(!loadFavs().length){toast("暂无收藏");return;}
  renderFavs();
}

function info(){
  if(!enabledState){
    $("info").innerHTML = "<b style='color:#ff9500'>已恢复真实定位 · 脚本放行不修改</b>　（关开定位后生效）";
    return;
  }
  var tag = saved ? "已保存 ✓" : "未保存 · 点“保存定位”生效";
  $("info").innerHTML = "<b style='color:"+(saved?"#34c759":"#ff9500")+"'>"+tag+"</b>　WGS-84 "+
    WGS.lat.toFixed(5)+", "+WGS.lng.toFixed(5)+"　海拔 "+($("alt").value||"?")+"m";
}

// 切换按钮外观：伪造中(灰按钮“恢复真实定位”) / 已恢复(橙按钮“重新开启伪造”)
function updateEnabledUI(){
  var b=$("restorebtn");
  if(enabledState){ b.textContent="恢复真实定位"; b.style.background="#8e8e93"; }
  else { b.textContent="● 重新开启伪造"; b.style.background="#ff9500"; }
  info();
}

// 一键切换 伪造/恢复真实
function toggleEnabled(){
  var want = !enabledState;
  fetch("/enable",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:want})})
    .then(function(r){
      if(r.ok){ enabledState=want; updateEnabledUI();
        toast(want ? "已开启伪造，记得关开定位生效" : "已恢复真实定位，记得关开定位生效"); }
      else toast("切换失败 "+r.status);
    })
    .catch(function(){ toast("网络错误"); });
}

function dispPos(){return datum==="gcj"?GCJ.wgs2gcj(WGS.lat,WGS.lng):[WGS.lat,WGS.lng];}
function toWgs(lat,lng){lng=wrapLng(lng);return datum==="gcj"?GCJ.gcj2wgs(lat,lng):[lat,lng];}

// 按地形取海拔（open-meteo 免费高程接口，传 WGS-84）
function fetchElevation(lat,lng){
  lng=wrapLng(lng);
  return fetch("https://api.open-meteo.com/v1/elevation?latitude="+lat+"&longitude="+lng)
    .then(function(r){return r.json();})
    .then(function(d){return (d&&d.elevation&&d.elevation.length)?d.elevation[0]:null;})
    .catch(function(){return null;});
}

// 移动定位点(图钉)：只预览，不保存
function movePin(dispLat,dispLng){
  dispLng=wrapLng(dispLng);
  var w=toWgs(dispLat,dispLng);
  WGS={lat:w[0], lng:wrapLng(w[1])};
  saved=false;
  marker.setLatLng([dispLat,dispLng]);
  info();
  fetchElevation(WGS.lat,WGS.lng).then(function(el){ if(el!==null)$("alt").value=Math.round(el); info(); });
}

// 保存定位点到设备（写入 loc.json，Shadowrocket 才会用）
function commit(){
  if(!$("alt").checkValidity()||!$("hacc").checkValidity()||!$("vacc").checkValidity()){
    toast("请输入有效范围内的海拔和精度");
    return;
  }
  var payload={lat:WGS.lat, lng:WGS.lng,
    altitude:numOrNull("alt"), horizontalAccuracy:numOrNull("hacc"), verticalAccuracy:numOrNull("vacc")};
  fetch("/set",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
    .then(function(r){ if(r.ok){ saved=true; enabledState=true; updateEnabledUI(); toast("已保存 ✓ 记得关开定位生效"); } else { toast("保存失败 "+r.status); } })
    .catch(function(){ toast("网络错误"); });
}

function locateCurrent(){
  if(enabledState){
    toast("请先恢复真实定位并刷新定位服务");
    return;
  }
  if(!navigator.geolocation){
    toast("当前浏览器不支持定位");
    return;
  }

  setLocateBusy(true);
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var lat=Number(pos&&pos.coords&&pos.coords.latitude);
      var lng=wrapLng(pos&&pos.coords&&pos.coords.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)){
        toast("获取当前位置失败");
        setLocateBusy(false);
        return;
      }

      WGS={lat:lat,lng:lng};
      saved=false;
      var p=dispPos();
      marker.setLatLng(p);
      map.setView(p,16);
      info();
      fetchElevation(WGS.lat,WGS.lng).then(function(el){
        if(el!==null)$("alt").value=Math.round(el);
        info();
      });
      toast("已定位到当前位置，请确认后保存");
      setLocateBusy(false);
    },
    function(err){
      toast(geolocationErrorMessage(err));
      setLocateBusy(false);
    },
    {enableHighAccuracy:true,maximumAge:0,timeout:12000}
  );
}

// 搜索：列出多个候选，点选只移动地图视野（不动定位点、不保存）
function search(){
  var q=$("q").value.trim(); if(!q) return;
  fetch("https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=8&q="+encodeURIComponent(q))
    .then(function(r){return r.json();})
    .then(function(a){
      var box=$("results"); box.innerHTML="";
      if(!a||!a.length){ box.classList.remove("show"); toast("没找到"); return; }
      a.forEach(function(it){
        var row=document.createElement("button");
        row.className="rrow";
        row.type="button";
        row.textContent=it.display_name;
        row.addEventListener("click",function(){
          box.classList.remove("show"); box.innerHTML="";
          var la=+it.lat, lo=+it.lon;
          var p = datum==="gcj"?GCJ.wgs2gcj(la,lo):[la,lo];
          map.setView(p,15);            // 只移动视野；要设为定位，请在地图上点一下放图钉
          toast("已定位视野，在地图上点一下放置图钉");
        });
        box.appendChild(row);
      });
      box.classList.add("show");
    })
    .catch(function(){toast("搜索失败");});
}

function load(){
  fetch("/loc.json",{credentials:"same-origin"}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).then(function(d){
    WGS={lat:d.latitude, lng:d.longitude};
    saved=true;
    enabledState=(d.enabled!==false);
    $("alt").value=(d.altitude!==undefined?d.altitude:"");
    $("hacc").value=(d.horizontalAccuracy!==undefined?d.horizontalAccuracy:39);
    $("vacc").value=(d.verticalAccuracy!==undefined?d.verticalAccuracy:1000);

    var amapVec=L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7",{subdomains:"1234",maxZoom:18,attribution:"高德地图"});
    amapVec.datum="gcj";
    var amapSat=L.layerGroup([
      L.tileLayer("https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",{subdomains:"1234",maxZoom:18}),
      L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=8",{subdomains:"1234",maxZoom:18})
    ]);
    amapSat.datum="gcj";
    var osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,referrerPolicy:"strict-origin-when-cross-origin",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
    osm.datum="wgs";

    map=L.map("map");
    amapVec.addTo(map); datum="gcj";
    map.setView(dispPos(),13);
    L.control.layers({"高德地图":amapVec,"高德卫星":amapSat,"国外 OSM":osm},null,{collapsed:false}).addTo(map);

    marker=L.marker(dispPos(),{draggable:true}).addTo(map);
    updateEnabledUI();
    setLocateBusy(false);
    $("map").setAttribute("aria-busy","false");

    map.on("baselayerchange",function(e){datum=e.layer.datum||"wgs"; var p=dispPos(); marker.setLatLng(p); map.setView(p,map.getZoom()); info();});
    map.on("click",function(e){movePin(e.latlng.lat,e.latlng.lng);});
    marker.on("dragend",function(){var p=marker.getLatLng(); movePin(p.lat,p.lng);});
  }).catch(function(){$("map").setAttribute("aria-busy","false");$("info").setAttribute("role","alert");$("info").textContent="加载失败，请刷新页面或重新登录";});
}

$("searchform").addEventListener("submit",function(e){e.preventDefault();search();});
$("locatebtn").addEventListener("click",locateCurrent);
$("savebtn").addEventListener("click",commit);
$("restorebtn").addEventListener("click",toggleEnabled);
$("favadd").addEventListener("click",addFavorite);
$("favlistbtn").addEventListener("click",toggleFavs);
load();
</script>
</body>
</html>`;
