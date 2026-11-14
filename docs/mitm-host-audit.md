# HTTPS 解密域名审计及 iOS 26 客户端验收

[返回项目首页](../README.md) · [iOS 26 分层排障](ios26-troubleshooting.md) · [Shadowrocket 教程](../使用教程.md)

> 此项目用于在授权设备上研究网络定位响应。它并非 Apple 官方的系统级定位模拟接口。解密范围应当最小化，禁止为了“提高成功率”使用 `*.apple.com`、跳过服务器证书验证或替换系统信任规则。

## 1. Host 分级

| 等级 | 目标 SNI/URL Host | 依据与用途 | 默认支持 |
|---|---|---|---|
| 核心 | `gs-loc.apple.com` | 社区 WLOC 项目主要目标 | 是 |
| 核心 | `gs-loc-cn.apple.com` | 社区 WLOC 项目中国区域目标 | 是 |
| 兼容 | `gsp-ssl.ls.apple.com` | 社区模块包含的备用目标 | 五域名兼容模式 |
| 兼容 | `bluedot.is.autonavi.com` | 社区模块包含的高德相关目标 | 五域名兼容模式 |
| 兼容 | `bluedot.is.autonavi.com.gds.alibabadns.com` | 社区模块包含的高德别名目标 | 五域名兼容模式 |
| 待核验 | `gs-loc-new.apple.com` | 个别第三方项目列出，缺少当前设备的实际 /clls/wloc 请求证据 | **否** |

Apple 的公开 Core Location / Network Extension 文档**没有**将 /clls/wloc 或上述内部域名定义为可供第三方依赖的稳定接口，以上属于社区兼容性信息，并不是 Apple 支持承诺。

## 2. Shadowrocket 的两种配置（只选择一种）

- **兼容模式（原有五域名）**：[ios-location-spoofer.sgmodule](../ios-location-spoofer.sgmodule)：适合已经确认命中备用域名的设备。
- **最小解密模式（推荐先验证）**：[ios-location-spoofer-minimal.sgmodule](../ios-location-spoofer-minimal.sgmodule)：仅对 `gs-loc.apple.com` 和 `gs-loc-cn.apple.com` 解密，缩小信任证书允许读取的流量范围。

不要同时启用两份模块，否则请求可能重复触发脚本。两个模块内均包含：
1. HTTPS-only 的 Request 预处理，设置 `Accept-Encoding: identity`；
2. HTTPS-only 的 Response 脚本，且 URL 必须完整匹配 `/clls/wloc` 或带查询参数；
3. 与脚本域名相同的精确 MITM hostname allowlist，使用 `%APPEND%` 避免覆盖其他模块。

仅允许上述路径被**脚本改写**；MITM 本身是以 Host 为边界的 HTTPS 解密，不能承诺“仅解密某个 URL 路径”。这也是最小域名模式重要的原因。

## 3. 真实请求诊断顺序

