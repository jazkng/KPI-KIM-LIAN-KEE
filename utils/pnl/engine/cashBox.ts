// ============================================================================
// 钱箱核对（只读）
// ----------------------------------------------------------------------------
// 负责人 2026-10-16 决定：日结的「当日钱箱支出」（dayExpenses）只用于钱箱现金核对，
// 不进入经营盈亏；采购、杂项、维修等费用以应付账款 / 独立支出为正式来源，薪资以 Payroll 为来源。
//
// 这里把每一笔钱箱支出，与「可能是同一笔钱」的正式记录对照，给出四种状态：
//   已核对（系统比对一致）：金额相同 + 名称相符 + 对方记录是现金付款（兼职 / 预支本来就是现金）
//   待核对：只有金额相同、日期相近，名称对不上或没填 —— 绝不因此自动当成同一笔
//   不一致：名称相符、日期相近，但金额不同
//   缺少记录：找不到任何可能对应的正式记录 → 这笔费用可能没有入账（盈亏可能遗漏）
// 日期容许：有付款日期的记录看付款日（前后 3 天）；只有账单日期的，账单可以比钱箱付款早最多 31 天、晚最多 3 天。
// 每一笔正式记录只配对一次。纯函数，不读写资料库。
// ============================================================================

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

export type CashBoxStatus = 'MATCHED' | 'TO_VERIFY' | 'MISMATCH' | 'MISSING';
export const CASH_BOX_STATUS_LABEL: Record<CashBoxStatus, string> = {
    MATCHED: '已核对（系统比对一致）',
    TO_VERIFY: '待核对',
    MISMATCH: '不一致',
    MISSING: '缺少 AP / 费用记录',
};

export type CashBoxRecordKind = 'AP' | 'FIXED_BILL' | 'PART_TIME' | 'ADVANCE';
export const CASH_BOX_KIND_LABEL: Record<CashBoxRecordKind, string> = {
    AP: '应付账款 / 独立支出', FIXED_BILL: '固定账单付款', PART_TIME: '兼职工资', ADVANCE: '员工预支',
};

export type CashBoxUse = 'FOOD' | 'FUEL' | 'LABOUR' | 'OTHER';
export const CASH_BOX_USE_LABEL: Record<CashBoxUse, string> = {
    FOOD: '食材 / 饮料', FUEL: '燃料（煤气、木炭）', LABOUR: '人工（兼职、预支、工资）', OTHER: '其他 / 无法判断',
};

const USE_KEYWORDS: [CashBoxUse, RegExp][] = [
    ['LABOUR', /兼职|预支|工资|薪|人工|借支|part\s*time|parttime|advance|salary|wage|gaji/i],
    ['FUEL', /煤气|石油气|木炭|火炭|炭|gas|lpg|charcoal|arang/i],
    ['FOOD', /菜|肉|鸡|鸭|猪|牛|鱼|虾|蟹|苏东|啦啦|蛋|米|面|粉|油|冰|酱|豆|葱|蒜|姜|辣|椒|果|椰|糖|盐|茶|咖啡|奶|饮|矿泉水|饮用水|可乐|啤|酒|veg|sayur|chicken|ayam|fish|ikan|prawn|udang|sotong|lala|egg|telur|rice|beras|noodle|mee|oil|minyak|ice|ais|sauce|sugar|gula|milk|susu|tea|teh|coffee|kopi|beer|drink|minuman/i],
];

/** 依文字粗分钱箱支出的用途（只供参考） */
export const classifyCashBoxUse = (text: string): CashBoxUse => {
    for (const [use, re] of USE_KEYWORDS) if (re.test(text)) return use;
    return 'OTHER';
};

export interface CashBoxCandidateRef {
    kind: CashBoxRecordKind;
    id: string;
    date: string;
    name: string;
    category: string;
    amount: number;
}

export interface CashBoxEntry {
    date: string;
    text: string;
    amount: number;
    use: CashBoxUse;
    status: CashBoxStatus;
    /** 对应的正式记录（已核对 / 待核对 / 不一致才有） */
    match?: CashBoxCandidateRef;
    note: string;
}

