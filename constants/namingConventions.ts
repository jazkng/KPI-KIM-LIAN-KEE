/**
 * 界面文案命名规范 (Naming conventions)
 * ====================================================================
 * 这份文件不导出运行时逻辑，只作为写新功能时的对照表。
 * 加新界面文字之前先扫一眼，别再引入同义词分叉。
 */

/**
 * 一、模块名称的唯一叫法
 *
 * 同一个模块在老板端、管理端、员工端必须用同一个名字。
 * 曾经出现过老板端叫「排队叫号」、管理端叫「排队取号」的情况，
 * 员工换个入口就看到不同名字，务必避免。
 */
export const MODULE_NAMES: Readonly<Record<string, string>> = {
    QUEUE: '排队叫号',
    SETTLEMENT: '每日结算',
    KITCHEN_ALERT: '厨房通知',
    LOGBOOK: '运营日志',
    LOGBOOK_VIEW: '日志查询',
    SOP_INSPECT: 'SOP 稽查',
    INVENTORY_CHECK: '库存盘点',
    INVENTORY_VIEW: '库存总览',
    PROCUREMENT: '采购订货',
    SUPPLIER_CONTACTS: '供应商',
    MENU_MANAGEMENT: '智能菜谱',
    PRICE_MONITOR: '成本监控',
    AP: '应付账款',
    SELF_INVOICE: '自开凭单',
    BILLS: '经常性支出',
    TREASURY: '资金管理',
    REPORTS: '财务报表',
    HR: '人事管理',
    ATTENDANCE: '考勤管理',
    ROSTER: '排班管理',
    ASSESSMENT: '技能评估',
    ORG: '组织结构',
    WARRANTY: '保修记录',
    TRANSLATION: '翻译管理',
};

/**
 * 二、同义词收敛
 *
 * 左边是全站统一采用的词，右边是不要再用的写法。
 */
export const PREFERRED_TERMS: Readonly<Record<string, readonly string[]>> = {
    库存: ['存货', '货品'],
    盘点: ['清点', '点数', '查数'],
    供应商: ['厂商', '供货商'],
    员工: ['职员', '同事', '伙计'],
    薪资: ['工资', '薪水', '薪酬'],
    结算: ['结账', '收档'],
    采购: ['进货', '入货'],
    删除: ['移除', '去除'],
    保存: ['存档'],
    编辑: ['更改'],
};

/**
 * 三、中英混排格式
 *
 *   界面（按钮、标签、导航）  →  中文 (English)     例：开班现金 (Opening Float)
 *   打印 / PDF 文档          →  English (中文)     例：EARNINGS (收入)
 *
 * 理由：界面给自己人看，中文在前读得快；凭单、薪资单、结算单要给外部
 * （银行、审计、供应商）看，英文在前更正式。
 *
 * 分隔符只用圆括号。不要再用 `·`、`•`、`/` 来接中英文——
 * 那三种以前各用了几处，看着像三套系统拼起来的。
 *
 * 两种例外，括号里的内容不是翻译时不要套用上面的顺序规则：
 *   - 品牌名：GrabFood (精确记账)  —— 品牌必须在前
 *   - 补充说明：Company Cost (含微调/罚扣)  —— 括号里是注释不是译名
 */
export const BILINGUAL_FORMAT = {
    ui: '中文 (English)',
    document: 'English (中文)',
} as const;
