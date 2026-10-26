# Cloudflare Worker 网页后台部署

[项目首页](../../README.md) · [Coolify 部署](../../COOLIFY.md) · [Worker CLI](../worker/README.md) · **Worker 网页后台**

本指南适合不想安装 Node.js 或 Wrangler 的用户：在 Cloudflare Dashboard 创建 Worker，粘贴本目录的单文件 [`worker.js`](worker.js)，再绑定 KV 和 Secret。

> [!IMPORTANT]
> `worker.js` 是从 [`../worker/src/`](../worker/src/) 自动生成的发布产物。开发者应修改源码并在 `../worker/` 运行 `npm run build:webui`，不要只修改生成文件。

> [!WARNING]
> Worker 版使用一个 `TOKEN` 保护管理页和 `/loc.json`，Token 会出现在 URL 中。不要分享完整 URL，限制 Cloudflare 日志访问，并定期轮换。需要管理密钥与客户端只读密钥分离时，请使用 [Coolify 部署](../../COOLIFY.md)。

## 1. 创建 Worker

1. 打开 Cloudflare Dashboard → **Workers & Pages**。
2. 选择创建 **Worker**，不要选择静态 Pages。
3. 名称可填写 `ios-location-picker`。
4. 创建后进入 **Edit code**。
5. 删除默认 Hello World 代码，复制 [`worker.js`](worker.js) 的全部内容并部署。

不要复制 GitHub 网页本身的 HTML；应打开文件的 Raw 内容或先下载文件。出现 `Unexpected token '<'` 通常说明粘贴的是网页 HTML。

## 2. 创建并绑定 KV

1. 在 Cloudflare Dashboard 的 Workers KV 中创建命名空间，名称可用 `LOC_KV`。
2. 回到 Worker → **Settings** → **Bindings** → **Add binding**。
3. 类型选择 **KV Namespace**。
4. 变量名必须填写 `LOC_KV`，并选择刚创建的命名空间。
5. 保存；如果 Cloudflare 要求重新部署，请完成部署。

`LOC_KV` 区分大小写，不能改成 `loc_kv`、`KV` 或其他名称。

## 3. 添加 TOKEN Secret

1. 打开 Worker → **Settings** → **Variables and Secrets**。
2. 添加类型为 **Secret** 的变量，名称填写 `TOKEN`。
3. 值使用密码管理器生成的长随机字符串，建议至少 64 个十六进制字符。
4. 保存并重新部署。

不要使用生日、手机号、`123456` 或文档占位文字，也不要把真实 Token 提交到 GitHub。

## 4. 部署验收

假设地址是 `https://ios-location-picker.example.workers.dev`，按顺序检查：

1. 打开 `/health`，应返回：

   ```json
   {"ok":true,"kv":true,"tokenConfigured":true}
   ```

2. 不带 Token 打开 `/` 和 `/loc.json`，均应返回 `403`。
3. 带 Token 打开地图页：

   ```text
   https://ios-location-picker.example.workers.dev/?token=YOUR_TOKEN
   ```

4. 搜索只会移动地图视野；必须在地图上点一下放置图钉，再点**保存定位**。
5. 打开以下地址，确认返回刚保存的坐标：

   ```text
   https://ios-location-picker.example.workers.dev/loc.json?token=YOUR_TOKEN
   ```

`/health` 中 `kv:false` 表示 KV 绑定错误；`tokenConfigured:false` 表示缺少 Secret `TOKEN`。

## 5. 配置客户端

在 Shadowrocket 模块的 `argument=` 末尾追加：

```text
&configUrl=https://ios-location-picker.example.workers.dev/loc.json?token=YOUR_TOKEN
```

Loon 用户可把同一个完整地址填入插件的**远程配置 URL**。保存后重连代理，关闭 iOS 定位服务至少 10 秒再开启，然后用 Apple 地图验证。

首次部署模块时，请使用当前仓库的脚本地址：

```text
https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/location-spoofer.js
```

## 6. 可选：绑定自定义域名

进入 Worker → **Settings** → **Domains & Routes** → **Add Custom Domain**。域名成功绑定后，重新完成 `/health`、地图保存和 `/loc.json` 三项验收，并把所有客户端 `configUrl` 更新为新域名。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| 页面仍显示 Hello World | 默认代码没有被替换，或部署的是另一个 Worker |
| `Unexpected token '<'` | 粘贴了 GitHub HTML；重新复制 `worker.js` 的 Raw 内容 |
| `/health` 显示 `kv:false` | 重新绑定 KV，变量名必须为 `LOC_KV` |
| `/health` 显示 `tokenConfigured:false` | 添加 Secret `TOKEN` 后重新部署 |
| 根路径返回 `403` | URL 缺少 Token，或 Secret 已轮换 |
| 搜索后坐标没变化 | 搜索后还需点地图放置图钉并点击保存 |
| `/loc.json` 已更新但手机未变化 | 等待最多约 60 秒，重连代理并刷新 iOS 定位服务 |

## 开发者维护说明

单文件发布流程位于 [`../worker/scripts/build-webui.mjs`](../worker/scripts/build-webui.mjs)：

```bash
cd location-picker/worker
npm ci
npm test
npm run build:webui
npm run check:webui
```

源码、测试和生成产物应在同一次提交中保持一致。
