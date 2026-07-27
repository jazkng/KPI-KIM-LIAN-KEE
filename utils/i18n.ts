import { AppLanguage, normalizeLanguage } from '../types';
import { getLocalizedItemName, LocalizedItemName } from '../src/i18n/appTranslations';

export type AppLang = AppLanguage;

export { normalizeLanguage, getLocalizedItemName };

export function getUserLang(user: any): AppLanguage {
  if (user && user.preferredLanguage) {
    return normalizeLanguage(user.preferredLanguage);
  }
  return 'zh_en';
}

export function isMyanmarMode(lang: AppLanguage | string): boolean {
  return normalizeLanguage(lang) === 'my';
}

export function isEnglishMode(lang: AppLanguage | string): boolean {
  return normalizeLanguage(lang) === 'en';
}

export function tUI(key: string, fallbackZhEn: string, translations: any, lang: AppLanguage | string): string {
  const norm = normalizeLanguage(lang);
  if (norm === 'en') {
    return translations?.ui?.[key] || translations?.ui_en?.[key] || fallbackZhEn.split('/')[1]?.trim() || fallbackZhEn.split(' ')[1]?.trim() || fallbackZhEn;
  }
  if (norm === 'my') {
    return translations?.ui?.[key] || fallbackZhEn;
  }
  return fallbackZhEn;
}

export function getItemDisplayName(item: any, translations: any, lang: AppLanguage | string): { primary: string; secondary: string } {
  if (!item) return { primary: '', secondary: '' };
  
  const norm = normalizeLanguage(lang);
  const chineseName = item.nameZh || item.name || '';
  const englishName = item.nameEn || item.englishName || '';

  if (norm === 'en') {
    return {
      primary: englishName || chineseName || 'Unnamed item',
      secondary: ''
    };
  }

  if (norm === 'my') {
    const burmese = item.nameMy || translations?.items?.[item.id] || englishName || chineseName;
    return {
      primary: burmese,
      secondary: englishName || chineseName
    };
  }

  return {
    primary: chineseName,
    secondary: englishName
  };
}

export function tCategory(categoryId: string, fallbackZhEn: string, translations: any, lang: AppLanguage | string): string {
  const norm = normalizeLanguage(lang);
  if (norm === 'my') {
    return translations?.categories?.[categoryId] || fallbackZhEn;
  }
  if (norm === 'en') {
    return translations?.categories_en?.[categoryId] || fallbackZhEn.split('/')[1]?.trim() || fallbackZhEn;
  }
  return fallbackZhEn;
}

export function tUnit(unitCode: string, translations: any, lang: AppLanguage | string): string {
  if (!unitCode) return '';
  const norm = normalizeLanguage(lang);
  if (norm === 'my') {
    return translations?.units?.[unitCode] || unitCode;
  }
  return unitCode;
}

