# Coolify 部署

本仓库根目录已经提供适用于 Coolify 的 `docker-compose.yml`。应用只在容器内监听 `8080`，不发布宿主机端口；HTTPS 和公网路由由 Coolify 代理负责。

## 创建应用

1. 在 Coolify 中新建 **Git Based → Docker Compose** 应用。
2. 仓库填写 `https://github.com/GUSHU101/ios-location-spoofer`，分支选择 `main`。
3. Compose 文件路径填写 `/docker-compose.yml`。
4. 使用 Coolify 的普通 Compose 部署模式，不要开启 Raw Compose。
5. 为 `location-picker` 服务添加 HTTPS 域名，内部端口填写 `8080`。

Coolify 官方说明：Compose 应用应在文件中声明健康检查和持久卷，并且不要为通过域名代理访问的服务发布宿主机端口。

## 环境变量

必须在 Coolify 中分别生成两个不同的随机密钥：

```dotenv
TOKEN=<至少 32 字符的管理密钥>
READ_TOKEN=<至少 32 字符的只读密钥，不能与 TOKEN 相同>
SESSION_TTL=43200
```

可在本地使用 `openssl rand -hex 32` 分别生成。不要把真实密钥提交到 Git、部署日志或截图中。

- `TOKEN`：只用于首次打开管理页面和 Bearer 管理 API。
- `READ_TOKEN`：只允许读取 `/loc.json`，供 Shadowrocket、Surge、Loon、Quantumult X 或 Stash 使用。
- `SESSION_TTL`：管理页面会话有效期，默认 12 小时，允许范围 5 分钟到 24 小时。

## 首次访问

部署成功后打开：

```text
https://你的域名/
```

在登录表单输入 `TOKEN`。服务通过 POST 验证后会换成 `HttpOnly`、`SameSite=Strict` 会话 Cookie，管理密钥不会进入 URL、浏览器 JavaScript 或后续保存请求。

模块远程配置地址只使用只读密钥：

```text
https://你的域名/loc.json?token=<READ_TOKEN>
```

## 运维

- 健康检查：`GET /healthz`，不需要认证，只返回服务可用状态。
- 数据：保存在 Compose 命名卷 `location-picker-data` 的 `/data/loc.json`。
- 备份：在 Coolify 中备份该持久卷；重新部署容器不会清除坐标数据。
- TLS：由 Coolify 统一签发和终止，生产环境不要设置 `CERT`/`KEY`。
- 日志：模块读取 URL 含有只读密钥，仍应限制 Coolify 部署日志和代理访问日志的查看权限。
