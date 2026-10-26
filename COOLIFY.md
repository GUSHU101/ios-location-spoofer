# 用 Coolify 部署 Location Picker

[项目首页](README.md) · [English README](README.en.md) · [Shadowrocket 教程](使用教程.md) · **Coolify 部署**

仓库根目录的 [`docker-compose.yml`](docker-compose.yml) 是 Coolify 部署入口。容器只监听内部端口 `8080`；公网域名、HTTPS 和证书由 Coolify 代理管理。

本方案会自动生成两个不同的 64 字符密钥：

- **管理密钥**：仅用于登录地图管理页和写入操作。
- **只读密钥**：仅放入客户端的 `configUrl`，用于读取 `/loc.json`。

## 部署前检查

- Coolify 已安装并能从 GitHub 拉取公开仓库。
- 服务器的 Coolify 代理和 HTTPS 工作正常。
- 如果你使用自定义域名，该域名已解析到 Coolify 服务器。

不要在 GitHub、Coolify 截图或聊天记录中填写真实密钥。

## 1. 创建 Compose 应用

在 Coolify 中新建 **Git Based → Docker Compose** 应用，并填写：

| 字段 | 值 |
|---|---|
| Repository | `GUSHU101/ios-location-spoofer` |
| Branch | `main` |
| Build pack | `Docker Compose` |
| Docker Compose File | `docker-compose.yml` |
| Base directory | `/` |
| Compose file | `/docker-compose.yml` |

使用 Coolify 的普通 Docker Compose 模式，不要启用 Raw Compose。仓库更新后如果扫描结果仍显示旧文件，先点 **Scan Again**。

根目录没有 `.env.example`。如果创建页面仍显示旧的 `.env.example · 3 variables`，说明仓库扫描缓存尚未刷新。

## 2. 确认自动生成的环境变量

Coolify 解析 Compose 后，应在 Environment Variables 中生成并持久保存：

```dotenv
SERVICE_HEX_64_LOCATIONPICKERADMIN=<自动生成的 64 字符管理密钥>
SERVICE_HEX_64_LOCATIONPICKERREAD=<自动生成的 64 字符只读密钥>
SERVICE_URL_LOCATION_PICKER_8080=<Coolify 生成的 HTTPS URL>
SESSION_TTL=43200
```

部署前确认：

1. 两个 `SERVICE_HEX_64_*` 值均为 64 字符。
2. 两个值不相同。
3. `SERVICE_URL_LOCATION_PICKER_8080` 是 Coolify 生成的 HTTPS 来源，不带额外路径；后续可以再绑定自定义域名。

Compose 会把这些值分别映射为容器内的 `TOKEN`、`READ_TOKEN` 和 `PUBLIC_ORIGIN`。不要手动新增同名的容器变量来覆盖它们。

## 3. 配置域名并部署

`SERVICE_URL_LOCATION_PICKER_8080` 会让 Coolify 为 `location-picker` 服务创建公开 URL，并代理到容器内部端口 `8080`。

如需自定义域名：

1. 在应用 Domains 中选择服务 `location-picker`。
2. 设置 HTTPS 域名，例如 `https://picker.example.com`。
3. 内部端口填写 `8080`。
4. 保存并重新部署。应用会从 Coolify 的受信任代理头识别当前访问域名。

不要添加宿主机端口映射，也不要在容器内配置 `CERT` / `KEY`。TLS 由 Coolify 统一终止。

## 4. 首次登录与客户端配置

打开应用根路径：

```text
https://picker.example.com/
```

在登录表单中输入 `SERVICE_HEX_64_LOCATIONPICKERADMIN` 的实际值。验证成功后，服务会设置 `HttpOnly`、`SameSite=Strict` 会话 Cookie；管理密钥不会保留在地址栏或交给页面 JavaScript。

在地图中保存一个测试位置，然后把以下地址放入 Shadowrocket、Loon 等客户端的 `configUrl`：

```text
https://picker.example.com/loc.json?token=<SERVICE_HEX_64_LOCATIONPICKERREAD>
```

这里必须使用**只读密钥**，不要使用管理密钥。

## 5. 部署验收

按顺序完成以下检查：

1. `GET https://picker.example.com/healthz` 返回 `{"status":"ok"}`。
2. 根路径显示登录页，错误密钥无法登录。
3. 使用管理密钥登录后，浏览器地址栏不包含密钥。
4. 保存新坐标后，只读 URL 返回相同的 `latitude`、`longitude` 和 `enabled`。
5. 只读密钥不能调用 `/set` 或 `/enable`。
6. 重新部署应用后再次读取 `/loc.json`，坐标仍然存在。
7. 客户端使用 `configUrl` 后能读取新坐标；刷新 iOS 定位服务后结果生效。

只有以上检查全部通过，才算部署完成。

## 运维与更新

- **数据卷**：坐标保存在命名卷 `location-picker-data` 的 `/data/loc.json`。
- **备份**：升级或删除应用前，在 Coolify 中备份该卷；删除卷会清除保存的坐标。
- **更新**：拉取 `main` 最新提交并重新部署。镜像构建会运行锁定的 Node 依赖。
- **健康检查**：Coolify 通过容器内的 `/healthz` 判断服务状态。
- **密钥轮换**：修改对应的 `SERVICE_HEX_64_*` 后重新部署。轮换只读密钥后，所有客户端 `configUrl` 必须同步更新。
- **日志**：只读 Token 位于客户端 URL 中，应限制代理访问日志和 Coolify 日志的查看权限。

## 故障排查

### 应用没有生成域名

确认根 Compose 中仍有 `SERVICE_URL_LOCATION_PICKER_8080: /`，点击 **Scan Again**，并检查应用是否使用普通 Docker Compose 模式。不要手动发布 `8080:8080`。

### 容器持续 Unhealthy

查看启动日志。常见原因是管理密钥或只读密钥缺失、短于 32 字符，或者两个密钥相同。修正变量并重新部署，不要在日志截图中泄露变量值。

### 退出、保存或恢复定位返回 `invalid request origin`

拉取仓库最新提交并重新部署。旧版本始终使用 Coolify 首次生成的 `PUBLIC_ORIGIN`，绑定自定义域名后会误判来源；新版本会在启用 `TRUST_PROXY=1` 时使用 Coolify 转发的当前协议与域名，同时继续拒绝跨域写请求。

### `/loc.json` 返回 `401` 或 `403`

- URL 必须包含 `?token=`。
- Token 必须是当前的 `SERVICE_HEX_64_LOCATIONPICKERREAD`，复制时不要带尖括号、引号或空格。
- 密钥轮换后，旧客户端 URL 会立即失效。

### OSM 地图瓦片显示 `403 Access blocked`

拉取仓库最新提交并重新部署。旧镜像使用了过严的 Referer 策略，会被 OpenStreetMap 瓦片服务拒绝；最新版本仅向第三方发送站点来源，不会发送路径或密钥。

### 重新部署后坐标丢失

确认服务挂载的是命名卷 `location-picker-data:/data`，并且部署过程中没有删除或重建该卷。可从最近的 Coolify 卷备份恢复。

## 本地 Compose

只做本地测试时，使用 [`location-picker/docker-compose.yml`](location-picker/docker-compose.yml) 和 [`location-picker/.env.example`](location-picker/.env.example)。本地 Compose 与 Coolify 入口不同，不要把本地 `.env` 提交到 Git。
