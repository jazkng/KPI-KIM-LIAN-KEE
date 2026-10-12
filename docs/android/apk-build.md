# 📱 Android APK（TWA）打包与维护

> 本文件整合自原 `ANDROID_APK_BUILD.md` 与 `ANDROID_TWA_SETUP.md`（2026-10-12）。来源对照见文末附录。
> 指令可以直接复制。

---

## 零、现状（以代码为准，2026-10-12）

| 项目 | 现状 | 来源 |
|---|---|---|
| APK 指向的网址 | `https://service-5174.ai.studio`（V1 正式部署 B） | `twa-manifest.json` |
| 主力 APK 包名 | `com.kimliankee.erp` | `server.ts` 的 `DEFAULT_TWA_PACKAGES` |
| 主力 APK 打包方式 | 代码注释记录为 **Android Studio** 打包，keystore 文件 `kimliankee-erp2.jks`，alias `kimliankee` | `server.ts` 注释 |
| 旧版 APK 包名 | `studio.ai.service_5174.twa`（之前用 PWABuilder 打包，保留让旧 APK 继续可用） | `server.ts` 注释、`public/.well-known/assetlinks.json` |
| `assetlinks.json` 的实际来源 | **由 `server.ts` 动态产生**：读取环境变量 `TWA_PACKAGES`，未设置时用 `DEFAULT_TWA_PACKAGES` | `server.ts` |
| `public/.well-known/assetlinks.json` | **不会被使用**。`server.ts` 的路由先于静态文件处理同一网址，所以修改这个文件没有效果 | `server.ts` 路由顺序 |
| `/?portal=boss` | **已实现**：直接打开「老板登入 · Owner PIN」画面 | `App.tsx`、`components/Login.tsx` |

> ⚠️ **待负责人确认**：
> - 目前手机上实际安装的是哪一支 APK（`com.kimliankee.erp` 还是旧的 `studio.ai.service_5174.twa`）；
> - `kimliankee-erp2.jks` 及其密码是否已妥善备份。
>
> 下面第三节的 Bubblewrap 步骤用的是预设 `android.keystore`。如果主力 APK 实际是用 Android Studio 和 `kimliankee-erp2.jks` 打包的，**升级时必须继续使用同一个 keystore**，不能改用 Bubblewrap 新建的 keystore（见第九节）。

---

## 一、TWA 是什么

TWA (Trusted Web Activity) = **全屏浏览器外壳**。它**不打包程式码**，只是指向线上网址。

- ✅ 以后改程式，只要重新部署网站，**APK 完全不用重打、不用重装**
- ⚠️ 网站挂了，APK 就打不开（跟浏览器一样）
- ⚠️ APK 绑死网域。`service-5174.ai.studio` 换掉的话，APK 要重打（见第十节）

---

## 二、两种入口：员工 PWA 与老板 / 主管 APK

| 终端 | 使用人群 | 启动网址 | 应用名称 | 形式 |
| :--- | :--- | :--- | :--- | :--- |
| 员工 PWA | 门市所有员工、厨师 | `https://<网域>/` | 御膳智控 ERP | 网页 PWA / 主画面捷径 |
| 老板 / 主管 APK（可选） | 老板或指定主管 | `https://<网域>/?portal=boss` | 御膳智控·主管版 | Android TWA APK |

- 网站全局 PWA Manifest（`manifest.json`）**保持为员工 PWA 的配置**（`start_url: "/"`，名称「御膳智控 ERP」）。
- 主管版的专属名称和入口 `/?portal=boss` **只在打包 APK 时设置**，绝不修改网站全局 Manifest。
- `/?portal=boss` 只是直接打开老板 PIN 登录画面，**不是权限控制**。真正的权限由登录身份决定（见 `docs/security/`）。

### 主管版 APK 参数（如需要另打一支）

| 参数 | 值 |
|---|---|
| App Name | `御膳智控·主管版` |
| Short / Launcher Name | `御膳主管` |
| Package Name | `com.kimliankee.erp.supervisor`（与主力 APK 不同，两支可以同时安装） |
| Start URL | `/?portal=boss` |
| Scope | `/` |
| Theme Color | `#FFD200` |
| Background Color | `#111111` |
| Display Mode | `standalone` |
| Icon | `/icons/icon-512.png`；Maskable：`/icons/icon-maskable-512.png` |

> 另打主管版时，要把新包名和指纹**加进** `TWA_PACKAGES`（第五节），否则打开时会出现网址列。

---

## 三、打包方式 A：Bubblewrap（命令行）

### 1. 安装

需要 **JDK 17+**（Android Studio 自带的就可以）和 **Node.js**。

```bash
npm install -g @bubblewrap/cli
```

第一次执行会问要不要自动下载 JDK 和 Android SDK。**如果 Android Studio 已经装好 SDK，选「否」然后指定路径**：

```bash
bubblewrap doctor
```

它会告诉你缺什么。SDK 路径通常在：

- Windows：`C:\Users\<你的名字>\AppData\Local\Android\Sdk`
- macOS：`~/Library/Android/sdk`

### 2. 产生 Android 专案