1. **确认当前实际启用的 Shadowrocket 配置文件、模块、HTTPS 解密开关和 CA 完全信任。** 请看 [Apple：手动安装的 CA 证书信任设置](https://support.apple.com/en-us/102390)。
2. 在有权限的设备上查看定位服务连接的 Host / URL 路径。只记录脱敏 Host、路径、HTTP/TLS 错误和时间，不公开请求正文、证书、Token。
3. 如果 Host 不在上述两个核心域名、但存在于另外三个兼容域名，先切换到五域名模式，再做受控对照；如没有相应请求，就不增加解密范围。
4. 如果连接被 TLS 证书绑定或系统信任策略拒绝，不能靠扩大 MITM 域名或修补二进制响应修复。
5. 如果请求存在、解密成功但脚本不触发，检查路径是否 **严格等于** `/clls/wloc`，不允许凭猜测改为所有 `/clls/*`。
6. 如果脚本得到 `REMOTE_CONFIG_FRESH`，再确认是否输出非零 Wi-Fi/Cell 改写字段。之后才观察 Apple 地图；日志“已改写”不等于 Core Location 已采用结果。

## 4. 兼容性与 Apple 官方文档

- [Apple Core Location](https://developer.apple.com/documentation/corelocation) 是系统统一位置框架；公开 API 不包含给任意 App 改写全局 GPS 的网络接口。
- [Apple Network Extension](https://developer.apple.com/documentation/networkextension) 提供 VPN / DNS / 内容过滤等网络扩展能力，不承诺可拦截所有 Apple 系统进程。
- [Apple Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) 说明 HTTPS 服务器信任与 ATS 要求。
- [Apple Performing manual server trust authentication](https://developer.apple.com/documentation/foundation/performing-manual-server-trust-authentication) 解释证书/公钥 pinning 如何施加更严格的服务端身份校验。
- [社区 WLOC 实现](https://github.com/ios151/wloc) 是备用域名列表及兼容性讨论的参考，而不是官方协议保证。

## 5. 具体源码护栏

- CI 检查五种客户端配置、两个 Shadowrocket 变体的 MITM 域名集合与脚本 URL 匹配；未确认的新域名必须以明确的审计结论进入仓库。
- 禁止匹配 `http://`、子域名、伪造后缀（`gs-loc.apple.com.evil.test`）、无关路径及 `wloc-settings`。
- 禁止在公开配置中写入私有的 `configUrl`、只读 Token 或 CA 私钥。
- 若不再需要测试，应关闭对应的 MITM 模块；仅关闭 JavaScript 不代表停止 HTTPS 解密。
- 若有证据显示 iOS 26 的 `locationd` 拒绝代理证书，请保留脱敏 TLS 错误用于诊断，而不是尝试关闭证书验证。

## 6. 验收结论的四个独立等级

- **HOST_MATCHED**：URL 处于明确的域名和路径 allowlist。
- **TLS_DECRYPTED**：设备成功完成可被代理读取的 TLS 响应。
- **RESPONSE_PATCHED**：脚本处理了非零 Wi-Fi/基站字段，构建出替代响应。
- **SYSTEM_LOCATION_ADOPTED**：真机上的 Core Location/地图实际表现与目标一致。

每一级均需要单独证据，绝不因为前一级成功就自动声称后一级也成功。


## 七域名研究扩展

已增加独立的 [七域名实验配置与风险审查](seven-host-experimental.md)。`gs-loc-new.apple.com` 仅作为候选 `/clls/wloc` 处理目标，`gsp10-ssl.apple.com` 只加入可选 HTTPS MITM Host 清单，脚本不改写其已知上传接口。默认双域名/五域名模块不受影响。七域名模式涉及敏感位置上报的潜在明文访问风险，仅用于授权短期测试。

## 7. 在 Draft PR 上进行真机预览（尚未合并 main）

**注意**：为了保证最终合并后的订阅地址稳定，当前提交到仓库的正式模块里的 `script-path` 仍指向 `main/location-spoofer.js`。如果从本 PR 分支直接导入模块而不改这个路径，你实际运行的仍可能是旧的 main 核心脚本。不能把这个测试当成新代码的真机验收。

授权测试设备可使用下列做法：

1. 从 [PR 分支选择模块](https://github.com/GUSHU101/ios-location-spoofer/tree/fix/ios26-remote-sync-and-diagnostics)，将 **最小模式或兼容模式其中一份**导入 Shadowrocket，并复制成手机上的本地私有模块（避免自动更新覆盖测试更改）。
2. 将模块中的**两个** `script-path`（Request 预处理和 Response 改写）都临时替换为经核验的 PR 分支脚本地址：

   ```text
   https://raw.githubusercontent.com/GUSHU101/ios-location-spoofer/refs/heads/fix/ios26-remote-sync-and-diagnostics/location-spoofer.js
   ```

3. 在本地 `argument` 中替换唯一的 `configUrl`，使用选点器生成的 URL 编码只读地址。不要将含 Token 的模块提交到 Git。
4. 先用 Safari 确认 `/loc.json` 返回新坐标，再检查 Shadowrocket 日志中是否有 `REMOTE_CONFIG_FRESH`、非零 Wi-Fi/Cell 改写统计、TLS 失败等状态。
5. 将结果记录为 **同步验证成功/失败** 和 **系统定位验证成功/失败** 两个独立结果，不要将它们混为一谈。

分支测试后关闭实验模块；未来完成真机验收并正式合并 PR 后，再使用 `main` 的长期订阅链接。不应将此临时分支脚本永久用于生产环境。
