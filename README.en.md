# iOS Location Spoofer

**English** · [中文](README.md)

Use the HTTPS-decryption (MITM) feature of a proxy app to trick Apple's location service — and therefore Apple Maps — into placing your iPhone anywhere in the world.

> 📖 **New here?** The step-by-step walkthrough is Chinese-only for now → [使用教程.md](使用教程.md) (install, configure, verify, and troubleshooting).

## Credits

This project builds on the core research of [acheong08/ios-location-spoofer](https://github.com/acheong08/ios-location-spoofer). The original is a standalone iOS app written in Go that spoofs location with a self-hosted VPN + MITM proxy.

This repo re-implements that core logic in JavaScript and adapts it to five proxy platforms — Shadowrocket, Surge, Loon, Quantumult X, and Stash — so there's nothing to compile and no developer account required. Import and go.

### What this port adds over the original

- **Multi-platform support** — from a single iOS app to five proxy apps.
- **Cell-tower coordinate rewriting** — the Go original only rewrote Wi-Fi hotspot coordinates; the JS version also rewrites CellTower coordinates (fields 22/24).
- **Multiple response-format compatibility** — auto-detects Apple's response envelope (ARPC / synthetic / marker / bare) so the rewritten payload is still accepted by iOS.
- **Motion-state spoofing** — also rewrites `motionActivityType` and `motionActivityConfidence` to reduce the chance of detection.

## How it works

Your iPhone reads nearby Wi-Fi and cell signals, then asks Apple where those BSSIDs/towers are. Apple replies with a list of coordinates, and iOS computes its own position from them.

This project intercepts Apple's reply on the way back and rewrites every coordinate to the numbers you chose. iOS receives the altered coordinates and concludes it is exactly where you told it to be.

## Supported apps

| App | File | How to import | Status |
|-----|------|---------------|--------|
| Shadowrocket | `ios-location-spoofer.sgmodule` | Config → top-right `+` | ✅ Verified |
| Surge | `ios-location-spoofer-surge.sgmodule` | Home → Modules → Install New Module | ✅ Verified |
| Loon | `ios-location-spoofer.lnplugin` | Settings → Plugins → Add Plugin | ✅ Verified |
| Quantumult X | `ios-location-spoofer.snippet` | Settings → Rewrite → Add | 🟡 Untested |
| Stash | `ios-location-spoofer.stoverride` | Override → Install Override | ✅ Verified |

> Tested it? Please report results in Issues. If something doesn't work, PRs are welcome — at minimum include **which app, which version, which iOS, and the raw error log**.

## Usage

1. Turn on HTTPS decryption / MITM in your proxy app.
2. Install and trust the CA certificate (Settings → General → VPN & Device Management → install, then Certificate Trust Settings → enable).
3. Import the module file and enable it.
4. Reconnect the VPN and toggle Location Services off/on.
5. Open Maps to verify.

### MITM failed troubleshooting

If the proxy Request List shows `MITM failed`, this usually points to MITM hostname matching or iOS certificate full-trust state, not to the rewrite script having already failed. Please verify:

1. iOS has full trust enabled for the proxy CA under **Settings → General → About → Certificate Trust Settings**.
2. The failing Host in Request List is present in the module's `[MITM] hostname` list. Every module in this project includes `gs-loc.apple.com`, `gs-loc-cn.apple.com`, `gsp-ssl.ls.apple.com`, `bluedot.is.autonavi.com`, and `bluedot.is.autonavi.com.gds.alibabadns.com`.
3. If your log shows another `/clls/wloc` Host, please include the exact Host and path in the issue instead of using broad wildcards such as `*.apple.com` / `*.ls.apple.com`, which may MITM unrelated Apple requests.
4. If it still fails, try disabling QUIC/HTTP3-related options, reconnect the VPN, then toggle Location Services off/on.

### Loon notes

1. After importing `ios-location-spoofer.lnplugin`, open the plugin config page under **Settings → Plugins**.
2. You can enter **latitude / longitude** directly. **Address search** is resolved and cached by a cron task that runs every 15 minutes (for the first run, enter coordinates directly or save an address and wait one cron cycle).
3. You must enable Loon's **MITM** and trust the certificate, and the four domains in the plugin's `[mitm]` block must be active.
4. The plugin includes a **Prepare** request script (sets `Accept-Encoding: identity` to avoid gzip-induced `zip decompress error` / script timeouts).
5. After changing coordinates, toggle Location Services off/on. For debugging, enable **debug logging** and search Loon's log for `Location spoofer`.

> If the log shows `Evaluate script timeout` or `zip decompress error:-3`: update the plugin and reload Loon, and confirm all three scripts (Prepare / Response / Geocode cron) are enabled.

## Changing coordinates

Default is Apple Park (37.3349, -122.00902). Change it in the module arguments:

```
latitude=39.9042&longitude=116.4074
```

| Name | Default | Description |
|------|---------|-------------|
| `latitude` | 37.3349 | Target latitude |
| `longitude` | -122.00902 | Target longitude |
| `address` | (empty) | Address search (entered in the Loon plugin UI; resolved to coordinates online; takes precedence over manual lat/lng) |
| `horizontalAccuracy` | 39 | Horizontal accuracy |
| `verticalAccuracy` | 1000 | Vertical accuracy |
| `altitude` | 530 | Altitude |
| `failOpen` | true | Pass the original data through on error |
| `debug` | false | Debug logging |

## File map

```
ios-location-spoofer.sgmodule       # Shadowrocket
ios-location-spoofer-surge.sgmodule # Surge
ios-location-spoofer.lnplugin       # Loon
ios-location-spoofer.snippet        # Quantumult X
ios-location-spoofer.stoverride     # Stash
location-spoofer.js                 # Core script (shared by four platforms)
location-spoofer-qx.js              # Quantumult X-specific
location-spoofer-config.json        # Config sample
使用教程.md                         # Step-by-step tutorial (Chinese)
location-picker/                    # Optional: web map picker (Node or Cloudflare Worker)
location-picker/worker/             # Cloudflare Worker version (no VPS; supports Loon configUrl)
```

## Optional: web map location picker

Change location often and tired of looking up coordinates by hand? The bundled [`location-picker/`](location-picker/) tool lets you tap a map to set your location: altitude is filled in automatically and accuracy is adjustable. Loon / Shadowrocket read it via `configUrl`.

**Four deployment options:**

| Option | Directory | Best for |
|--------|-----------|----------|
| **Cloudflare Worker — Wrangler CLI** (recommended) | [`location-picker/worker/`](location-picker/worker/) | No VPS, HTTPS included; comfortable with the CLI |
| **Cloudflare Worker — dashboard** | [`location-picker/cloudflare-webui/`](location-picker/cloudflare-webui/) | No VPS, HTTPS included; no npm/Wrangler — paste a single file |
| Self-hosted Node | [`location-picker/server.js`](location-picker/server.js) | You have your own VPS / NAS |
| Docker / Coolify | [`docker-compose.yml`](docker-compose.yml) | Self-hosting, persistence, and health checks |

Loon plugin **remote config URL** example:

```
https://your-worker.workers.dev/loc.json?token=YOUR_TOKEN
```

## Community

This project welcomes review and feedback from the LINUX DO community: [LINUX DO](https://linux.do)

## location-picker server configuration

`location-picker/server.js` is controlled by environment variables. Both secrets must contain at least 32 characters; the process exits when either required value is missing or too short.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOKEN` | **Yes** | none | Admin secret for the initial browser login or Bearer admin API. Generate it with `openssl rand -hex 32`. |
| `READ_TOKEN` | **Yes in production** | `TOKEN` | Separate read-only secret used by modules to fetch `/loc.json`; it must differ from `TOKEN` in production. |
| `PORT` | No | `8080` | Listen port; ports below 1024 require root. |
| `HOST` | No | `0.0.0.0` | Listen address. |
| `DATA_FILE` | No | `location-picker/loc.json` | Location data file; containers use `/data/loc.json`. |
| `TRUST_PROXY` | No | `0` | Set to `1` only behind a trusted proxy such as Coolify. |
| `SESSION_TTL` | No | `43200` | Admin browser session lifetime in seconds, clamped to 300–86400. |
| `CERT` | No | empty | HTTPS fullchain certificate path; HTTPS is used only when both `CERT` and `KEY` are set. |
| `KEY` | No | empty | HTTPS private key path; used only when both `CERT` and `KEY` are set. |

Startup examples:

```bash
# http (simplest — get the flow working before switching to https)
TOKEN=$(openssl rand -hex 32) READ_TOKEN=$(openssl rand -hex 32) PORT=8080 node server.js

# https (reuse acme.sh certs; no restart needed on renewal — the process hot-reloads every 12 hours)
TOKEN=$(openssl rand -hex 32) READ_TOKEN=$(openssl rand -hex 32) PORT=8443 \
CERT=/root/cert/example.com/fullchain.pem \
KEY=/root/cert/example.com/privkey.pem \
node server.js
```

The `loc.json` data file is persisted with a temporary file, `fsync`, and atomic replacement to reduce corruption after an interrupted process or host. It is ignored by Git.

> ⚠️ **Don't put `TOKEN` in your shell history.** Prefer systemd's `Environment=` or `.env` + `direnv` to avoid leaking it via `history` / `ps aux`.

### Docker

```bash
cd location-picker
printf "TOKEN=%s\nREAD_TOKEN=%s\n" "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env
docker compose up -d
```

The image uses `node:22-alpine`, runs as a non-root user with a read-only root filesystem, and stores coordinates in a named volume.

### Coolify

Coolify can deploy the root [`docker-compose.yml`](docker-compose.yml) directly. See [`COOLIFY.md`](COOLIFY.md) for domain, internal port, secrets, persistence, and backup instructions.

## Security note

The Cloudflare Worker versions require their existing token flow. The Node server exchanges the one-time admin URL for an HttpOnly browser session, keeps module reads on a separate read-only token, and leaves only `/healthz` unauthenticated. Token comparison is constant-time. Because MITM decryption sees all traffic to the intercepted Apple endpoints, only enable the module while you actively need it, and keep your CA private key on-device only.

## License

See [LICENSE](LICENSE).