export interface CashBoxSummary {
    entries: CashBoxEntry[];
    total: number;
    byStatus: Record<CashBoxStatus, { amount: number; count: number }>;
    byUse: Record<CashBoxUse, { amount: number; count: number }>;
}

const toDay = (value: unknown): string => {
    const s = String(value || '');
    if (/T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const t = Date.parse(s);
        if (Number.isFinite(t)) return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }
    return s.slice(0, 10);
};
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;

/** 名称比对：去空白与标点后，任一方包含另一方，或有共同的词（中文 ≥ 2 字、英文 ≥ 3 字母） */
const normalise = (s: unknown) => String(s || '').toLowerCase().replace(/[\s·,.\-_/()（）:：]+/g, '');
const tokens = (s: unknown) => String(s || '').toLowerCase().split(/[\s·,.\-_/()（）:：]+/)
    .filter(t => (/[一-鿿]/.test(t) ? t.length >= 2 : t.length >= 3));
export const namesMatch = (text: string, name: string): boolean => {
    const a = normalise(text), b = normalise(name);
    if (!a || !b || b.length < 2) return false;
    if (a.includes(b) || (a.length >= 2 && b.includes(a))) return true;
    const ta = new Set(tokens(text));
    return tokens(name).some(t => ta.has(t));
};

interface Candidate extends CashBoxCandidateRef {
    /** 付款日期（有的话）；没有就只有账单日期 */
    paidOn?: string;
    billOn: string;
    isCash: boolean;
    amounts: number[];
}

const withinWindow = (c: Candidate, d: string): boolean => {
    if (c.paidOn) return Math.abs(dayNum(c.paidOn) - dayNum(d)) <= 3;
    const diff = dayNum(d) - dayNum(c.billOn);
    return diff >= -3 && diff <= 31;
};

const candidatesFrom = (standaloneExpenses: any[], billPayments: any[]): Candidate[] => {
    const out: Candidate[] = [];
    standaloneExpenses.forEach(e => {
        const id = String(e?.id || '');
        if (!id || id.startsWith('recon_fee_') || id.startsWith('bill_sync_') || id.startsWith('payroll_') || id.startsWith('salary_')) return;
        const cat = String(e.category || '').toUpperCase();
        const kind: CashBoxRecordKind = id.startsWith('parttime_') ? 'PART_TIME' : cat.includes('ADVANCE') ? 'ADVANCE' : 'AP';
        const billOn = toDay(e.time);
        const paidOn = e.paymentDate ? toDay(e.paymentDate) : (kind !== 'AP' ? billOn : undefined);
        const amounts = Array.from(new Set([num(e.amount), num(e.totalBillAmount)].filter(a => a > 0)));
        if (!billOn || !amounts.length) return;
        out.push({
            kind, id, date: paidOn || billOn, paidOn, billOn,
            name: String(e.company || e.note || ''), category: cat,
            amount: amounts[0], amounts,
            isCash: kind !== 'AP' || e.paymentMethod === 'CASH' || e.paidBy === 'SHOP_CASH',
        });
    });
    billPayments.forEach(b => {
        const d = toDay(b.date);
        if (!d || !(num(b.amount) > 0)) return;
        out.push({
            kind: 'FIXED_BILL', id: String(b.id), date: d, paidOn: d, billOn: d,
            name: String(b.name || b.category || ''), category: String(b.category || '').toUpperCase(),
            amount: num(b.amount), amounts: [num(b.amount)], isCash: b.method === 'CASH',
        });
    });
    return out;
};

