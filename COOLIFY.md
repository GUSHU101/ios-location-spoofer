# Coolify 部署

本仓库根目录已经提供适用于 Coolify 的 `docker-compose.yml`。应用只在容器内监听 `8080`，不发布宿主机端口；HTTPS 和公网路由由 Coolify 代理负责。

## 当前创建页面

如果页面已经识别到 `Docker Compose selected`，请保持以下值：

- Branch：`main`
- Build pack：`Docker Compose`
- Docker Compose File：`docker-compose.yml`
- Base directory：`/`
- Compose file：`/docker-compose.yml`

更新到最新提交后先点 **Scan Again**。根目录不再提供 `.env.example`，因此不应继续看到带占位密钥的 `.env.example · 3 variables` 提示。确认扫描结果后点 **Continue**。

## 创建应用

1. 在 Coolify 中新建 **Git Based → Docker Compose** 应用。
2. 仓库填写 `https://github.com/GUSHU101/ios-location-spoofer`，分支选择 `main`。
3. Compose 文件路径填写 `/docker-compose.yml`。
4. 使用 Coolify 的普通 Compose 部署模式，不要开启 Raw Compose。
5. Compose 中的 `SERVICE_URL_LOCATION_PICKER_8080` 会让 Coolify 为 `location-picker` 服务生成域名并路由到内部端口 `8080`。如需自有域名，在 Domains 中替换生成域名，服务选择 `location-picker`、协议选择 HTTPS、内部端口填写 `8080`。

Coolify 官方说明：Compose 应用应在文件中声明健康检查和持久卷，并且不要为通过域名代理访问的服务发布宿主机端口。

## 环境变量

Coolify 会根据 Compose 中的 `SERVICE_HEX_64_*` 变量自动生成并持久保存两个不同的 64 字符随机密钥：

```dotenv
SERVICE_HEX_64_LOCATIONPICKERADMIN=<Coolify 自动生成>
SERVICE_HEX_64_LOCATIONPICKERREAD=<Coolify 自动生成>
SESSION_TTL=43200
```

无需把真实密钥写入仓库。解析完成后可在 Coolify 的 Environment Variables 页面查看或轮换它们；不要把真实值提交到 Git、部署日志或截图中。

- `SERVICE_HEX_64_LOCATIONPICKERADMIN`：映射为容器内的 `TOKEN`，只用于首次打开管理页面和 Bearer 管理 API。
- `SERVICE_HEX_64_LOCATIONPICKERREAD`：映射为容器内的 `READ_TOKEN`，只允许读取 `/loc.json`，供 Shadowrocket、Surge、Loon、Quantumult X 或 Stash 使用。
- `SERVICE_URL_LOCATION_PICKER_8080`：由 Coolify 管理的公开 HTTPS URL，同时用于严格校验管理页面的写请求来源。
- `SESSION_TTL`：管理页面会话有效期，默认 12 小时，允许范围 5 分钟到 24 小时。

首次解析后请确认两个 `SERVICE_HEX_64_*` 值均已生成、长度为 64 且互不相同，再开始部署。

## 首次访问

部署成功后打开：

```text
https://你的域名/
```

在登录表单输入 `SERVICE_HEX_64_LOCATIONPICKERADMIN` 的实际值。服务通过 POST 验证后会换成 `HttpOnly`、`SameSite=Strict` 会话 Cookie，管理密钥不会进入 URL、浏览器 JavaScript 或后续保存请求。

模块远程配置地址只使用只读密钥：

```text
https://你的域名/loc.json?token=<SERVICE_HEX_64_LOCATIONPICKERREAD 的实际值>
```

## 运维

- 健康检查：`GET /healthz`，不需要认证，只返回服务可用状态。
- 数据：保存在 Compose 命名卷 `location-picker-data` 的 `/data/loc.json`。
- 备份：在 Coolify 中备份该持久卷；重新部署容器不会清除坐标数据。
- TLS：由 Coolify 统一签发和终止，生产环境不要设置 `CERT`/`KEY`。
- 日志：模块读取 URL 含有只读密钥，仍应限制 Coolify 部署日志和代理访问日志的查看权限。

## 部署验证

部署日志显示健康后依次检查：

1. `https://你的域名/healthz` 返回 `{"status":"ok"}`。
2. 打开根路径，使用管理密钥登录；浏览器地址栏不应包含密钥。
3. 保存一个测试坐标后，用只读密钥访问 `/loc.json?token=...`，确认返回新坐标。
4. 使用管理密钥访问 `/loc.json` 可以读取，但只读密钥不能调用 `/set` 或 `/enable`。
5. 重新部署一次并再次读取 `/loc.json`，确认命名卷中的坐标没有丢失。
