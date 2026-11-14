# iOS 26 / Shadowrocket：选点保存后手机不更新的分层诊断

[返回项目首页](../README.md) · [Shadowrocket 安装教程](../使用教程.md) · [Coolify 部署](../COOLIFY.md)

> **能力边界**：本项目仅尝试改写可被代理读取的 Apple 网络定位响应；不是公开的 Core Location 系统级虚拟定位 API。即使脚本输出 PATCHED，也不保证 iOS 接受修改结果；若 TLS 连接被证书信任或额外 pinning 策略拒绝，JavaScript 无法从后续响应中修复证书验证。

## 先区分三种“保存成功”

1. **网页保存成功**：管理端 POST /set 返回 200，坐标写入服务持久卷。
2. **手机配置同步成功**：Shadowrocket 脚本通过 GET /loc.json 实际取得新的坐标。
3. **系统定位生效**：系统使用了修改的网络定位结果。这一结果需要真机观察，不能从第 1、2 步自动推导。

## 1. 校验服务

- Coolify 的卷挂载应为 location-picker-data:/data，后端 DATA_FILE=/data/loc.json。
- 登录管理页，保存一个新坐标。
- **从页面底部复制只读 URL**，用 iPhone Safari 打开，检查 HTTP 200、enabled=true 与 latitude/longitude 是最新值。绝不要粘贴含 token 的 URL 到 GitHub Issue 或日志。
- 如果 401/403，检查 READ_TOKEN 是否轮换，以及 Shadowrocket 是否仍保存旧地址。
- 如果 200 却仍是旧值，检查当前访问的域名是否路由到同一个 Coolify 实例、卷是否被替换。

## 2. 配置 Shadowrocket

- 导入公开模块后，在私有的本地配置里设置 **一个且仅一个** URL 编码的 configUrl。
- 使用管理页提供的“复制参数”（该参数含只读 token，不要提交到公共 Git 仓库）。
- 不要在已有 &configUrl= 后继续追加另一个 &configUrl=；修改原有值或先删除旧值。
- 保持 HTTPS 解密、模块启用及 CA 完全信任。不要添加 *.apple.com 这类过宽通配域。
- 将 debug=true 临时打开，核对“REMOTE_CONFIG_FRESH”代表本次响应取到新配置，“REMOTE_CONFIG_STALE_FALLBACK”代表网络失败时使用了最近成功的配置，“REMOTE_CONFIG_UNAVAILABLE”代表未获取到任何可信配置。本次修复不会在无可用配置时静默使用默认 Apple Park 坐标。
- 调试日志可能包含用户自定义坐标；分享前要确认所有隐私信息和密钥都已遮盖。

## 3. 按顺序诊断

| 表现 | 判断 | 下一步 |
|---|---|---|
| GET /loc.json 显示旧坐标 | 服务器未读取到最新保存值 | 检查 /set、持久卷、域名路由 |
| GET 返回 401/403 | 只读 Token 不正确 | 轮换/更新配置地址 |
| DUPLICATE_CONFIG_URL | 模块中存在重复参数 | 只保留一个 URL |
| REMOTE_CONFIG_INVALID | 接口字段缺失或类型错误 | 校验 enabled、经纬度及精度 |
| REMOTE_CONFIG_UNAVAILABLE | 请求失败且缓存不存在或超期 | 检查 HTTPS/DNS/连接超时 |
| REMOTE_CONFIG_FRESH，但根本没有定位重写日志 | Apple 定位请求可能未命中模块 | 观察请求 Host、路径、模块匹配 |
| MITM failed / trust / pinning | TLS 验证失败 | 保留日志，勿尝试靠修改 protobuf 解决 |
| NO_PATCHABLE_LOCATION_FIELDS | 当前响应无匹配坐标字段 | 使用脱敏测试样本在本地验证解析器 |
| 已修改多个 Wi-Fi/基站位置、地图仍未变化 | 系统未采用该响应，或其他定位来源占优 | 使用支持的测试机制验证 App 定位逻辑 |

**重要**：日志中的“PATCHED”仅说明脚本构建了改写响应，不等于 Core Location 给应用返回了目标位置。

## 4. 修复内容及运维限制

- 修复 persistentStore.write(value,key) 传参反转；
- 本次请求优先读取网络最新配置，只有网络失败时才回退最近 15 分钟的有效缓存；
- 只接受 HTTP 200 和经验证的 JSON 坐标；失败不再静默使用默认坐标；
- 检测重复 configUrl；不再输出包含 token 的完整参数；
- 解析前优先使用解压后的二进制字节；不改变 bare protobuf 的格式、保留 synthetic 后缀；
- 未找到可修改 Wi-Fi/基站字段时返回明确诊断，放行原始响应。
- **无后台推送**：客户端仍需实际出现一个符合规则的网络定位响应才会读取并应用新配置。

## 5. Apple 公开文档与支持边界

- [Core Location](https://developer.apple.com/documentation/corelocation)：定位使用 GPS、Wi-Fi、蜂窝等多种设备数据源。
- [Getting the current location of a device](https://developer.apple.com/documentation/corelocation/getting-the-current-location-of-a-device)：应用的位置更新策略、权限和准确度。
- [Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)：ATS 与 TLS 证书验证。
- [Performing manual server trust authentication](https://developer.apple.com/documentation/foundation/performing-manual-server-trust-authentication)：服务器证书绑定等更严格的校验。
- [Simulating location in tests](https://developer.apple.com/documentation/xcode/simulating-location-in-tests)：Xcode 测试计划、GPX、UI 自动化中的位置模拟。
- [CLLocationSourceInformation](https://developer.apple.com/documentation/corelocation/cllocationsourceinformation)：软件模拟位置来源信息。

公开资料不包含本仓库解析的 /clls/wloc 私有封包定义，不能把源代码中已有的 Protobuf 字段编号当作 Apple 官方协议保证。切勿以调整脚本、禁用 TLS 校验或扩大 MITM 主机列表的方式尝试“修复”证书拒绝。

## 6. 上线前验收清单

- [ ] 私有 READ_TOKEN 完成轮换，公开模块文件不包含真实凭据
- [ ] 管理端保存新坐标后只读 /loc.json 返回 HTTP 200 和新值
- [ ] Shadowrocket 模块只有一个有效 configUrl
- [ ] 远程读取日志出现 REMOTE_CONFIG_FRESH，坐标与管理端一致
- [ ] 错误 JSON、401、网络超时不会错误应用 Apple Park 默认坐标
- [ ] 自动化单元测试通过
- [ ] TLS 解密是否成功通过真机日志验证
- [ ] iOS 26 真机 Apple 地图与目标应用分别验证，记录观察结果；未通过时标记“不支持/未验证”
