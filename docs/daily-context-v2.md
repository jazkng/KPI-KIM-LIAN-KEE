# V2 营业时段预报与全年节日（待启用）

## 确认的规则
- 固定门店位置，无需员工定位。每天马来西亚时间15:00由Cloud Scheduler自动调用；App完全关闭也运行。
- 预测范围16:30–21:00，同一马来西亚日历日。每日一次天气、一次空气质量请求，无AI模型费用。读取页面不会触发同步。
- 年历经核对后一次导入全年，平日从服务器缓存匹配；未知年历显示待同步，不能当无节日。
- 这是15:00取得的未来模型预报，不是结算实测，不把预报用于改写员工旧weather。

## 实现与 V1 兼容
server/context、shared/dailyContext、DailyContextBadge；经营重点、经营日报、每日结算三处共用组件。每日结算开启后，原手填weather保留为折叠的现场补充，不自动写入。从已合并#64的develop-v2 7e756f7建立隔离分支。
新集合 v2DailyContext/{YYYY-MM-DD} 只保存非财务快照和当日claim锁；v2ContextCalendars/{region-year}缓存全年日历。服务端Admin写入，客户端经预览门禁下的GET读取，不新增客户端Rules授权。
不修改SettlementRecord、日结、薪资、库存、订单或原weather。原V1不设置开关，不初始化Admin、不请求外部来源、不增加写入。
GET日期校验；同步POST必须验证Google OIDC受众及指定Scheduler服务账号。仅该POST可绕过预览密码，功能关闭时连此例外也关闭。不得放开其他路径。

## 时间与去重
Cron `0 15 * * *`，timezone Asia/Kuala_Lumpur。Cloud Run按需唤醒，不靠网页定时器或setInterval。
允许15:00至16:30之前的延迟投递；其他时间不抓取。服务端以当前马来西亚日期作为键，客户端不能指定过去日期重算。
同日事务claim只允许一个执行者；每源最多一次请求。外部失败保存缺失状态，不默默频繁重试。若进程在claim后崩溃，将保留未完成状态；需管理员查日志后另行授权恢复，当前没有重试按钮。
天气返回3小时间隔，适配器先归一化到16至21点；16:30温度插值，17点归一化降水只取一半，加18–21点降水，这是均匀时段分配的模型近似。空气质量按16:30边界插值后时长加权均值，不伪称马来西亚API或现场烟霾。

## 免费来源（负责人选择，2026-10-19核查）
默认改用OpenWeather Free，两项均为免费方案包含的经典接口：
- 天气：`https://api.openweathermap.org/data/2.5/forecast`，5天、3小时间隔，metric单位。
- 空气：`https://api.openweathermap.org/data/2.5/air_pollution/forecast`，4天、每小时间隔。
- 不调用One Call、不调用收费商业域名，也不自动切换到收费服务。配置只接受CONTEXT_OPENWEATHER_KEY，旧收费来源密钥不会回退使用。
- 免费额度官方列示60次/分钟、100万次/月；每天2次约每月60–62次。数据API免费不等于既有云运行、Firestore与Scheduler费用为0。
- 官方详细价目允许商业与内部业务系统使用ODbL数据，要求在页面可见署名；已在组件折叠说明之外保留「Weather data © OpenWeather」链接。不只把署名藏在说明或文件内。此功能为内部报表快照，不对外发布天气数据库。
- 免费方案需要一次注册取得API密钥；不需要员工每日操作。尚未注册账户、同意条款或启用任何订阅。只选择Free Weather API access；不选择按次计费One Call。
来源：https://openweathermap.org/price （Free Weather API access段）、https://openweathermap.org/full-price （License段）、https://openweathermap.org/api/forecast5 、https://openweathermap.org/api/air-pollution 。

## 预报分辨率
天气原始3小时点：按UTC时间戳换算马来西亚时间，再对16至21点温度插值；若15点抓取时首个未来点为17点，16:30温度取17点近似（不虚构已过去的14点预报）；3小时累计降水均匀分配到小时，最后按16:30边界取半小时。不能视为精确到半小时的实际降雨。
空气质量原始小时数据，使用PM2.5/PM10浓度作时长加权摘要，不把OpenWeather的1–5 AQI当马来西亚环境局API，也不把模型预报称作现场烟霾。

## 启用配置（本次没有修改云端）
服务端：DAILY_CONTEXT_ENABLED=true、CONTEXT_LATITUDE、CONTEXT_LONGITUDE、CONTEXT_REGION（如MY-14，按门店实际辖区核定）、CONTEXT_OPENWEATHER_KEY（Secret Manager）、CONTEXT_SYNC_AUDIENCE=https://dev.kimliankee.app/api/context/sync、CONTEXT_SCHEDULER_SA、CONTEXT_CALENDAR_DIR。
前端构建：VITE_DAILY_CONTEXT_ENABLED=true。预览部署工作流已接入同名GitHub环境变量，默认false；本次没有修改远端变量。
年历文件名 `{region}-{year}.json`，结构为year、region、sourceUrl、reviewedAt(YYYY-MM-DD)、days[{date,name,kind:public|school|festival}]。必须是已核对官方原表及适用补假的完整全年文件；不自动猜补假，不把固定旧常量当完整年历。文件需在容器镜像中或只读挂载提供，存储持久化后同年不重复导入。不能无声覆盖已审阅年历；临时假日另行版本更新。
官方来源：https://www.kabinet.gov.my/hari-kelepasan-am/ 。本次不把尚未核对完整性的数据填入正式库。

## 上线门槛与回滚
完成并验证坐标/辖区、已许可数据源、完整全年日历、Cloud Scheduler OIDC服务账号权限后，执行scripts/context/create-scheduler.ps1；该脚本会创建云任务，当前没有执行。配置Cloud Run/Secret/服务账号之前需按仓库规范审批；本次只准备代码。
须测试门禁拒绝未认证同步、重复投递不重复请求、关闭App仍由Scheduler生成一条当天记录。关闭DAILY_CONTEXT_ENABLED并暂停Scheduler即可回滚，不需要回写历史日结。

## 本次验证
- bun install --frozen-lockfile（Bun 1.3.3）：通过，锁文件未更动。
- npm run lint：通过。
- npm test：新增时间范围、缺值、去重、OIDC与禁用保护测试；全量结果见交付说明。
- npm run test:rules：demo-klk-erp Emulator，9文件30项通过；新增6并发claim仅1次成功。
- npm run build：通过；本机真实React组件以模拟响应验收，无外部请求。
- 未购买数据服务、未更改Cloud Run配置、未创建Cloud Scheduler任务、未写正式库。

## 免费适配补充验证
2026-10-19：免费接口适配及15点首个预报为17点的场景已覆盖；44文件398项单元测试通过，类型检查及构建通过。原有Emulator 10文件32项先前已通过，适配器不改写入逻辑。