export const reconcileCashBox = (
    settlements: any[],
    standaloneExpenses: any[],
    billPayments: any[],
    start: string,
    end: string,
): CashBoxSummary => {
    const candidates = candidatesFrom(standaloneExpenses, billPayments);
    const used = new Set<string>();
    const raw = settlements
        .filter(s => { const d = String(s.date || '').slice(0, 10); return d >= start && d <= end; })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .flatMap(s => (s.dayExpenses || [])
            .filter((x: any) => num(x?.amount) > 0)
            .map((x: any) => {
                const text = [x?.company, x?.item, x?.description, x?.note].filter(Boolean).join(' · ');
                return { date: String(s.date).slice(0, 10), text: text || '（没有填写内容）', amount: r2(num(x.amount)), use: classifyCashBoxUse(text) };
            }));

    const entries: (CashBoxEntry | null)[] = raw.map(() => null);
    const ref = (c: Candidate): CashBoxCandidateRef => ({ kind: c.kind, id: c.id, date: c.date, name: c.name, category: c.category, amount: c.amount });
    const pick = (i: number, test: (c: Candidate) => boolean) => {
        const e = raw[i];
        return candidates
            .filter(c => !used.has(c.id) && withinWindow(c, e.date) && test(c))
            .sort((a, b) => Math.abs(dayNum(a.date) - dayNum(e.date)) - Math.abs(dayNum(b.date) - dayNum(e.date)))[0];
    };
    const sameAmount = (c: Candidate, a: number) => c.amounts.some(x => Math.abs(x - a) < 0.01);

    // 第一轮：金额 + 名称 + 现金付款 都对上 → 已核对
    raw.forEach((e, i) => {
        const c = pick(i, c => c.isCash && sameAmount(c, e.amount) && namesMatch(e.text, c.name));
        if (!c) return;
        used.add(c.id);
        entries[i] = { ...e, status: 'MATCHED', match: ref(c), note: `金额、名称相符，${CASH_BOX_KIND_LABEL[c.kind]}为现金付款` };
    });
    // 第二轮：名称对上、金额不同 → 不一致
    raw.forEach((e, i) => {
        if (entries[i]) return;
        const c = pick(i, c => namesMatch(e.text, c.name) && !sameAmount(c, e.amount));
        if (!c) return;
        used.add(c.id);
        entries[i] = { ...e, status: 'MISMATCH', match: ref(c), note: `名称相符但金额不同：钱箱 ${e.amount.toFixed(2)}，记录 ${c.amount.toFixed(2)}` };
    });
    // 第三轮：只有金额与日期相近（或名称相符但对方不是现金付款）→ 待核对，绝不自动确认
    raw.forEach((e, i) => {
        if (entries[i]) return;
        const c = pick(i, c => sameAmount(c, e.amount));
        if (!c) return;
        used.add(c.id);
        const nameOk = namesMatch(e.text, c.name);
        entries[i] = {
            ...e, status: 'TO_VERIFY', match: ref(c),
            note: nameOk ? `金额、名称相符，但该记录不是现金付款` : `只有金额相同、日期相近，名称对不上或没有填写`,
        };
    });
    const final: CashBoxEntry[] = raw.map((e, i) => entries[i] || { ...e, status: 'MISSING', note: '找不到对应的应付账款、固定账单、兼职或预支记录' });

    const byStatus = { MATCHED: { amount: 0, count: 0 }, TO_VERIFY: { amount: 0, count: 0 }, MISMATCH: { amount: 0, count: 0 }, MISSING: { amount: 0, count: 0 } };
    const byUse = { FOOD: { amount: 0, count: 0 }, FUEL: { amount: 0, count: 0 }, LABOUR: { amount: 0, count: 0 }, OTHER: { amount: 0, count: 0 } };
    final.forEach(e => {
        byStatus[e.status].amount += e.amount; byStatus[e.status].count += 1;
        byUse[e.use].amount += e.amount; byUse[e.use].count += 1;
    });
    (Object.keys(byStatus) as CashBoxStatus[]).forEach(k => { byStatus[k].amount = r2(byStatus[k].amount); });
    (Object.keys(byUse) as CashBoxUse[]).forEach(k => { byUse[k].amount = r2(byUse[k].amount); });
    return { entries: final, total: r2(final.reduce((s, e) => s + e.amount, 0)), byStatus, byUse };
};
