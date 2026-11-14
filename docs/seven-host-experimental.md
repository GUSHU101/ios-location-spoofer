# 七域名实验版：Apple WLOC 与位置上报端点的安全边界

[返回项目首页](../README.md) · [MITM 域名总审计](mitm-host-audit.md) · [iOS 26 排障](ios26-troubleshooting.md)

## 重要结论

此扩展版**准确加入**了 `gs-loc-new.apple.com` 和 `gsp10-ssl.apple.com`，但采用不同策略：

- `gs-loc-new.apple.com`：实验性允许在 **HTTPS /clls/wloc** 响应上运行 WLOC 解析/改写脚本；成功与否必须用真实合法响应验证，社区名称证据不等于 iOS 26 兼容承诺。
- `gsp10-ssl.apple.com`：明确列入**七域名实验版的 MITM Host 清单**，但**不列入任何 WLOC 响应改写规则**。公开的 iOS Protobuf 流量研究将 `/hcy/pbcwloc`、`/pds/pd`、`/hvr/trc` 分别与众包 Wi-Fi/蜂窝观测、GPS fix 和传感器轨迹上报相关联，而非 WLOC 坐标查询。修改它们无法替代硬件 GPS。

> **隐私风险**：HTTPS 解密按 Host 运行，不是按 URL 路径运行。即使脚本不会改写 `gsp10-ssl.apple.com` 的上传接口，只要启用七域名实验模块，代理就可能看到该域名的上传明文。只在你拥有或获授权的测试设备上短期使用。常规场景优先选双域名或五域名配置。

## 实验域名分级

| Host | MITM | WLOC 脚本在 `/clls/wloc` 执行 | 证据层级 |
|---|---|---|---|
| `gs-loc.apple.com` | 是 | 是 | 已有 WLOC 查询研究 |
| `gs-loc-cn.apple.com` | 是 | 是 | 既有模块兼容 |
| `gsp-ssl.ls.apple.com` | 是 | 是 | 社区兼容清单 |
| `bluedot.is.autonavi.com` | 是 | 是 | 社区兼容清单 |
| `bluedot.is.autonavi.com.gds.alibabadns.com` | 是 | 是 | 社区兼容清单 |
| `gs-loc-new.apple.com` | 是 | **实验性** | 第三方工具列出；缺乏 iOS 26 真机响应验证 |
| `gsp10-ssl.apple.com` | **是（仅实验）** | **否** | 研究主要显示位置/传感器数据上传 |

**禁止**增加 `*.apple.com`、`*.ls.apple.com`，禁止修改已知位置上报路径，禁止停用服务器证书验证。七域名不是 Apple 官方认可的定位接口列表。

## 一键导入前先选择客户端：七域名实验版（仅以下文件）

- [Shadowrocket 模块](../ios-location-spoofer-experimental.sgmodule)
- [Surge 模块](../ios-location-spoofer-experimental-surge.sgmodule)
- [Loon 插件](../ios-location-spoofer-experimental.lnplugin)
- [Stash Override](../ios-location-spoofer-experimental.stoverride)
- [Quantumult X 片段](../ios-location-spoofer-experimental.snippet)

本目录对应的双域名、五域名和七域名是互斥方案。**同一客户端不要同时启用两份。** 在 Shadowrocket 上，启用 HTTPS 解密及本地生成并在 iOS 上完全信任的 CA 仍是必要条件，但这不能保证 Apple `locationd` 会接受被代理重签名的证书。

## Draft PR 真机预览的重要限制

当前实验文件的正式脚本路径仍指向 `main/location-spoofer.js`，因为将来合并到主分支后才应稳定订阅。**直接导入 Draft PR 文件并不能证明使用了最新核心脚本。**

在你拥有或获授权测试的 iOS 设备上：
1. 下载本 PR 分支的实验模块并转为本地私有模块。
2. 将其中每条 `script-path` 的 `/main/location-spoofer.js` 临时替换为：

   ```text
   https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/refs/heads/fix/ios26-remote-sync-and-diagnostics/location-spoofer.js
   ```

   Quantumult X 专用脚本对应 `location-spoofer-qx.js`，同样要选择测试分支。
3. Shadowrocket 的 `argument` 仅保留一个私有 `configUrl`；使用选点器生成的只读地址（不要公开分享 Token）。
4. 用 Safari 单独验证选点器 `/loc.json` 已返回新坐标；这是**服务器保存验证**，不是定位修改验证。
5. 仅针对匹配 URL 观察 `REMOTE_CONFIG_FRESH`、`NO_PATCHABLE_LOCATION_FIELDS` 或 TLS 错误等诊断。记录主机名、路径、HTTP 状态、日志时间，避免采集或分享上传正文。
6. 在设备上分别验证以下四个状态，不可跳级承诺：`REQUEST_MATCHED` → `TLS_DECRYPTED` → `WLOC_RESPONSE_PATCHED` → `CORE_LOCATION_ADOPTED`。

## 如果地图位置不变

- 七域名没有出现任何 WLOC 请求：扩域不解决触发问题；检查实际请求 Host、VPN 路由与位置服务。
- WLOC 请求出现但 TLS failed/untrusted/pinning：先停止扩大域名。用户证书完全信任不代表 Apple 系统进程接受它，JavaScript 无法修复 TLS 握手。
- `REMOTE_CONFIG_FRESH`，但是 `NO_PATCHABLE_LOCATION_FIELDS`：已取得网页配置，但当前二进制响应无法按现有 Protobuf 字段假设修改；不能盲目增删字段。
- 日志显示 patch 了 Wi-Fi/蜂窝字段但 Apple 地图仍是原始位置：**只验证了网络修改，未验证 Core Location 采用**。GPS、系统缓存、应用定位权限和其他数据来源均可能影响结果。
- `gsp10-ssl.apple.com` 流量增加：它主要是数据上传端点的候选信号，不能推出“需要改写它才能获得目标位置”。无需长期保持 MITM。

## 公开研究与 Apple 文档

- [iOS Protobuf Decoding](https://github.com/doug-leith/ios-protobuf-decoding)：包含 WLOC lookup 与 `gsp*-ssl.apple.com` 数据上传路径研究，采样设备为 iOS 16.7.11；不能直接推定 iOS 26 完全一致。
- [Apple Core Location](https://developer.apple.com/documentation/corelocation)：定位来源包括 Wi-Fi、GPS、蜂窝、蓝牙等。
- [Apple Transport Security](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)：TLS/ATS 与服务端信任。
- [Apple Network Extension](https://developer.apple.com/documentation/networkextension)：第三方网络扩展的受支持边界。

**发布门槛**：必须完成 iOS 26 真机可用性验证后才能宣称在该机型上成功更改位置。自动化测试只能确认配置范围、二进制逻辑和服务端行为，不能通过软件模拟证明系统定位已被替换。
