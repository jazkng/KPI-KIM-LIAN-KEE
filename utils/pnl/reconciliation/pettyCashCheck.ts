// ============================================================================
// 盈亏对账 · 钱箱支出核对（只读）
// ----------------------------------------------------------------------------
// 日结的「当日钱箱支出」（dayExpenses）是收银员手动填写的 { company, item, amount }，没有分类。
// 兼职工资（PartTimePanel）、员工预支（StaffCashModule）、应付账款都可以选「现金付款」另外记账，
// 同一笔钱若从钱箱拿出、又在那些模组登记，就会被计两次。程序本身分辨不出来，只能看资料：
//   1. 重叠：同金额、日期相差不超过 2 天的另一笔记录 → 列为「疑似同一笔」
//   2. 用途：依文字关键词粗分（食材 / 燃料 / 人工 / 其他），让负责人看出钱箱的钱花在哪里
// 不自动扣除任何一笔，只列出来请负责人确认。
// ============================================================================

const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100 + 0;

export type PettyCashMatchType = 'PART_TIME' | 'ADVANCE' | 'AP_BILL' | 'OTHER_EXPENSE';
export const PETTY_CASH_MATCH_LABEL: Record<PettyCashMatchType, string> = {
    PART_TIME: '兼职工资', ADVANCE: '员工预支', AP_BILL: '应付账款 / 独立支出', OTHER_EXPENSE: '其他支出记录',
};

export type PettyCashUse = 'FOOD' | 'FUEL' | 'LABOUR' | 'OTHER';
export const PETTY_CASH_USE_LABEL: Record<PettyCashUse, string> = {
    FOOD: '食材 / 饮料', FUEL: '燃料（煤气、木炭）', LABOUR: '人工（兼职、预支、工资）', OTHER: '其他 / 无法判断',
};

const USE_KEYWORDS: [PettyCashUse, RegExp][] = [
    ['LABOUR', /兼职|预支|工资|薪|人工|借支|part\s*time|parttime|advance|salary|wage|gaji/i],
    ['FUEL', /煤气|石油气|木炭|火炭|炭|gas|lpg|charcoal|arang/i],
    ['FOOD', /菜|肉|鸡|鸭|猪|牛|鱼|虾|蟹|苏东|啦啦|蛋|米|面|粉|油|冰|酱|豆|葱|蒜|姜|辣|椒|果|椰|糖|盐|茶|咖啡|奶|饮|矿泉水|饮用水|可乐|啤|酒|veg|sayur|chicken|ayam|fish|ikan|prawn|udang|sotong|lala|egg|telur|rice|beras|noodle|mee|oil|minyak|ice|ais|sauce|sugar|gula|milk|susu|tea|teh|coffee|kopi|beer|drink|minuman/i],
];

export const classifyPettyCashUse = (text: string): PettyCashUse => {
    for (const [use, re] of USE_KEYWORDS) if (re.test(text)) return use;
    return 'OTHER';
};

export interface PettyCashEntry {
    date: string;
    text: string;
    amount: number;
    use: PettyCashUse;
    match?: { type: PettyCashMatchType; id: string; date: string; label: string };
}

export interface PettyCashCheck {
    entries: PettyCashEntry[];
    total: number;
    byUse: Record<PettyCashUse, { amount: number; count: number }>;
    matched: Record<PettyCashMatchType, { amount: number; count: number }>;
    matchedTotal: number;
}

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

const matchTypeOf = (e: any): PettyCashMatchType => {
    const id = String(e?.id || '');
    const cat = String(e?.category || '').toUpperCase();
    if (id.startsWith('parttime_')) return 'PART_TIME';
    if (cat.includes('ADVANCE')) return 'ADVANCE';
    if (id.startsWith('pay_') || e?.totalBillAmount || e?.invoiceRef || e?.company) return 'AP_BILL';
    return 'OTHER_EXPENSE';
};

export const checkPettyCash = (
    settlements: any[],
    standaloneExpenses: any[],
    start: string,
    end: string,
    windowDays = 2,
): PettyCashCheck => {
    const candidates = standaloneExpenses
        .filter(e => !String(e?.id || '').startsWith('recon_fee_') && !String(e?.id || '').startsWith('bill_sync_'))
        .map(e => ({ e, date: String(e.paymentDate || e.time || '').slice(0, 10), amount: num(e.amount) }))
        .filter(c => c.date && c.amount > 0);
    const used = new Set<string>();
    const entries: PettyCashEntry[] = [];
    settlements
        .filter(s => { const d = String(s.date || '').slice(0, 10); return d >= start && d <= end; })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .forEach(s => {
            const date = String(s.date).slice(0, 10);
            (s.dayExpenses || []).forEach((x: any) => {
                const amount = num(x?.amount);
                if (amount <= 0) return;
                const text = [x?.company, x?.item, x?.description, x?.note].filter(Boolean).join(' · ') || '（没有填写内容）';
                const entry: PettyCashEntry = { date, text, amount: r2(amount), use: classifyPettyCashUse(text) };
                // 同金额、日期最接近的那一笔；每一笔另外的记录只配对一次
                const best = candidates
                    .filter(c => !used.has(c.e.id) && Math.abs(c.amount - amount) < 0.01 && dayDiff(c.date, date) <= windowDays)
                    .sort((a, b) => dayDiff(a.date, date) - dayDiff(b.date, date))[0];
                if (best) {
                    used.add(best.e.id);
                    entry.match = {
                        type: matchTypeOf(best.e), id: String(best.e.id), date: best.date,
                        label: [best.e.company, best.e.category].filter(Boolean).join(' · ') || String(best.e.id),
                    };
                }
                entries.push(entry);
            });
        });
    const byUse = { FOOD: { amount: 0, count: 0 }, FUEL: { amount: 0, count: 0 }, LABOUR: { amount: 0, count: 0 }, OTHER: { amount: 0, count: 0 } };
    const matched = { PART_TIME: { amount: 0, count: 0 }, ADVANCE: { amount: 0, count: 0 }, AP_BILL: { amount: 0, count: 0 }, OTHER_EXPENSE: { amount: 0, count: 0 } };
    entries.forEach(e => {
        byUse[e.use].amount += e.amount; byUse[e.use].count += 1;
        if (e.match) { matched[e.match.type].amount += e.amount; matched[e.match.type].count += 1; }
    });
    (Object.keys(byUse) as PettyCashUse[]).forEach(k => { byUse[k].amount = r2(byUse[k].amount); });
    (Object.keys(matched) as PettyCashMatchType[]).forEach(k => { matched[k].amount = r2(matched[k].amount); });
    return {
        entries,
        total: r2(entries.reduce((s, e) => s + e.amount, 0)),
        byUse,
        matched,
        matchedTotal: r2(entries.filter(e => e.match).reduce((s, e) => s + e.amount, 0)),
    };
};
