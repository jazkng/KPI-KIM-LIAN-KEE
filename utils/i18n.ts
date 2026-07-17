export type AppLang = 'zh_en' | 'my';

export function getUserLang(user: any): AppLang {
  if (user && user.preferredLanguage) {
    return user.preferredLanguage as AppLang;
  }
  return 'zh_en';
}

export function isMyanmarMode(lang: AppLang): boolean {
  return lang === 'my';
}

export function tUI(key: string, fallbackZhEn: string, translations: any, lang: AppLang): string {
  if (lang !== 'my') {
    return fallbackZhEn;
  }
  return translations?.ui?.[key] || fallbackZhEn;
}

export function getItemDisplayName(item: any, translations: any, lang: AppLang): { primary: string; secondary: string } {
  if (!item) return { primary: '', secondary: '' };
  
  const chineseName = item.name || '';
  const englishName = item.nameEn || item.englishName || '';

  if (lang === 'my') {
    const burmese = translations?.items?.[item.id] || chineseName;
    return {
      primary: burmese,
      secondary: chineseName
    };
  } else {
    return {
      primary: chineseName,
      secondary: englishName
    };
  }
}

export function tCategory(categoryId: string, fallbackZhEn: string, translations: any, lang: AppLang): string {
  if (lang !== 'my') {
    return fallbackZhEn;
  }
  return translations?.categories?.[categoryId] || fallbackZhEn;
}

export function tUnit(unitCode: string, translations: any, lang: AppLang): string {
  if (!unitCode) return '';
  if (lang !== 'my') {
    return unitCode;
  }
  return translations?.units?.[unitCode] || unitCode;
}
