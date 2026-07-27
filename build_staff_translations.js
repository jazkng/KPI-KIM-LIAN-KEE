import fs from 'fs';

// Helper to auto-generate English translation from text if missing
function getEnglishForContent(key, textObj) {
  if (textObj.en) return textObj.en;
  
  // Try clean English extraction from zh or key
  const zh = textObj.zh || key;
  if (!zh) return key;

  // 1. Parentheses extraction e.g. "准备汤底 (Soup Base)" -> "Soup Base"
  const pMatch = zh.match(/\(([^)]*[a-zA-Z]{2,}[^)]*)\)/);
  if (pMatch && pMatch[1]) return pMatch[1].trim();

  const reverseP = zh.match(/^([a-zA-Z0-9\s\/\-\&]+)\s*[\(（]/);
  if (reverseP && reverseP[1]) return reverseP[1].trim();

  // 2. Pure ASCII check
  if (!/[\u4e00-\u9fa5]/.test(zh)) return zh;

  return null;
}

console.log('Script initialized.');
