const fs = require('fs');

const fileHeader = `import { AppLanguage, normalizeLanguage } from '../types';

export type StaffLang = AppLanguage | 'zh' | 'zh_en';

export function cleanEnglishOnly(text: string): string {
  if (!text) return '';
  const parenthesizedEn = text.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
  if (parenthesizedEn && parenthesizedEn[1]) {
    return parenthesizedEn[1].trim();
  }
  const reverseParenthesizedEn = text.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/);
  if (reverseParenthesizedEn && reverseParenthesizedEn[1]) {
    return reverseParenthesizedEn[1].trim();
  }
  if (text.includes('/')) {
    const parts = text.split('/');
    const enPart = parts.find(p => /[a-zA-Z]/.test(p));
    if (enPart) return enPart.trim();
  }
  const stripped = text.replace(/[\\u4e00-\\u9fa5]/g, '').trim();
  if (stripped.length > 0) {
    return stripped.replace(/^[（\\(\\s\\:\\/]+|[）\\)\\s\\:\\/]+$/g, '').trim();
  }
  return text;
}
`;

// Require populator contents
const populator = require('./populate_all_translations.js');

// Read existing content entries from current staffTranslations.ts
const existingTs = fs.readFileSync('constants/staffTranslations.ts', 'utf8');

// Helper functions logic to append at end
const functionsFooter = `
// 4. Translate Functions

// 4.1 Fixed UI words translation
export function st(key: string, lang: StaffLang): string {
  if (!key) return '';
  const norm = normalizeLanguage(lang);
  const entry = STAFF_UI_TRANSLATIONS[key] || STAFF_UI_TRANSLATIONS[key.trim()];

  if (entry) {
    if (norm === 'en') {
      if (entry.en) return entry.en;
      if (entry.zh) {
        const cleaned = cleanEnglishOnly(entry.zh);
        if (cleaned && /[a-zA-Z]{2,}/.test(cleaned)) return cleaned;
      }
    }
    if (norm === 'my' && entry.my) {
      return entry.my;
    }
    if (entry[norm]) {
      return entry[norm]!;
    }
    if (entry.zh && (norm === 'zh_en' || norm === 'zh')) {
      return entry.zh;
    }
  }

  if (norm === 'en') {
    const cleanedKey = cleanEnglishOnly(key);
    if (cleanedKey && /[a-zA-Z]{2,}/.test(cleanedKey)) return cleanedKey;
    const match = key.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/) || key.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
    if (match && match[1] && match[1].trim().length > 1) {
      return match[1].trim();
    }
    if (!/[\\u4e00-\\u9fa5]/.test(key)) {
      return key;
    }
    return \`[Missing EN: \${key}]\`;
  }

  if (norm === 'my') {
    return key.replace(/_/g, ' ').toUpperCase();
  }

  return key;
}

// 4.2 Raw Content translations (SOP details, duties, troubleshootings, rules)
export function localizeStaffContent(originalText: string, lang: StaffLang): string {
  if (!originalText) return '';
  const norm = normalizeLanguage(lang);
  
  const entry = STAFF_CONTENT_TRANSLATIONS[originalText] || STAFF_CONTENT_TRANSLATIONS[originalText.trim()];
  if (entry) {
    if (norm === 'en' && entry.en) return entry.en;
    if (norm === 'my' && entry.my) return entry.my;
    if (entry[norm]) return entry[norm]!;
    if (entry.zh && (norm === 'zh_en' || norm === 'zh')) return entry.zh;
  }

  if (norm === 'en') {
    const pEn = originalText.match(/\\(([^)]*[a-zA-Z]{2,}[^)]*)\\)/);
    if (pEn && pEn[1] && pEn[1].trim().length > 1) {
      return pEn[1].trim();
    }
    const leadEn = originalText.match(/^([a-zA-Z0-9\\s\\/\\-\\&]+)\\s*[\\(（]/);
    if (leadEn && leadEn[1] && leadEn[1].trim().length > 1) {
      return leadEn[1].trim();
    }
    if (!/[\\u4e00-\\u9fa5]/.test(originalText)) {
      return originalText;
    }
    return \`[Missing EN: \${originalText}]\`;
  }

  if (norm === 'my') {
    if (entry && entry.my) return entry.my;
    const containsChinese = /[\\u4e00-\\u9fa5]/.test(originalText);
    if (containsChinese) {
      if (originalText.includes('打卡') || originalText.includes('考勤')) {
        return 'ပုံမှန်အလုပ်ဆင်း တက်ရောက်မှု တာဝန်';
      }
      if (originalText.includes('清洁') || originalText.includes('垃圾')) {
        return 'သန့်ရှင်းရေးနှင့် သပ်ရပ်မှု လုပ်ဆောင်ရန်';
      }
      if (originalText.includes('检查') || originalText.includes('确认')) {
        return 'စနစ်တကျစစ်ဆေးပြီး အတည်ပြုဆောင်ရွက်ရန်';
      }
      if (originalText.includes('准备') || originalText.includes('SOP')) {
        return 'သတ်မှတ်ထားသော ဆိုင်ဖွင့်ပြင်ဆင်မှု SOP';
      }
      return 'သတ်မှတ်ထားသော တာဝန် လုပ်ဆောင်ရန်';
    }
  }

  return originalText;
}

// 4.3 Module specific labels
export function getStaffModuleLabel(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.label) {
    if (norm === 'en' && entry.label.en) return entry.label.en;
    if (norm === 'my' && entry.label.my) return entry.label.my;
    if (entry.label[norm]) return entry.label[norm]!;
    if (entry.label.zh) {
      if (norm === 'en') return cleanEnglishOnly(entry.label.zh) || entry.label.zh;
      return entry.label.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback) || modKey.replace(/_/g, ' ').toUpperCase();
  return fallback || modKey.replace(/_/g, ' ').toUpperCase();
}

// 4.4 Module specific descriptions
export function getStaffModuleDesc(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.desc) {
    if (norm === 'en' && entry.desc.en) return entry.desc.en;
    if (norm === 'my' && entry.desc.my) return entry.desc.my;
    if (entry.desc[norm]) return entry.desc[norm]!;
    if (entry.desc.zh) {
      if (norm === 'en') return cleanEnglishOnly(entry.desc.zh) || entry.desc.zh;
      return entry.desc.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback) || 'Module description';
  return fallback || st('not_open_tip', lang);
}

// 4.5 Module specific step-by-step guides
export function getStaffModuleGuide(modKey: string, lang: StaffLang, fallback: string): string {
  const norm = normalizeLanguage(lang);
  const entry = STAFF_MODULE_TRANSLATIONS[modKey];
  if (entry && entry.guide) {
    if (norm === 'en' && entry.guide.en) return entry.guide.en;
    if (norm === 'my' && entry.guide.my) return entry.guide.my;
    if (entry.guide[norm]) return entry.guide[norm]!;
    if (entry.guide.zh) {
      if (norm === 'en') return cleanEnglishOnly(entry.guide.zh) || entry.guide.zh;
      return entry.guide.zh;
    }
  }
  if (norm === 'en') return cleanEnglishOnly(fallback);
  return fallback || '';
}
`;

console.log('build_full_staff_ts.js ready');
