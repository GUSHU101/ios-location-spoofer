# iOS Location Spoofer

[中文](README.md) · **English**

Rewrite coordinates returned by Apple's location service through the HTTPS-decryption feature in Shadowrocket, Surge, Loon, Quantumult X, or Stash. No jailbreak or iOS app build is required.

> [!WARNING]
> This project enables HTTPS man-in-the-middle decryption on your device. Use it only for development, testing, or privacy research on devices you own or are authorized to test. Do not use it to bypass risk controls, attendance systems, anti-fraud measures, or service rules. Keep the CA private key on your own device and disable the module and HTTPS decryption when they are not needed.

## Start here

| Goal | Documentation |
|---|---|
| Set up Shadowrocket in Chinese | [中文完整教程](使用教程.md) |
| Set up Shadowrocket in English | [English tutorial](使用教程.en.md) |
| Deploy the secure picker with Coolify | [Coolify guide (Chinese)](COOLIFY.md) |
| Deploy a Worker with Wrangler | [Worker CLI guide (Chinese)](location-picker/worker/README.md) |
| Deploy a Worker in the Cloudflare dashboard | [Worker dashboard guide (Chinese)](location-picker/cloudflare-webui/README.md) |

## Quick start

1. Choose a proxy client below and import its configuration.
2. Enable HTTPS decryption / MITM, install its CA profile, and enable full trust under iOS Certificate Trust Settings.
3. Enable the module and change `latitude` and `longitude`.
4. Reconnect the proxy, turn Location Services off for at least 10 seconds, turn it on again, and verify with Apple Maps.

The certificate trust step is essential. See the [English tutorial](使用教程.en.md) for the complete walkthrough and troubleshooting flow.

## Supported clients

| Client | Configuration | Import path | Status |
|---|---|---|---|
| Shadowrocket | [Source](ios-location-spoofer.sgmodule) · [Raw import](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.sgmodule) | Config → Modules → `+` → From URL | Verified |
| Surge | [Source](ios-location-spoofer-surge.sgmodule) · [Raw import](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer-surge.sgmodule) | Home → Modules → Install New Module | Verified |
| Loon | [Source](ios-location-spoofer.lnplugin) · [Raw import](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.lnplugin) | Settings → Plugins → Add Plugin | Verified |
| Quantumult X | [Source](ios-location-spoofer.snippet) · [Raw import](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.snippet) | Settings → Rewrite → Add | More testing needed |
| Stash | [Source](ios-location-spoofer.stoverride) · [Raw import](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.stoverride) | Override → Install Override | Verified |

When troubleshooting, record the client version, iOS version, request host, and raw error message. Never disclose secrets, cookies, certificates, or complete private URLs.

## Parameters

The default location is Apple Park: `37.3349, -122.00902`.

```text
latitude=39.9042&longitude=116.4074
```

| Parameter | Default | Purpose |
|---|---:|---|
| `latitude` | `37.3349` | Latitude from `-90` to `90` |
| `longitude` | `-122.00902` | Longitude from `-180` to `180` |
| `altitude` | `530` | Altitude in metres; negative values are accepted |
| `horizontalAccuracy` | `39` | Horizontal accuracy in metres |
| `verticalAccuracy` | `1000` | Vertical accuracy in metres |
| `address` | empty | Loon only: periodically resolve and cache an address |
| `failOpen` | `true` | Pass the original response through after a script error |
| `debug` | `false` | Emit debug logs; disable it after troubleshooting |
| `configUrl` | empty | Optional full `/loc.json` URL from a web picker |

## How it works

An iPhone sends nearby Wi-Fi and cell-tower information to Apple's location service and calculates its position from the returned coordinates. This project matches only location-related `/clls/wloc` requests and rewrites Wi-Fi, cell-tower, and motion fields in the response inside the proxy client.

Every client configuration lists only the five required hosts. Do not replace them with broad wildcards such as `*.apple.com`, because that would unnecessarily expand the HTTPS-decryption scope.

## Optional web location picker

If you change locations frequently, deploy `location-picker`, select a point on a map, and let the client read it through `configUrl`.

| Deployment | Best for | Authentication | Guide |
|---|---|---|---|
| Coolify / Docker Compose | A server and separate admin/client permissions | Admin secret + read-only secret + browser session | [Coolify guide (Chinese)](COOLIFY.md) |
| Cloudflare Worker (CLI) | No server; comfortable with a CLI | One URL token | [Wrangler guide (Chinese)](location-picker/worker/README.md) |
| Cloudflare Worker (dashboard) | No server; single-file copy and paste | One URL token | [Dashboard guide (Chinese)](location-picker/cloudflare-webui/README.md) |
| Direct Node.js | Local development or an existing process manager | Admin secret + read-only secret + browser session | Header of [`location-picker/server.js`](location-picker/server.js) |

The Coolify deployment is recommended for a long-running public service: its admin secret never enters the browser URL, and modules receive only a read-only secret. The Worker keeps its token in the URL for client compatibility, so restrict log access and rotate the token periodically.

After login, the Coolify / Node.js page includes a **Mobile client setup** panel. It can copy the read-only remote-config URL or the module argument used by Shadowrocket and Stash. The read-only secret is not embedded in the login or admin page source; an authenticated session retrieves it only when needed.

## Troubleshooting

- **`MITM failed`**: confirm that the CA is installed and fully trusted, the request host is in the module list, and retry after disabling QUIC / HTTP3.
- **Location does not change**: confirm that both the module and HTTPS decryption are enabled; turn Location Services off for at least 10 seconds and fully restart Maps.
- **The picker saved a point but the client did not update**: request `/loc.json` directly and check the values; Cloudflare KV and Loon caching can take about 60 seconds.
- **The OSM map shows `403 Access blocked`**: update to the latest commit and redeploy; older builds suppressed the origin information required by OSM.
- **Restore the real location**: disable the module or the proxy, then toggle Location Services off and on.

See the [tutorial troubleshooting checklist](使用教程.en.md#troubleshooting) for a complete sequence.

## Repository layout

```text
location-spoofer.js                 Shared client script
location-spoofer-qx.js              Quantumult X-specific script
ios-location-spoofer.*              Five client configurations
location-picker/server.js           Node.js picker service
location-picker/worker/             Cloudflare Worker source and tests
location-picker/cloudflare-webui/   Generated single-file Worker
docker-compose.yml                  Coolify deployment entry point
```

Every push and pull request runs integration tests, internal documentation-link checks, generated Worker consistency checks, dependency audits, Compose validation, and a production image build.

## Credits and license

The core research comes from [acheong08/ios-location-spoofer](https://github.com/acheong08/ios-location-spoofer). This repository ports the approach to JavaScript and adds multi-client support, cell-tower coordinate handling, response-format compatibility, and web pickers.

See [LICENSE](LICENSE).
