# iOS Location Spoofer

**中文** · [English](README.en.md)

通过 Shadowrocket、Surge、Loon、Quantumult X 或 Stash 的 HTTPS 解密功能，改写 Apple 定位服务返回的坐标。无需越狱，也无需编译 iOS 应用。

> [!WARNING]
> 本项目会在你的设备上启用 HTTPS 中间人解密。仅用于你拥有或获授权设备上的开发、测试与隐私研究；不要用于规避风控、考勤、反欺诈或任何服务规则。CA 私钥只能保存在自己的设备上，不使用时请关闭模块和 HTTPS 解密。

## 从这里开始

| 你的目标 | 文档 |
|---|---|
| 第一次使用 Shadowrocket | [中文完整教程](使用教程.md) |
| Read the guide in English | [English tutorial](使用教程.en.md) |
| 用 Coolify 部署安全的网页选点器 | [Coolify 部署指南](COOLIFY.md) |
| 用命令行部署 Cloudflare Worker | [Worker / Wrangler 指南](location-picker/worker/README.md) |
| 只用 Cloudflare 网页后台部署 | [Worker 网页后台指南](location-picker/cloudflare-webui/README.md) |

## 快速使用

1. 从下表选择代理软件并导入对应文件。
2. 开启 HTTPS 解密 / MITM，安装 CA 描述文件，并在 iOS 的“证书信任设置”中开启完全信任。
3. 启用模块，修改 `latitude` 和 `longitude`。
4. 重连代理，关闭定位服务至少 10 秒后重新开启，再用 Apple 地图验证。

新手请不要跳过证书信任步骤，完整操作和故障排查见[中文教程](使用教程.md)。

## 支持的客户端

| 客户端 | 配置文件 | 导入位置 | 状态 |
|---|---|---|---|
| Shadowrocket | [查看](ios-location-spoofer.sgmodule) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.sgmodule) | 配置 → 模块 → `+` → 来自 URL | 已验证 |
| Surge | [查看](ios-location-spoofer-surge.sgmodule) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer-surge.sgmodule) | 首页 → 模块 → 安装新模块 | 已验证 |
| Loon | [查看](ios-location-spoofer.lnplugin) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.lnplugin) | 设置 → 插件 → 添加插件 | 已验证 |
| Quantumult X | [查看](ios-location-spoofer.snippet) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.snippet) | 设置 → 重写 → 添加 | 待更多实测 |
| Stash | [查看](ios-location-spoofer.stoverride) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.stoverride) | 覆写 → 安装覆写 | 已验证 |

排查异常时，至少记录客户端版本、iOS 版本、请求 Host 和原始错误日志；不要公开密钥、Cookie、证书或完整私有 URL。

## 配置参数

默认位置为 Apple Park：`37.3349, -122.00902`。

```text
latitude=39.9042&longitude=116.4074
```

| 参数 | 默认值 | 说明 |
|---|---:|---|
| `latitude` | `37.3349` | 纬度，范围 `-90` 到 `90` |
| `longitude` | `-122.00902` | 经度，范围 `-180` 到 `180` |
| `altitude` | `530` | 海拔（米），可为负数 |
| `horizontalAccuracy` | `39` | 水平精度（米） |
| `verticalAccuracy` | `1000` | 垂直精度（米） |
| `address` | 空 | 仅 Loon：定时解析地址并缓存 |
| `failOpen` | `true` | 脚本异常时放行原始响应 |
| `debug` | `false` | 输出调试日志；排错完成后建议关闭 |
| `configUrl` | 空 | 可选：网页选点器的 `/loc.json` 完整地址 |

## 工作原理

iPhone 会把附近 Wi-Fi 与基站信息发送给 Apple 定位服务，再根据返回的坐标计算位置。本项目只匹配定位相关的 `/clls/wloc` 请求，在代理客户端中改写响应里的 Wi-Fi、基站和运动状态字段。

所有客户端配置都只列出必要的五个 Host；不要改成 `*.apple.com` 之类的宽泛通配符，否则会扩大 HTTPS 解密范围。

## 网页地图选点器（可选）

经常切换位置时，可以部署 `location-picker`，在地图上点选并让客户端通过 `configUrl` 读取坐标。

| 部署方式 | 适合场景 | 鉴权方式 | 指南 |
|---|---|---|---|
| Coolify / Docker Compose | 有服务器；希望管理端与客户端权限分离 | 管理密钥 + 只读密钥 + 浏览器会话 | [Coolify 指南](COOLIFY.md) |
| Cloudflare Worker（CLI） | 无服务器；熟悉命令行 | 单个 URL Token | [Wrangler 指南](location-picker/worker/README.md) |
| Cloudflare Worker（网页） | 无服务器；只想复制单文件 | 单个 URL Token | [网页后台指南](location-picker/cloudflare-webui/README.md) |
| Node.js 直接运行 | 本地开发或已有进程管理方案 | 管理密钥 + 只读密钥 + 浏览器会话 | [`location-picker/server.js`](location-picker/server.js) 文件头 |

Coolify 版推荐用于公网长期运行：管理密钥不会进入浏览器地址栏，模块仅持有只读密钥。Cloudflare Worker 版为了兼容现有客户端，Token 会出现在 URL 中，应限制日志访问并定期轮换。

## 常见故障

- **`MITM failed`**：确认 CA 已安装且开启完全信任，请求 Host 在模块列表内，并尝试关闭 QUIC / HTTP3 后重连。
- **坐标不变化**：确认模块和 HTTPS 解密均已启用；关闭定位服务至少 10 秒后重开，并彻底退出地图再打开。
- **网页选点已保存但客户端未更新**：直接请求 `/loc.json` 核对坐标；Cloudflare KV 与 Loon 缓存可能需要约 60 秒。
- **恢复真实位置**：关闭模块或代理总开关，再关闭并重新开启定位服务。

更多逐项检查见[中文教程的故障排查](使用教程.md#故障排查)。

## 项目结构

```text
location-spoofer.js                 客户端共享核心脚本
location-spoofer-qx.js              Quantumult X 专用脚本
ios-location-spoofer.*              五种客户端配置
location-picker/server.js           Node.js 网页选点服务
location-picker/worker/             Cloudflare Worker 源码与测试
location-picker/cloudflare-webui/   Worker 单文件发布产物
docker-compose.yml                  Coolify 部署入口
```

每次推送和拉取请求都会执行集成测试、文档内部链接检查、Cloudflare 产物一致性检查、依赖审计、Compose 校验和生产镜像构建。

## 来源与许可

核心研究来源于 [acheong08/ios-location-spoofer](https://github.com/acheong08/ios-location-spoofer)。本仓库将其逻辑移植到 JavaScript，并增加多客户端适配、基站坐标处理、响应格式兼容和网页选点器。

许可证见 [LICENSE](LICENSE)。
