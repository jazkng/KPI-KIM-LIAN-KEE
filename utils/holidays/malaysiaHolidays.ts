/**
 * 🇲🇾 马来西亚公共假日（吉隆坡 / 联邦直辖区适用）
 *
 * 每日结算、排班共用这一份。只收公共假日（含联邦直辖区日、补假），不收其他州属的假日。
 *
 * 维护方式：每年政府公布下一年的宪报假日后，在下面的表加上那一年。
 * - 回教节日（开斋节、哈芝节、回历新年、先知诞辰、可兰经降世日）要看月亮，
 *   日期可能前后差一天，政府公布前标 `tentative: true`，画面上会显示「预计」。
 * - 某一年还没加进来时，画面不会显示假日（不会猜）。
 */

export interface MalaysiaHoliday {
  /** YYYY-MM-DD */
  date: string;
  /** 中文名称 */
  name: string;
  /** 英文 / 马来文名称 */
  en: string;
  /** 一两句说明这是什么假日 */
  about: string;
  /** true = 日期未经宪报确认（看月亮的节日），画面显示「预计」 */
  tentative?: boolean;
  /** true = 补假（正日落在周日，隔天放） */
  replacement?: boolean;
}

const ABOUT = {
  NEW_YEAR: '公历新年第一天，全国公共假日。',
  THAIPUSAM: '大宝森节：兴都教节日，信徒到黑风洞等庙宇还愿、背负卡瓦第游行，市区交通会比较拥挤。',
  FT_DAY: '联邦直辖区日：纪念 1974 年吉隆坡成为联邦直辖区，只有吉隆坡、布城、纳闽放假。',
  CNY: '农历新年：华人最重要的节日，家庭团聚、拜年。很多店休息，人流和外卖习惯都会变。',
  NUZUL: '可兰经降世日：纪念可兰经首次降示，在斋戒月第 17 天，吉隆坡等州属放假。',
  AIDILFITRI: '开斋节（Hari Raya Aidilfitri）：斋戒月结束，回教徒最重要的节日，很多人回乡，市区人流减少。',
  LABOUR: '劳动节：全国公共假日。',
  HAJI: '哈芝节（Hari Raya Haji / 宰牲节）：纪念朝圣，回教徒宰牲分肉。',
  WESAK: '卫塞节：佛教节日，纪念佛陀诞生、成道、涅槃，很多人吃素、到佛寺参拜。',
  AGONG: '最高元首诞辰：庆祝国家元首（Yang di-Pertuan Agong）官方生日，全国公共假日。',
  MUHARRAM: '回历新年（Awal Muharram）：回历新一年的第一天。',
  MAULID: '先知穆罕默德诞辰（Maulidur Rasul）：回教节日，全国公共假日。',
  MERDEKA: '国庆日：纪念 1957 年 8 月 31 日马来亚独立，市中心常有庆典和封路。',
  MALAYSIA_DAY: '马来西亚日：纪念 1963 年 9 月 16 日马来西亚成立（沙巴、砂拉越加入）。',
  DEEPAVALI: '屠妖节（Deepavali / 排灯节）：兴都教的光明节，象征光明战胜黑暗。',
  CHRISTMAS: '圣诞节：基督教节日，全国公共假日。',
  REPLACEMENT: '正日落在星期日，隔天补假，同样是公共假日。',
};

