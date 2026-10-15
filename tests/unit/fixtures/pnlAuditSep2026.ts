// ============================================================================
// 统一盈亏审计 · 虚构 2026 年 9 月资料（不是正式资料）
// 每一笔都对准一个已知的口径差异，方便把差异算成具体金额。
// 正确答案（权责发生制）在 tests/unit/pnlAuditSep2026.test.ts 逐项手算。
// ============================================================================

const pad = (n: number) => String(n).padStart(2, '0');
export const SEP_DAYS = Array.from({ length: 30 }, (_, i) => `2026-09-${pad(i + 1)}`);

/** 每天：店内 POS 2,500；Grab 总额 500、净额（未扣广告）400、广告 20；1–15 日已对账（实收 370），16–30 日未对账 */
export const sepSettlements = SEP_DAYS.map((date, i) => {
    const day = i + 1;
    return {
        id: `audit_s_${date}`,
        date,
        sales: {
            cash: 1000, tng: 500, duitnow: 300, card: 700, amex: 0,
            refundTotal: date === '2026-09-10' ? 100 : 0,
            storeHubTotal: 2500,
            // 日结表单写入的「营业总收入」= POS + (Grab 净额 − 广告)，退款没有扣
            total: 2880,
            deliveryBreakdown: { grabGross: 500, grabNet: 400, grabAds: 20, grab: 380, panda: 0, shopee: 0, lalamove: 0 },
        },
        reconStatus: day <= 15 ? { grab: 370 } : { grab: false },
        expenses: [] as any[],
        dayExpenses: date === '2026-09-05' ? [{ amount: 35, description: '钱箱买冰' }] : [],
    };
});

export const SEAFOOD_BILL_ID = 'audit_bill_seafood';

export const sepStandaloneExpenses = [
    { id: 'audit_meat', category: 'INGREDIENT_MEAT', amount: 26000, time: '2026-09-03T10:00:00', paymentStatus: 'PAID', paymentDate: '2026-09-03' },
    // 应付账款分两次付：第一次付 2,000 后，原账单 amount = 2,000、totalBillAmount = 6,000；第二次另建 pay_ 列 4,000
    { id: SEAFOOD_BILL_ID, category: 'INGREDIENT_SEAFOOD', amount: 2000, totalBillAmount: 6000, time: '2026-09-08T10:00:00', paymentStatus: 'PARTIAL', paymentDate: '2026-09-10' },
    { id: `pay_${SEAFOOD_BILL_ID}_1790000000000`, category: 'INGREDIENT_SEAFOOD', amount: 4000, totalBillAmount: 0, time: '2026-09-25T10:00:00', paymentStatus: 'PAID' },
    { id: 'audit_rent', category: 'RENT', amount: 12000, time: '2026-09-01T09:00:00', paymentStatus: 'PAID', paymentDate: '2026-09-01' },
    // 9 月电费账单，10 月才付（权责发生制计入 9 月）
    { id: 'audit_electric', category: 'UTILITIES_ELECTRIC', amount: 2200, time: '2026-09-28T09:00:00', paymentStatus: 'UNPAID' },
    { id: 'audit_subscription', category: 'SUBSCRIPTION', amount: 120, time: '2026-09-02T09:00:00', paymentStatus: 'PAID', paymentDate: '2026-09-02' },
    { id: 'parttime_audit_1', category: 'SALARY', amount: 450, time: '2026-09-20', paymentStatus: 'PAID', paymentDate: '2026-09-20' },
    { id: 'audit_staff_meal', category: 'STAFF_MEAL', amount: 300, time: '2026-09-15T12:00:00', paymentStatus: 'PAID', paymentDate: '2026-09-15' },
    // 员工 E2 预支 300（月底从薪水扣回）
    { id: 'audit_advance', category: 'STAFF_ADVANCE', amount: 300, time: '2026-09-12T12:00:00', paymentStatus: 'PAID', paymentDate: '2026-09-12' },
    // 对账自动建立的收款手续费（TNG 实收少于记账）
    { id: 'recon_fee_audit_s_2026-09-12_tng', category: 'BANK_FEE', amount: 25, time: '2026-09-12T12:00:00.000Z', paymentStatus: 'PAID' },
];

export const sepBillPayments = [
    { id: 'audit_bp_staff_elec', billId: 'audit_rb_staff_elec', category: 'ELECTRICITY_STAFF', amount: 300, date: '2026-09-18' },
];

export const sepEmployees = [
    { id: 'E1', name: '员工甲', department: 'KITCHEN', basicSalary: 3000, nationality: 'Malaysian', status: 'ACTIVE', joinDate: '2025-01-01' },
    { id: 'E2', name: '员工乙', department: 'FRONT', basicSalary: 2000, nationality: 'Foreign', status: 'ACTIVE', joinDate: '2025-01-01' },
];

// E1：应发 3,300（底薪 3,000 + 津贴 200 + OT 100）；E2：应发 2,000，扣回预支 300
const e1 = {
    employeeId: 'E1', employeeName: '员工甲', basicSalary: 3000, allowance: 200, extraSubsidy: 0, ot: 100, bonus: 0, otherEarning: 0,
    penalty: 0, unpaidLeave: 0, hostelFee: 0, advanceLoan: 0, otherDeduction: 0,
    ee_epf: 363, ee_socso: 16.25, ee_eis: 6.5, ee_pcb: 0, er_epf: 429, er_socso: 56.85, er_eis: 6.5,
    netPay: 2914.25, totalCost: 3792.35, isPaid: true,
};
const e2 = {
    employeeId: 'E2', employeeName: '员工乙', basicSalary: 2000, allowance: 0, extraSubsidy: 0, ot: 0, bonus: 0, otherEarning: 0,
    penalty: 0, unpaidLeave: 0, hostelFee: 0, advanceLoan: 300, otherDeduction: 0,
    ee_epf: 40, ee_socso: 0, ee_eis: 0, ee_pcb: 0, er_epf: 40, er_socso: 0, er_eis: 0,
    netPay: 1660, totalCost: 2040, isPaid: true,
};

export const sepPayroll = [{
    id: '2026-09', month: '2026-09', status: 'POSTED', isStatutoryPaid: false,
    totalAmount: 5832.35, totalNetPay: 4574.25,
    // 与 HRPayroll 相同：员工 + 雇主 EPF / SOCSO / EIS + PCB
    totalGovtPay: 958.1,
    staffCount: 2, details: [e1, e2],
}];
