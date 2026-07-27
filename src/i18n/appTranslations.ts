import type { AppLanguage } from '../../types';

export const appTranslations = {
  common: {
    save: {
      zh_en: '保存 Save',
      en: 'Save',
      my: 'သိမ်းဆည်းရန်',
    },
    cancel: {
      zh_en: '取消 Cancel',
      en: 'Cancel',
      my: 'ပယ်ဖျက်ရန်',
    },
    confirm: {
      zh_en: '确认 Confirm',
      en: 'Confirm',
      my: 'အတည်ပြုရန်',
    },
    back: {
      zh_en: '返回 Back',
      en: 'Back',
      my: 'နောက်သို့',
    },
    loading: {
      zh_en: '加载中 Loading...',
      en: 'Loading...',
      my: 'လုပ်ဆောင်နေသည်...',
    },
    noData: {
      zh_en: '暂无资料 No data',
      en: 'No data available',
      my: 'အချက်အလက်မရှိပါ',
    },
    success: {
      zh_en: '操作成功 Success',
      en: 'Operation successful',
      my: 'အောင်မြင်စွာ ဆောင်ရွက်ပြီးပါပြီ',
    },
    failed: {
      zh_en: '操作失败 Failed',
      en: 'Operation failed',
      my: 'ဆောင်ရွက်မှု မအောင်မြင်ပါ',
    },
    edit: {
      zh_en: '编辑 Edit',
      en: 'Edit',
      my: 'ပြင်ဆင်ရန်',
    },
    delete: {
      zh_en: '删除 Delete',
      en: 'Delete',
      my: 'ဖျက်ရန်',
    },
    close: {
      zh_en: '关闭 Close',
      en: 'Close',
      my: 'ပိတ်ရန်',
    },
    search: {
      zh_en: '搜索 Search',
      en: 'Search',
      my: 'ရှာဖွေရန်',
    },
    all: {
      zh_en: '全部 All',
      en: 'All',
      my: 'အားလုံး',
    },
    pending: {
      zh_en: '待处理 Pending',
      en: 'Pending',
      my: 'စောင့်ဆိုင်းဆဲ',
    },
    completed: {
      zh_en: '已完成 Completed',
      en: 'Completed',
      my: 'ပြီးစီးပါပြီ',
    },
  },
} as const;

export const translateText = (
  values: Partial<Record<AppLanguage, string>>,
  language: AppLanguage
): string => {
  return (
    values[language] ||
    values.zh_en ||
    values.en ||
    ''
  );
};

export interface LocalizedItemName {
  name?: string;
  nameZh?: string;
  nameEn?: string;
  nameMy?: string;
}

export const getLocalizedItemName = (
  item: LocalizedItemName,
  language: AppLanguage
): string => {
  if (language === 'en') {
    return (
      item.nameEn ||
      item.name ||
      item.nameZh ||
      item.nameMy ||
      'Unnamed item'
    );
  }

  if (language === 'my') {
    return (
      item.nameMy ||
      item.nameEn ||
      item.name ||
      item.nameZh ||
      'အမည်မရှိသောပစ္စည်း'
    );
  }

  const chineseName = item.nameZh || item.name || '';
  const englishName = item.nameEn || '';

  if (
    chineseName &&
    englishName &&
    chineseName.trim().toLowerCase() !==
      englishName.trim().toLowerCase()
  ) {
    return `${chineseName} / ${englishName}`;
  }

  return chineseName || englishName || item.nameMy || '未命名物品';
};