export const MALAYSIA_HOLIDAYS: MalaysiaHoliday[] = [
  // 2026 corrections: kabinet.gov.my/storage/2026/03/PUB-111_2026.pdf; JTKSM 2026-05 Wesak/Agong notice.
  // ── 2026 ──
  { date: '2026-01-01', name: '元旦', en: "New Year's Day", about: ABOUT.NEW_YEAR },
  { date: '2026-02-01', name: '大宝森节 · 联邦直辖区日', en: 'Thaipusam · Federal Territory Day', about: `${ABOUT.THAIPUSAM}同一天也是${ABOUT.FT_DAY}` },
  { date: '2026-02-02', name: '大宝森节 / 直辖区日补假', en: 'Thaipusam / FT Day (Replacement)', about: ABOUT.REPLACEMENT, replacement: true },
  { date: '2026-02-17', name: '农历新年', en: 'Chinese New Year', about: ABOUT.CNY },
  { date: '2026-02-18', name: '农历新年（第二天）', en: 'Chinese New Year (Day 2)', about: ABOUT.CNY },
  { date: '2026-03-07', name: '可兰经降世日', en: 'Nuzul Al-Quran', about: ABOUT.NUZUL },
  { date: '2026-03-20', name: '开斋节额外假日', en: 'Additional Hari Raya Holiday', about: '依 P.U. (B) 111/2026：开斋节正日为3月21日时，3月20日列为额外公共假日。' },
  { date: '2026-03-21', name: '开斋节', en: 'Hari Raya Aidilfitri', about: ABOUT.AIDILFITRI },
  { date: '2026-03-22', name: '开斋节（第二天）', en: 'Hari Raya Aidilfitri (Day 2)', about: ABOUT.AIDILFITRI },
  { date: '2026-03-23', name: '开斋节补假', en: 'Hari Raya Aidilfitri (Replacement)', about: ABOUT.REPLACEMENT, replacement: true },
  { date: '2026-05-01', name: '劳动节', en: 'Labour Day', about: ABOUT.LABOUR },
  { date: '2026-05-27', name: '哈芝节', en: 'Hari Raya Haji', about: ABOUT.HAJI },
  { date: '2026-05-31', name: '卫塞节', en: 'Wesak Day', about: ABOUT.WESAK },
  { date: '2026-06-01', name: '最高元首诞辰', en: "Agong's Birthday", about: ABOUT.AGONG },
  { date: '2026-06-02', name: '卫塞节补假', en: 'Wesak (Replacement)', about: '卫塞节为5月31日周日，6月1日是元首诞辰；补假参考6月2日，个人适用依休息日与门店假日安排。', replacement: true },
  { date: '2026-06-17', name: '回历新年', en: 'Awal Muharram', about: ABOUT.MUHARRAM },
  { date: '2026-08-25', name: '先知诞辰', en: 'Maulidur Rasul', about: ABOUT.MAULID },
  { date: '2026-08-31', name: '国庆日', en: 'Merdeka Day', about: ABOUT.MERDEKA },
  { date: '2026-09-16', name: '马来西亚日', en: 'Malaysia Day', about: ABOUT.MALAYSIA_DAY },
  { date: '2026-11-08', name: '屠妖节', en: 'Deepavali', about: ABOUT.DEEPAVALI },
  { date: '2026-11-09', name: '屠妖节补假', en: 'Deepavali (Replacement)', about: ABOUT.REPLACEMENT, replacement: true },
  { date: '2026-12-25', name: '圣诞节', en: 'Christmas Day', about: ABOUT.CHRISTMAS },

  // ── 2027（宪报公布前，看月亮的节日标「预计」）──
  { date: '2027-01-01', name: '元旦', en: "New Year's Day", about: ABOUT.NEW_YEAR },
  { date: '2027-01-22', name: '大宝森节', en: 'Thaipusam', about: ABOUT.THAIPUSAM, tentative: true },
  { date: '2027-02-01', name: '联邦直辖区日', en: 'Federal Territory Day', about: ABOUT.FT_DAY },
  { date: '2027-02-06', name: '农历新年', en: 'Chinese New Year', about: ABOUT.CNY },
  { date: '2027-02-07', name: '农历新年（第二天）', en: 'Chinese New Year (Day 2)', about: ABOUT.CNY },
  { date: '2027-02-08', name: '农历新年补假', en: 'Chinese New Year (Replacement)', about: ABOUT.REPLACEMENT, replacement: true, tentative: true },
  { date: '2027-02-24', name: '可兰经降世日', en: 'Nuzul Al-Quran', about: ABOUT.NUZUL, tentative: true },
  { date: '2027-03-10', name: '开斋节', en: 'Hari Raya Aidilfitri', about: ABOUT.AIDILFITRI, tentative: true },
  { date: '2027-03-11', name: '开斋节（第二天）', en: 'Hari Raya Aidilfitri (Day 2)', about: ABOUT.AIDILFITRI, tentative: true },
  { date: '2027-05-01', name: '劳动节', en: 'Labour Day', about: ABOUT.LABOUR },
  { date: '2027-05-17', name: '哈芝节', en: 'Hari Raya Haji', about: ABOUT.HAJI, tentative: true },
  { date: '2027-05-20', name: '卫塞节', en: 'Wesak Day', about: ABOUT.WESAK, tentative: true },
  { date: '2027-06-06', name: '回历新年', en: 'Awal Muharram', about: ABOUT.MUHARRAM, tentative: true },
  { date: '2027-06-07', name: '最高元首诞辰', en: "Agong's Birthday", about: ABOUT.AGONG },
  { date: '2027-08-15', name: '先知诞辰', en: 'Maulidur Rasul', about: ABOUT.MAULID, tentative: true },
  { date: '2027-08-31', name: '国庆日', en: 'Merdeka Day', about: ABOUT.MERDEKA },
  { date: '2027-09-16', name: '马来西亚日', en: 'Malaysia Day', about: ABOUT.MALAYSIA_DAY },
  { date: '2027-10-28', name: '屠妖节', en: 'Deepavali', about: ABOUT.DEEPAVALI, tentative: true },
  { date: '2027-12-25', name: '圣诞节', en: 'Christmas Day', about: ABOUT.CHRISTMAS },
];

const BY_DATE = new Map(MALAYSIA_HOLIDAYS.map(h => [h.date, h]));

/** 这一天是不是马来西亚公共假日（吉隆坡）；不是就回传 null */
export function getMalaysiaHoliday(dateStr: string | undefined | null): MalaysiaHoliday | null {
  if (!dateStr) return null;
  return BY_DATE.get(String(dateStr).slice(0, 10)) || null;
}

/** 表里有收录的年份（画面用来提示「某年还没加入」） */
export function hasHolidayDataForYear(year: number | string): boolean {
  const y = String(year);
  return MALAYSIA_HOLIDAYS.some(h => h.date.startsWith(`${y}-`));
}

/** 画面上的简短标签，例如「屠妖节」「开斋节（预计）」 */
export function holidayLabel(h: MalaysiaHoliday): string {
  return h.tentative ? `${h.name}（预计）` : h.name;
}

/** 给排班用的旧格式 { date, name } */
export const MALAYSIA_HOLIDAY_ITEMS = MALAYSIA_HOLIDAYS.map(h => ({ date: h.date, name: holidayLabel(h) }));
