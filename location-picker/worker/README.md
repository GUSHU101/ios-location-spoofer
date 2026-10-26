# Cloudflare Worker Location Picker（Wrangler）

[项目首页](../../README.md) · [Coolify 部署](../../COOLIFY.md) · **Worker CLI** · [Worker 网页后台](../cloudflare-webui/README.md)

该版本把坐标保存在 Cloudflare KV，无需 VPS，并与 Shadowrocket、Surge、Loon、Quantumult X 和 Stash 的 `configUrl` 格式兼容。

> [!IMPORTANT]
> Worker 版使用一个 `TOKEN` 同时保护管理页和 `/loc.json`，Token 会出现在 URL 中。不要分享完整 URL，限制 Cloudflare 日志访问，并定期轮换 Token。需要管理与只读权限分离时，请使用 [Coolify 版](../../COOLIFY.md)。

## 前置条件

- Node.js 22 或更高版本
- Cloudflare 账号
- 已执行 `npx wrangler login`，或在 CI 中配置了相应 API Token

## 1. 安装依赖

```bash
cd location-picker/worker
npm ci
```

## 2. 创建并绑定 KV

```bash
npx wrangler kv namespace create LOC_KV
npx wrangler kv namespace create LOC_KV --preview
```

把命令返回的正式 `id` 和预览 `id` 分别写入 [`wrangler.jsonc`](wrangler.jsonc) 的 `id` 与 `preview_id`。绑定变量名必须保持为 `LOC_KV`。

## 3. 设置访问密钥

先用密码管理器或本地工具生成至少 32 字节的随机值：

```bash
openssl rand -hex 32
npx wrangler secret put TOKEN
```

第二条命令提示输入时，粘贴随机值。不要把真实 Token 写入 `wrangler.jsonc` 或提交到 Git。

本地开发可将 [`.dev.vars.example`](.dev.vars.example) 复制为 `.dev.vars`；该文件已被 Git 忽略。

## 4. 测试并部署

```bash
npm test
npm run deploy
```

记下 Wrangler 输出的 HTTPS 地址，例如：

```text
https://ios-location-picker.example.workers.dev
```

## 5. 验收

依次检查：

1. `/health` 返回 `{"ok":true,"kv":true,"tokenConfigured":true}`。
2. 不带 Token 访问 `/` 和 `/loc.json` 均返回 `403`。
3. 带 Token 打开地图页，点选位置并保存。
4. `/loc.json?token=...` 返回刚保存的坐标。
5. 客户端读取相同 URL，约 60 秒内获取新坐标。

```text
https://ios-location-picker.example.workers.dev/health
https://ios-location-picker.example.workers.dev/?token=YOUR_TOKEN
https://ios-location-picker.example.workers.dev/loc.json?token=YOUR_TOKEN
```

## 客户端配置

在模块参数末尾追加：

```text
&configUrl=https://ios-location-picker.example.workers.dev/loc.json?token=YOUR_TOKEN
```

Loon 用户也可在插件配置页的**远程配置 URL**中填写完整 `/loc.json` 地址。保存地图位置后，重连代理并关闭 iOS 定位服务至少 10 秒再开启。

## 自定义域名

在 Cloudflare Dashboard 中打开 Worker → **Settings** → **Domains & Routes** → **Add Custom Domain**。绑定后重新完成 `/health`、地图保存和 `/loc.json` 三项验收。

## 接口

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/` | `GET` | `?token=` | 地图管理页 |
| `/loc.json` | `GET` | `?token=` | 读取当前坐标 |
| `/set` | `POST` | `?token=` | 保存坐标并启用修改 |
| `/enable` | `POST` | `?token=` | 切换修改 / 放行真实位置 |
| `/health` | `GET` | 无 | 检查 Worker、KV 和 Token 配置状态 |

## 维护

- 修改 `src/` 后运行 `npm test`，测试会同时验证网页后台单文件产物没有漂移。
- 如产物检查失败，运行 `npm run build:webui`，再提交源码和生成的 `../cloudflare-webui/worker.js`。
- 轮换密钥时重新执行 `npx wrangler secret put TOKEN` 并部署，然后更新所有客户端 URL。
- KV 是最终一致的，刚保存后短时间读到旧值并不一定是故障。

## 故障排查

- **`kv:false`**：`LOC_KV` 未绑定，或变量名大小写错误。
- **`tokenConfigured:false`**：没有设置 Secret `TOKEN`；重新执行 `wrangler secret put TOKEN`。
- **主页返回 `403`**：URL 缺少 Token，或 Token 与当前 Secret 不一致。
- **地图已保存但客户端还是旧坐标**：直接请求 `/loc.json` 核对，等待 KV / 客户端缓存刷新，再重连代理。
- **部署前需要检查**：运行 `npm test`；它会校验接口、页面行为和生成文件一致性。