建一个空资料夹（**不要**放在 ERP 专案里面），进去执行：

```bash
bubblewrap init --manifest https://service-5174.ai.studio/manifest.json
```

照下面回答（主管版则改用第二节的参数）：

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
| Key store location | 直接 Enter（预设 `./android.keystore`）；**若要沿用现有 keystore，填它的路径** |
| Key name | `android`（沿用现有 keystore 时填它的 alias） |

**或者更省事**：把专案里的 `twa-manifest.json` 复制到这个空资料夹，然后执行

```bash
bubblewrap init --manifest ./twa-manifest.json
```

它会照里面预填好的值走，只要确认几个问题就好。

> 建 keystore 时会要你设**两组密码**（keystore 密码 + key 密码）。
> **⚠️ 这两组密码和 keystore 文件务必备份好。**
> 弄丢的话以后没办法覆盖升级 APK，只能换包名重来，手机也要先卸载旧版。

### 3. 打包

```bash
bubblewrap build
```

产出：

- `app-release-signed.apk` ← **这个就是要装到手机的**
- `app-release-bundle.aab` ← 上架 Google Play 用的，不上架就用不到

---

## 四、打包方式 B：PWABuilder（网页，免安装工具）

1. 打开 [PWABuilder.com](https://www.pwabuilder.com/)。
2. 输入要打包的网址：员工版用 `https://service-5174.ai.studio/`，主管版用 `https://service-5174.ai.studio/?portal=boss`。
3. 点 **Start** 检查，通过后点 **Package for Store** → **Android** → **Options**。
4. 修改选项：
   - **Package ID**：`com.kimliankee.erp`；主管版为 `com.kimliankee.erp.supervisor`
   - **App Name** / **Launcher Name**：按第二节或第三节的表
   - **Start URL**：`/`；主管版为 `/?portal=boss`
   - **Icon**：`/icons/icon-512.png` 与 `/icons/icon-maskable-512.png`
   - **Signing key**：要升级现有 APK 时，**必须上传原本的 keystore**，不要让 PWABuilder 新建
5. 点 **Generate** 下载 Zip，解压后得到 `.apk`、签名 keystore，以及 `readme.html` / `assetlinks.json`（里面有 SHA-256 指纹）。

> 旧版 `studio.ai.service_5174.twa` 就是用 PWABuilder 的预设包名打的。新打包请改用上面的包名。

---

## 五、拿到 SHA-256 指纹，更新 assetlinks

这一步不做，APK 打开时顶部会出现一条浏览器网址列。

### 1. 取得指纹

- **用 keystore 查**：

  ```bash
  keytool -list -v -keystore <你的 keystore 文件> -alias <alias>
  ```

  在输出中找 `SHA256:` 那一行，例如 `SHA256: AB:CD:EF:12:34:...:90`。

- **PWABuilder 打包的**：解压包里的 `readme.html` 或 `assetlinks.json` 里有 `SHA-256 Fingerprint`。

### 2. 设到服务端环境变量 `TWA_PACKAGES`（不用改程式、不用重新 build）

```
TWA_PACKAGES = com.kimliankee.erp:AB:CD:EF:12:34:...:90
```

多支 APK 同时有效（例如主力版 + 主管版 + 旧版），就用分号连接：

```
TWA_PACKAGES = com.kimliankee.erp:AB:...:90;com.kimliankee.erp.supervisor:12:...:EF;studio.ai.service_5174.twa:5D:...:2D
```

> ⚠️ **不要去改 `public/.well-known/assetlinks.json`**（原 `ANDROID_TWA_SETUP.md` 的做法）。这个文件不会被服务端送出（见第零节），改了也不会生效。
> ⚠️ `TWA_PACKAGES` 一旦设置，就会**完全取代**代码里的预设清单，所以要把所有仍在使用的 APK 都写进去。
> ⚠️ 在 V1 的 AI Studio 部署上设置或修改环境变量，属于**修改 V1 生产**，需要负责人批准。

### 3. 重新部署后验证

```bash
curl -i https://service-5174.ai.studio/.well-known/assetlinks.json
```

**必须**看到：
- `HTTP/2 200`；
- `content-type: application/json`；
- 内容是正确的 JSON，而**不是** `index.html`；
- 里面有你的包名和指纹。

---

## 六、装到手机

1. 把 `.apk` 传到 Android 手机（WhatsApp / Google Drive / USB 都行）。
2. 点开安装，允许「安装未知来源应用」。

### 小米 / Redmi（MIUI / HyperOS）特别设定

MIUI 挡得比较严：

1. **设置 → 应用设置 → 权限管理 → 特殊应用权限 → 安装未知应用** → 选你传 APK 用的那个 App（例如 Chrome 或文件管理）→ 开启「允许来自此来源的应用」。
2. 安装弹窗如果卡住，勾选「记住我的选择」再点「仍要安装」。
3. 仍然被挡时，可以开启开发者模式：**设置 → 更多设置 → 开发者选项** → 开启 **USB 安装** 及 **USB 调试（安全设置）**。
4. 装好后进 **设置 → 应用管理 → 御膳智控 → 省电策略 → 无限制**，不然背景会被系统关掉。

---

## 七、验证 APK 有没有通过验证

打开 APK：

- ✅ **全屏、没有网址列** → Digital Asset Links 验证成功
- ❌ **顶部有一条灰色网址列** → 验证失败，检查：
  1. `TWA_PACKAGES` 里的包名跟 APK 的包名一样吗
  2. 指纹是不是从**同一个** keystore 拿的
  3. `assetlinks.json` 有没有重新部署（用第五节的 curl 确认）
  4. 在手机上清除这个 App 的数据再开（Android 会缓存验证结果）

---

## 八、常见错误

**`bubblewrap build` 报 JDK 版本错**
→ 装 JDK 17，或用 `bubblewrap updateConfig --jdkPath <路径>` 指到 Android Studio 内建的 JDK。

**`Failed to download` 或 SDK 找不到**
→ `bubblewrap updateConfig --androidSdkPath <你的 SDK 路径>`

**手机装不上，说「应用未安装」**
→ 多半是旧版 APK 包名相同但签名不同。先卸载旧的再装（或改用原本的 keystore 重打）。

**APK 打开一片白**
→ 网站本身有问题。先用手机浏览器打开同一个网址确认正常。

---

## 九、维护与安全原则

| 要做的事 | 要不要重打 APK |
|---|---|
| 改 ERP 程式、加功能、修 bug | ❌ 不用。重新部署网站就好，APK 打开就是最新版 |
| 改 App 名称、图标 | ✅ 要重打 |
| 换网域 | ✅ 要重打（见第十节） |
| 升级 APK 版本 | ✅ 要重打，但**必须用同一个 keystore 和同一个包名** |

- 升级版本时，记得改 `twa-manifest.json` 的 `appVersionCode`（要递增，例如 1 → 2）和 `appVersionName`。
- **keystore 文件与密码务必备份**（放在 Git 以外的安全位置），而且**绝不提交到 GitHub**。`.gitignore` 已排除 `*.keystore` 和 `*.jks`；仓库历史中也从未提交过任何 keystore。
- 本 APK 只供内部使用，**不需要上架 Google Play**，也不需要注册 Google Play 开发者帐号。

---

## 十、将来换网域（V2 正式上线到 `erp.kimliankee.app` 时）

1. 新网域必须同样能送出正确的 `/.well-known/assetlinks.json`（第五节的检查全部通过）。
2. 用**同一个包名、同一个 keystore** 重新打包，把 Domain、Start URL、图标网址都改为新网域。
3. 新旧网域并行期间，旧 APK 继续指向旧网址；确认新 APK 正常后，再请使用者更新。
4. 换网域属于正式切换的一部分，需负责人批准（见 `docs/KLK_ERP_V2_RULES.md` 第 6 条）。

---

## 附录 · 来源对照（确认没有遗漏）

### 原 `ANDROID_APK_BUILD.md`

| 原章节 | 去向 |
|---|---|
| 先搞懂 TWA 是什么 | 第一节 |
| 事前检查 | 改为第五节第 3 步的验证项目（原表中的「已确认 ✅」是当时的状态，不再作为现状记载） |
| 一、安装 Bubblewrap | 第三节第 1 步 |
| 二、产生 Android 专案 | 第三节第 2 步（补充：沿用现有 keystore 的填法） |
| 三、打包 APK | 第三节第 3 步 |
| 四、SHA-256 指纹与 `TWA_PACKAGES` | 第五节 |
| 五、装到手机（含小米设定） | 第六节 |
| 六、验证 APK | 第七节 |
| 七、以后怎么维护 | 第九节 |
| 常见错误 | 第八节 |

### 原 `ANDROID_TWA_SETUP.md`

| 原章节 | 去向 | 说明 |
|---|---|---|
| 一、双端访问架构 | 第二节 | 保留；补充 `/?portal=boss` 已实现，但不是权限控制 |
| 「不覆盖全局 Manifest」提醒 | 第二节 | 保留 |
| 二、TWA 基本配置参数（主管版） | 第二节「主管版 APK 参数」 | 保留；占位的「正式 Cloud Run 域名」改为实际网域 |
| 三、PWABuilder 打包 | 第四节 | 保留；补充「升级时必须上传原 keystore」 |
| 四-1、取得指纹（PWABuilder / keytool） | 第五节第 1 步 | 保留 |
| 四-2、修改 `public/.well-known/assetlinks.json` | 第五节警告 | **已过时，不保留做法**：该文件不会被送出，改用 `TWA_PACKAGES` |
| 四-3、重新打包并部署 | 第五节第 2–3 步 | 改为设置环境变量后重新部署 |
| 四-4、curl 验证（200、JSON、不是 index.html） | 第五节第 3 步 | 保留 |
| 五、通用安装 + 小米设定（含开发者选项） | 第六节 | 保留，开发者选项为第 3 点 |
| 六-1、更新网页不需重装 | 第九节表格 | 保留 |
| 六-2、包名与 keystore 必须一致、备份 keystore | 第九节 | 保留 |
| 六-3、不需上架 Google Play / 不需开发者帐号 | 第九节 | 保留 |
