# 御膳智控·主管版 (Android TWA APK) 部署配置指南

本指南详细说明如何基于线上餐饮 ERP 网站（「御膳智控」），为主管生成专用的 Android TWA (Trusted Web Activity) APK，同时确保普通员工继续顺畅使用 PWA 网页版。

---

## 一、双端访问架构

| 终端类别 | 使用人群 | 启动网址 / 入口 | 应用名称 | 表现形式 |
| :--- | :--- | :--- | :--- | :--- |
| **普通员工 PWA** | 门市所有员工/厨师 | `https://<正式域名>/` | 御膳智控 ERP | 网页 PWA / 桌面快捷方式 |
| **主管 Android APK** | 1 名主管专用 | `https://<正式域名>/?portal=boss` | 御膳智控·主管版 | Android 原生 TWA APK |

> **关键提醒**：
> - 网站全局 PWA Manifest（`manifest.json`）保持为普通员工的 PWA 配置（`start_url`: `"/"`，名称: `"御膳智控 ERP"`）。
> - 主管 APK 的专属名称「御膳智控·主管版」和专属入口 `/?portal=boss` 仅配置在 PWABuilder / Bubblewrap 打包流程中，**绝不覆盖网站全局 PWA Manifest**。

---

## 二、Android TWA 基本配置参数

- **App Name (应用名称)**: 御膳智控·主管版
- **Short Name (应用短称)**: 御膳主管
- **Package Name (包名)**: `com.kimliankee.erp.supervisor`
- **TWA Launch URL (启动网址)**: `https://<正式 Cloud Run 域名>/?portal=boss`
- **Scope (作用域)**: `/`
- **Theme Color (主题色)**: `#FFD200`
- **Background Color (背景色)**: `#111111`
- **Display Mode**: `standalone`
- **Digital Asset Links 位置**: `https://<正式 Cloud Run 域名>/.well-known/assetlinks.json`

---

## 三、PWABuilder / Bubblewrap 配置指南

### 使用 PWABuilder 打包（推荐）
1. 打开 [PWABuilder.com](https://www.pwabuilder.com/)。
2. 输入主管入口网址：`https://<正式 Cloud Run 域名>/?portal=boss`
3. 点击 **Start** 校验，通过后点击 **Package for Store** -> 选择 **Android** -> **Options**。
4. 修改选项：
   - **Package ID**: `com.kimliankee.erp.supervisor`
   - **App Name**: `御膳智控·主管版`
   - **Launcher Name**: `御膳主管`
   - **Start URL**: `/?portal=boss`
   - **Icon**: 使用预置的 `/icons/icon-512.png` 与 `/icons/icon-maskable-512.png`
5. 点击 **Generate** 下载生成的 Zip 压缩包，解压后获取 `.apk` 安装包以及签名密钥文件（`signing.keystore` / `assetlinks.json`）。

---

## 四、Digital Asset Links 配置与真实 SHA-256 指纹替换

1. 获取签名指纹：
   - 如果使用 PWABuilder 自动生成的 Keystore，可以在解压包中的 `readme.html` 或 `assetlinks.json` 中找到 `SHA-256 Fingerprint`。
   - 如果使用 Keytool 查询你的 `.keystore` 文件：
     ```bash
     keytool -list -v -keystore my-release-key.keystore
     ```
2. 替换项目中的占位符：
   打开本项目 `public/.well-known/assetlinks.json`，将 `SHA256_CERT_FINGERPRINT` 替换为真实指纹（如 `14:6D:E8:F7:...`）：
   ```json
   [
     {
       "relation": [
         "delegate_permission/common.handle_all_urls"
       ],
       "target": {
         "namespace": "android_app",
         "package_name": "com.kimliankee.erp.supervisor",
         "sha256_cert_fingerprints": [
           "14:6D:E8:F7:2C:19:62:37:0B:4D:76:88:94:41:06:55:72:42:0B:D6:76:0A:10:97:EB:54:CE:AD:1A-REPLACED"
         ]
       }
     }
   ]
   ```
3. 重新打包并部署 Cloud Run：
   ```bash
   npm run build
   # 重新部署至 Cloud Run
   ```
4. 验证 `assetlinks.json` 服务状态：
   ```bash
   curl -i https://<正式 Cloud Run 域名>/.well-known/assetlinks.json
   ```
   **必须确认**：返回 HTTP 200，`Content-Type: application/json`，且内容为正确 JSON 字符串而非 `index.html`。

---

## 五、APK 安装与小米 (Xiaomi) 手机特别设置

### 通用安装步骤
1. 将 `.apk` 复制或发送至主管 Android 手机。
2. 点击安装时，允许“允许来自此来源的应用”。

### 小米 (Xiaomi / MIUI / HyperOS) 手机特别设置
如遇到安装阻挡或提示无法安装未签名应用：
1. **设置** -> **应用设置** -> **权限管理** -> **特殊应用权限** -> **安装未知应用** -> 选择传输 APK 的应用（如 Chrome 或 文件管理）-> 开启“允许来自此来源的应用”。
2. 如启用开发者模式：
   - **设置** -> **更多设置** -> **开发者选项** -> 开启 **USB 安装** 及 **USB 调试（安全设置）**。
   - 在 MIUI/HyperOS 安装弹窗中，勾选“记住我的选择”并点击“仍要安装”。

---

## 六、APK 维护与安全原则

1. **更新网页与逻辑**:
   - TWA 本质是原生级外壳。当在 Cloud Run 上更新 ERP 业务代码（React/Firebase/ Express API）时，主管打开 APK 将**自动加载最新线上逻辑**，无需重新生成或重装 APK。
2. **密钥与包名持久性**:
   - 重新打包 APK 或升级版本时，**必须保持完全相同的 Package Name (`com.kimliankee.erp.supervisor`)** 及**相同的 Keystore 签名密钥**，否则手机无法覆盖升级。
   - **务必妥善备份你的 `.keystore` 签名文件和密码**！
3. **分发说明**:
   - 本 APK 为内部主管单人使用，无需上架 Google Play Store，亦**不需要**注册 Google Play Developer 开发者账号。

---

*配置文件更新时间: 2026-07-21*
