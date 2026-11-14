# iOS Location Spoofer

**中文** · [English](README.en.md)

通过 Shadowrocket、Surge、Loon、Quantumult X 或 Stash 的 HTTPS 解密功能，改写 Apple 定位服务返回的坐标。无需越狱，也无需编译 iOS 应用。

> [!WARNING]
> 本项目会在你的设备上启用 HTTPS 中间人解密。仅用于你拥有或获授权设备上的开发、测试与隐私研究；不要用于规避风控、考勤、反欺诈或任何服务规则。CA 私钥只能保存在自己的设备上，不使用时请关闭模块和 HTTPS 解密。

## 从这里开始

| 你的目标 | 文档 |
|---|---|
| 第一次使用 Shadowrocket | [中文完整教程](使用教程.md) |
| iOS 26 网页已保存但手机位置不更新 | [iOS 26 分层排障与验收](docs/ios26-troubleshooting.md) |
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

**重要边界：** 网页保存成功、脚本读到新配置、iOS 系统实际采用修改后的定位，属于三个不同阶段。Apple 的 Core Location 并不提供通过 HTTPS 代理修改系统全局定位的公开 API。iOS 26 故障请先看[分层排查指南](docs/ios26-troubleshooting.md)。**公开仓库中的模块不应写入带密钥的 configUrl**；请在手机本地私有配置中替换单一 configUrl，若此前使用过公开 Token，需到服务端轮换。

## HTTPS 解密范围：默认兼容 vs 最小权限

[域名清单、Apple TLS 证书边界及验证步骤](docs/mitm-host-audit.md)。标准兼容模块针对已列出的五个具体 WLOC 域名；如只有两个主要 Apple 定位 Host 的请求，可以改用 [Shadowrocket 最小解密模块](ios-location-spoofer-minimal.sgmodule) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer-minimal.sgmodule)。**两份模块二选一，不要同时启用。** 所有请求脚本只匹配 HTTPS 的 `/clls/wloc`，而 MITM 解密权限本身以域名为边界，不是只对一个 URL 路径生效。不能通过增加通配域名绕过证书绑定。

## 七域名实验模式（仅在授权设备测试）

已新增 `gs-loc-new.apple.com` 和 `gsp10-ssl.apple.com` 的**七域名可选实验配置**，同时保留双域名最小模式和原五域名兼容模式。前者仅在 `/clls/wloc` 上试验，后者主要涉及敏感位置观测上传，**不会被定位改写脚本处理**；但 HTTPS MITM 仍以 Host 为边界，请勿在日常设备上长期打开。

[七域名原理、五种客户端配置、隐私风险与 iOS 26 验收指南](docs/seven-host-experimental.md)

| 实验客户端 | 模块 |
|---|---|
| Shadowrocket | [七域名实验版](ios-location-spoofer-experimental.sgmodule) |
| Surge | [七域名实验版](ios-location-spoofer-experimental-surge.sgmodule) |
| Loon | [七域名实验版](ios-location-spoofer-experimental.lnplugin) |
| Stash | [七域名实验版](ios-location-spoofer-experimental.stoverride) |
| Quantumult X | [七域名实验版](ios-location-spoofer-experimental.snippet) |

**同一客户端一次只能启用其中一种域名模式。** 增加域名无法保证绕过 iOS 26 的 TLS 证书绑定、也无法保证 Core Location 最终采用改写结果。

## 支持的客户端

| 客户端 | 配置文件 | 导入位置 | 状态 |
|---|---|---|---|
| Shadowrocket | [查看](ios-location-spoofer.sgmodule) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.sgmodule) | 配置 → 模块 → `+` → 来自 URL | 配置检查通过；iOS 26 待真机验收 |
| Surge | [查看](ios-location-spoofer-surge.sgmodule) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer-surge.sgmodule) | 首页 → 模块 → 安装新模块 | 配置检查通过；iOS 26 待真机验收 |
| Loon | [查看](ios-location-spoofer.lnplugin) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.lnplugin) | 设置 → 插件 → 添加插件 | 配置检查通过；iOS 26 待真机验收 |
| Quantumult X | [查看](ios-location-spoofer.snippet) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.snippet) | 设置 → 重写 → 添加 | 仅静态检查；真机待验证 |
| Stash | [查看](ios-location-spoofer.stoverride) · [直接导入](https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/main/ios-location-spoofer.stoverride) | 覆写 → 安装覆写 | 配置检查通过；iOS 26 待真机验收 |

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

Coolify / Node.js 版登录后会在页面底部显示“手机端配置”：可直接复制只读远程配置 URL，或复制适用于 Shadowrocket / Stash 的模块参数。该只读密钥不会写入登录页或管理页源码，只在已登录会话中按需获取。

## 常见故障

- **`MITM failed`**：确认 CA 已安装且开启完全信任，请求 Host 在模块列表内，并尝试关闭 QUIC / HTTP3 后重连。
- **坐标不变化**：确认模块和 HTTPS 解密均已启用；关闭定位服务至少 10 秒后重开，并彻底退出地图再打开。
- **网页选点已保存但客户端未更新**：直接请求 `/loc.json` 核对坐标；Cloudflare KV 与 Loon 缓存可能需要约 60 秒。
- **OSM 地图显示 `403 Access blocked`**：更新到最新提交并重新部署；旧版本隐藏了 OSM 要求的来源信息。
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
