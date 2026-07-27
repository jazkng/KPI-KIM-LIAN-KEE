const fs = require('fs');

// Comprehensive dictionary for translating Chinese content to English
const TRANSLATION_MAP = {
  // Employee Rules
  '🕒 考勤铁律：楼面是下午 3:30，厨房是下午 3:00 准时打卡开铺。迟到超过 15 分钟扣除一小时的薪资，并且对本身的 KPI 有影响。':
    '🕒 Attendance Rule: Floor staff clock in at 3:30 PM, Kitchen staff clock in at 3:00 PM. Lateness exceeding 15 mins incurs 1-hr salary deduction & affects KPI.',
  '📱 手机管制：手机必须静音和严禁边工作边玩手机。':
    '📱 Mobile Rule: Phones must be muted. Playing with phones during working hours is strictly prohibited.',
  '🧼 仪容仪表：必须穿戴整齐制服、围裙、包鞋。厨房人员必须戴帽子，长发需盘起。':
    '🧼 Grooming: Wear neat uniform, apron & closed shoes. Kitchen staff must wear caps; long hair tied up.',
  '🍜 员工用餐：仅限 16:30前 或 21:30-22:00 轮流用餐。':
    '🍜 Staff Meals: Allowed in turns only before 4:30 PM or between 9:30 PM - 10:00 PM.',
  '🚬 吸烟规定：仅限后巷指定区域，严禁穿着围裙吸烟，回岗必须洗手漱口。':
    '🚬 Smoking: Designated alley area only. Do not smoke wearing aprons. Wash hands & rinse mouth before returning.',
  '🗣️ 待客之道：见到顾客必须点头微笑说"欢迎光临"，离开说"谢谢光临"流通服务。':
    '🗣️ Courtesy: Greet customers with a smile saying "Welcome", and say "Thank you for coming" when leaving.',
  '🗣️ 待客之道：见到顾客必须点头微笑说"欢迎光临"，离开说"谢谢光临"。':
    '🗣️ Courtesy: Greet customers with a smile saying "Welcome", and say "Thank you for coming" when leaving.',
  '🚫 安全红线：厨房地面保持干燥防滑，端热汤/铁板必须使用托盘或隔热布。':
    '🚫 Safety Red Line: Keep kitchen floor dry. Always use trays or thermal cloth for hot soups and hot plates.',
  '🌛 打烊纪律：01:30 Last Call 后不再接单，02:00 前完成所有清洁工作并经主管检查后方可离店。':
    '🌛 Closing Discipline: No orders after 1:30 AM Last Call. Finish cleaning by 2:00 AM; leave after supervisor check.',

  // Role descriptions, core values, redlines
  '厨房最高指挥官。负责菜品研发、成本控制与团队建设。':
    'Kitchen Leader. Responsible for dish R&D, cost control, and team building.',
  '出品灵魂与厨房纪律': 'Culinary Soul & Kitchen Discipline',
  '严禁使用变质食材 / 严禁私自更改秘制酱料配方': 'Forbidden: Expired ingredients / Altering secret sauce recipes without approval',
  '完全掌握核心酱料配方，能独立解决厨房突发状况。': 'Master core sauce recipes and handle kitchen emergencies independently.',
  '培养出至少一名合格的头手，厨房零重大投诉，Food Cost 稳定。': 'Train at least one qualified Head Chef; zero major complaints; stable food cost.',
  '门店的大脑。全权负责楼面运营、业绩达标与团队稳定。': 'Store Brain. Responsible for floor operations, sales targets, and team stability.',
  '高效履职 · 严守纪律 · 团队榜样': 'Efficient Leadership · Strict Discipline · Team Role Model',
  '严禁作假账 / 严禁隐瞒重大事故 / 严禁私自放人早退': 'Forbidden: Falsifying accounts / Concealing major incidents / Allowing unauthorized early leaves',
  '能够处理 90% 的日常客诉与突发状况。': 'Handle 90% of daily customer complaints and operational emergencies.',
  '独立完成月度采购与成本控制，设备维护及时无影响营业。': 'Manage monthly procurement & cost control independently; timely equipment maintenance without downtime.',
  '餐厅的枢纽与门面。负责收银、外卖平台对接与电话接单。': 'Store Hub. Responsible for cashiering, delivery platforms, and phone orders.',
  '账目精准 · 即使忙碌也要保持微笑': 'Accurate Billing · Maintain Warm Smiles Even During Peak Hours',
  '严禁私吞公款 / 严禁私自给予折扣 / 钱箱必须随时上锁': 'Forbidden: Misappropriating funds / Giving unauthorized discounts / Leaving cash drawer unlocked',
  '熟练操作 POS 系统，外卖接单无漏单。': 'Master POS system operation; zero missed orders on delivery platforms.',
  '能同时处理现场结账和电话订单，账目每月差异少于 RM50。': 'Handle in-store checkout and phone orders simultaneously; monthly cash variance under RM50.',
  '推销专家。负责为顾客点餐，推销招牌菜与高毛利饮品。': 'Sales Specialist. Responsible for taking orders, promoting signature dishes and high-margin drinks.',
  '精准下单 · 主动推销 · 掌控节奏': 'Accurate Orders · Proactive Upselling · Control Dining Rhythm',
  '严禁漏单不报 / 严禁对顾客不耐烦': 'Forbidden: Concealing missed orders / Showing impatience to guests',
  '背熟菜单价格与配料，手写单字迹工整。': 'Memorize menu prices & ingredients; neat handwritten order slips.',
  '善于推销高价菜品 (如: 生虾面)，客单价提升 10%。': 'Excel at upselling premium dishes (e.g., Sang Har Mee); boost average ticket size by 10%.',
  '服务基石。负责传菜、清理桌面与响应顾客需求。': 'Service Foundation. Responsible for serving dishes, clearing tables, and responding to guests.',
  '眼观六路 · 手脚麻利 · 安全第一': 'Sharp Observation · Swift Execution · Safety First',
  '严禁在店内奔跑 / 严禁跨过小孩头顶上菜': 'Forbidden: Running in dining area / Serving dishes over children’s heads',
  '熟悉桌号分布，端托盘稳当不洒漏。': 'Familiar with table layouts; carry trays steadily without spills.',
  '眼里有活，无需指令主动加水、收空盘。': 'Proactively refill tea and clear empty plates without waiting for instructions.',
  '环境卫士。维护店内整洁与卫生。': 'Hygiene Guardian. Maintain store cleanliness and sanitary standards.',
  '无死角清洁': 'Thorough Cleaning Without Dead Angles',
  '严禁地面积水不处理 (防滑倒)': 'Forbidden: Leaving wet floors unattended (slip hazard prevention)',
  '勤快，厕所无异味，地面无垃圾。': 'Diligent; keep restrooms odor-free and floors free of litter.',
  '主动发现卫生死角，维护店面形象。': 'Proactively identify hidden dirty areas and safeguard store reputation.',
  '灵活支援。当日结算，无福利，仅享制服。': 'Flexible Support. Daily settlement, uniform provided.',
  '机动性与补位': 'Mobility & Station Support',
  '严禁无故缺席 (No Show)': 'Forbidden: Unexcused absences (No Show)',
  'Hourly Rate: RM 9 - RM 12 depending on skill.': 'Hourly Rate: RM 9 - RM 12 depending on skill.',
  'Reliable and fast.': 'Reliable and fast.',
  '炉台主宰。负责第一炒锅，掌控每一盘面的火候。': 'Wok Master. Responsible for Primary Wok #1, controlling heat and flavor for every dish.',
  '锅气十足 · 速度激情 · 品质如一': 'Rich Wok Hei · Speed & Passion · Consistent Quality',
  '严禁出品夹生或烧焦严重 / 严禁在炉台吸烟': 'Forbidden: Serving undercooked or burnt dishes / Smoking at cooking station',
  '炒出的福建面色泽黝黑发亮，锅气浓郁。': 'Cook Hokkien Mee with deep glossy color and rich aromatic wok hei.',
  '高峰期出餐稳定，出餐速度快且质量稳定。': 'Maintain fast and consistent dish output during peak rush hours.',
  '头手的左膀右臂。负责二锅、煮汤面及协助头手。': 'Head Chef Right Hand. Responsible for Wok #2, noodle soups, and assisting Head Chef.',
  '配合默契 · 补位及时 · 学习进取': 'Seamless Teamwork · Timely Station Support · Continuous Learning',
  '严禁擅自离岗导致炉台无人': 'Forbidden: Leaving wok station unattended without authorization',
  '熟悉备料流程，配合头手出餐。': 'Familiar with prep workflows; coordinate smoothly with Head Chef during service.',
  '能够独立负责部分炒锅工作。': 'Capable of independently handling frying wok stations when required.',
  '厨房的刀功担当。负责食材切割、腌制与生鲜保鲜。': 'Prep & Knife Expert. Responsible for cutting, marinating, and raw ingredient fresh storage.',
  '刀功精湛 · 刀刀精准 · 标准切配': 'Precision Knife Work · Accurate Portions · Standardized Cutting',
  '严禁生熟交叉污染 / 严禁食材不盖保鲜膜': 'Forbidden: Cross-contamination between raw & cooked food / Storing uncovered food',
  '切配速度快，损耗控制在 5% 以内。': 'Fast prep speed with ingredient waste controlled within 5%.',
  '腌制肉类口感稳定，能精准预估每日用量。': 'Consistent meat marination flavor; accurately estimate daily prep quantities.',
  '厨房的机动部队。负责备料、出菜口传递与卫生。': 'Kitchen Runner. Responsible for prep, food pass organization, and kitchen cleanliness.',
  '手脚麻利 · 出菜无误 · 保持干爽': 'Swift Execution · Zero Dish Delivery Errors · Keep Workstations Dry',
  '严禁上错菜 / 严禁出菜台杂乱': 'Forbidden: Delivering wrong dishes / Messy pass station',
  '出菜准确率 100%，无拿错桌号。': '100% dish delivery accuracy with zero wrong table assignments.',
  '能预判厨房需求，提前补满酱料与打包盒。': 'Anticipate kitchen needs; replenish sauces and takeaway boxes in advance.',
  '饮品与甜品专家。负责煲凉茶、备冰块与冲泡饮料。': 'Drinks & Dessert Specialist. Responsible for herbal tea, ice preparation, and beverages.',
  '配方精准 · 出饮迅速 · 冰凉爽快': 'Accurate Drink Formulas · Rapid Preparation · Refreshingly Cold',
  '严禁使用变质水果 / 严禁偷工减料少放糖或冰': 'Forbidden: Using spoiled fruit / Skimping on ingredients or ice',
  '煲出的凉茶味道正宗，出饮速度少于 2 分钟。': 'Boil authentic herbal tea; serve beverages in under 2 minutes.',
  '能根据天气调整备冰量，水吧零积水。': 'Adjust ice prep based on weather; keep beverage bar completely dry.'
};

console.log('Translation map initialized:', Object.keys(TRANSLATION_MAP).length);
