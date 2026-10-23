# V2 假日日历（天气与空气自动化已取消）

负责人最新决定：天气及空气质量全部人手控制，仅保留全年假日日历。OpenWeather注册、密钥、收费/免费预报接口、15:00定时任务和16:30–21:00预报计算全部撤除。本次没有创建过云任务、订阅或写正式库，因此无需停用真实服务。

## 保留范围
按门店所属州属，导入经核对的全年日历，经营页面按日期匹配节日。仅GET读取本地已审核年历文件；每个进程每年缓存一份，不请求天气或空气服务，不写Firestore，不调用AI，不使用Cloud Scheduler。
缺日历显示「全年日历待导入」，不能当普通营业日。临时新增假期需人工修订对应全年文件并重启服务重新载入。官方来源：https://www.kabinet.gov.my/hari-kelepasan-am/ 。当前没有臆造完整年历。

## 资料格式
文件名 `{region}-{year}.json`（例如MY-14-2026.json，辖区应核定）。
结构：year、region、sourceUrl(https)、reviewedAt(YYYY-MM-DD)、days[{date,name,kind:public|school|festival}]。必须完整核对官方全年表及补假，不能把旧版不完整常量当完整年历。

## 配置与兼容
服务端HOLIDAY_CALENDAR_ENABLED=true、HOLIDAY_REGION、HOLIDAY_CALENDAR_DIR；前端构建VITE_HOLIDAY_CALENDAR_ENABLED=true。预览部署工作流接入同名变量，默认false；本次没有修改远端配置。
仅新增预览门禁之后的GET /api/holidays/:date，没有新增门禁例外或写入接口，也不需要Firebase Admin。无定时任务、外部账号/API密钥。
每日结算保持原有手填天气界面和保存方式；不改V1字段、金额、Rules、Auth、历史记录或部署。空气质量没有自动获取，现有版本没有新增空气质量输入或保存字段。
