// 商品名称分两行显示：上面中文（翻译功能只翻这一行），下面英文（较小）。
// 名称照负责人自己编辑的「中文 (English)」格式拆开；没有括号的就只有一行。
const rawSplit = (name: string): { primary: string; secondary: string } => {
    const s = String(name || '').trim();
    const i = s.search(/[（(]/);
    if (i <= 0) return { primary: s, secondary: '' };
    const primary = s.slice(0, i).trim();
    let rest = s.slice(i).trim();
    // 「(Dish Soap)」去掉外层括号；「(Dish Soap)(A)」这种多组括号原样保留
    const m = rest.match(/^[（(]([^（()）]*)[)）]$/);
    if (m) rest = m[1].trim();
    return { primary, secondary: rest };
};

/** 「1 Bottle = 1 Bottle」这种同单位、比例 1 的换算：重复，不用显示 */
export const isTrivialConversion = (fromUnit: unknown, ratio: unknown, toUnit: unknown): boolean =>
    Number(ratio || 1) === 1 && String(fromUnit || '').trim().toLowerCase() === String(toUnit || '').trim().toLowerCase();

const HAS_CJK = /[\u3400-\u9fff]/;
/**
 * 商品名称分两行：中文永远在上（较大），英文在下（较小）。
 * - 「中文 (English)」→ 中文 / English
 * - 只有括号里是中文（例如「SQ1500 Box (单座饭盒)」）→ 对调，中文在上
 * - 全英文（例如「Plastic bag (30GG)」）→ 括号是名称的一部分，保持一行
 */
export const splitStockName = (name: string): { primary: string; secondary: string } => {
    const { primary, secondary } = rawSplit(name);
    if (!HAS_CJK.test(primary) && !HAS_CJK.test(secondary)) return { primary: String(name || '').trim(), secondary: '' };
    if (secondary && !HAS_CJK.test(primary) && HAS_CJK.test(secondary)) return { primary: secondary, secondary: primary };
    return { primary, secondary };
};

/** 采购单等对外单据用，规则同 splitStockName */
export const chineseFirstName = splitStockName;
