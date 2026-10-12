# 📱 打包 Android APK — Bubblewrap 实战步骤

> 目标网址：`https://service-5174.ai.studio`
> 包名：`com.kimliankee.erp`
> 这份是「照着做就出 APK」的步骤，指令可以直接复制。

---

## 先搞懂 TWA 是什么

TWA (Trusted Web Activity) = **全屏浏览器外壳**。它**不打包你的程式码**，只是指向线上网址。

意思是：

- ✅ 以后改程式，只要重新部署网站，**APK 完全不用重打、不用重装**
- ⚠️ 网站挂了，APK 就打不开（跟浏览器一样）
- ⚠️ APK 绑死网域。`service-5174.ai.studio` 换掉的话，APK 要重打

---

## 事前检查（已经确认过了）

| 项目 | 状态 |
|---|---|
| `https://service-5174.ai.studio/manifest.json` 回有效 PWA manifest | ✅ |
| `https://service-5174.ai.studio/.well-known/assetlinks.json` 回 JSON（不是 HTML） | ✅ |
| 图标 192 / 512 / maskable-512 齐全 | ✅ |

---

## 一、安装 Bubblewrap

需要 **JDK 17+**（Android Studio 自带的就可以）和 **Node.js**。

```bash
npm install -g @bubblewrap/cli
```

第一次执行会问要不要自动下载 JDK 和 Android SDK。**如果你 Android Studio 已经装好 SDK，选「否」然后指定路径**：

```bash
bubblewrap doctor
```

它会告诉你缺什么。SDK 路径通常在：

- Windows：`C:\Users\<你的名字>\AppData\Local\Android\Sdk`
- macOS：`~/Library/Android/sdk`

---

## 二、产生 Android 专案

建一个空资料夹（**不要**放在 ERP 专案里面），进去执行：

```bash
bubblewrap init --manifest https://service-5174.ai.studio/manifest.json
```

它会一路问你，照下面回答：

| 问题 | 填什么 |
|---|---|
| Domain | `service-5174.ai.studio` |
| Application ID / Package | `com.kimliankee.erp` |
| App name | `御膳智控 ERP` |
| Short name | `御膳智控` |
| Display mode | `standalone` |
| Theme color | `#FFD200` |
| Background color | `#111111` |
| Start URL | `/` |
| Icon URL | `https://service-5174.ai.studio/icons/icon-512.png` |
| Maskable icon URL | `https://service-5174.ai.studio/icons/icon-maskable-512.png` |
| Include support for Play Billing | `No` |
| Request geolocation permission | `No` |
| Key store location | 直接 Enter（用预设 `./android.keystore`） |
| Key name | `android` |

**或者更省事**：把专案里的 `twa-manifest.json` 复制到这个空资料夹，然后直接跑

```bash
bubblewrap init --manifest ./twa-manifest.json
```

它会照里面预填好的值走，只要你确认几个问题就好。

> 建 keystore 时会要你设**两组密码**（keystore 密码 + key 密码）。
> **⚠️ 这两组密码和 `android.keystore` 档案务必备份好。**
> 弄丢的话以后没办法覆盖升级 APK，只能换包名重来、手机要先卸载旧版。

---

## 三、打包 APK

```bash
bubblewrap build
```

跑完会产出：

- `app-release-signed.apk` ← **这个就是要装到手机的**
- `app-release-bundle.aab` ← 上架 Google Play 用的，你不上架就用不到

---

## 四、拿到 SHA-256 指纹，更新 assetlinks

这一步不做，APK 打开会顶一条浏览器网址列。

```bash
keytool -list -v -keystore ./android.keystore -alias android
```

输出里找 `SHA256:` 那一行，长这样：

```
SHA256: AB:CD:EF:12:34:...:90
```

**把它设成 Cloud Run 的环境变数**（不用改程式、不用重新 build）：

```
TWA_PACKAGES = com.kimliankee.erp:AB:CD:EF:12:34:...:90
```

想让**旧 APK 和新 APK 同时有效**，用分号接两组：

```
TWA_PACKAGES = studio.ai.service_5174.twa:5D:4C:BC:CE:...:26:2D;com.kimliankee.erp:AB:CD:EF:...:90
```

设完重新部署，然后验证：

```bash
curl -i https://service-5174.ai.studio/.well-known/assetlinks.json
```

**必须**看到 `HTTP/2 200`、`content-type: application/json`，内容是你新的包名和指纹。

---

## 五、装到手机

1. 把 `app-release-signed.apk` 传到 Android 手机（WhatsApp / Google Drive / USB 都行）
2. 点开安装，允许「安装未知来源应用」

### 小米 / Redmi (MIUI / HyperOS) 特别设定

MIUI 挡得比较凶：

1. **设置 → 应用设置 → 权限管理 → 特殊应用权限 → 安装未知应用** → 选你传 APK 用的那个 App → 开启允许
2. 安装弹窗如果卡住，勾「记住我的选择」再点「仍要安装」
3. 装好后进 **设置 → 应用管理 → 御膳智控 → 省电策略 → 无限制**，不然背景会被杀

---

## 六、验证 APK 有没有真的通过验证

打开 APK：

- ✅ **全屏、没有网址列** → Digital Asset Links 验证成功
- ❌ **顶部有一条灰色网址列** → 验证失败，检查：
  1. `TWA_PACKAGES` 里的包名跟 APK 的包名一样吗
  2. 指纹是不是从**同一个** keystore 拿的
  3. `assetlinks.json` 有没有重新部署（用上面那行 curl 确认）
  4. 手机清一下 App 资料再开（Android 会快取验证结果）

---

## 七、以后怎么维护

| 你要做的事 | 要不要重打 APK |
|---|---|
| 改 ERP 程式、加功能、修 bug | ❌ 不用。重新部署网站就好 |
| 改 App 名称、图标 | ✅ 要重打 |
| 换网域 | ✅ 要重打（而且新网域也要有 assetlinks） |
| 升级 APK 版本 | ✅ 要重打，但**必须用同一个 keystore 和同一个包名** |

升级版本时记得改 `twa-manifest.json` 的 `appVersionCode`（要递增，例如 1 → 2）和 `appVersionName`。

---

## 常见错误

**`bubblewrap build` 报 JDK 版本错**
→ 装 JDK 17，或用 `bubblewrap updateConfig --jdkPath <路径>` 指到 Android Studio 内建的 JDK。

**`Failed to download` 或 SDK 找不到**
→ `bubblewrap updateConfig --androidSdkPath <你的 SDK 路径>`

**手机装不上，说「应用未安装」**
→ 多半是旧版 APK 包名相同但签名不同。先卸载旧的再装。

**APK 打开一片白**
→ 网站本身有问题。先用手机浏览器开 `https://service-5174.ai.studio` 确认正常。
