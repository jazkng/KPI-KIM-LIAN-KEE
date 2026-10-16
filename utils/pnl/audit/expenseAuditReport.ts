// ============================================================================
// 杂项费用专项审计 · 读取、摘要文字、Excel 报告（只读）
// ============================================================================
import { DataManager } from '../../dataManager';
import { addDays, daysInMonth } from '../../cockpit/periods';
import { legacyFinancialReport } from '../reconciliation/legacyFinancialReport';
import { auditExpenses, TREATMENT_LABEL, type AuditRow, type ExpenseAuditResult } from './expenseAudit';
import { CASH_BOX_KIND_LABEL, CASH_BOX_STATUS_LABEL, CASH_BOX_USE_LABEL, type CashBoxStatus } from '../engine/cashBox';
import { loadExcelJS } from '../../lazyLibs';

const TIMEOUT_MS = 45000;

/** 读取该月（含前一天，处理 UTC 时间）资料，跑审计。只读。 */
export const loadExpenseAudit = async (month: string): Promise<ExpenseAuditResult> => {
    const start = `${month}-01`;
    const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const work = (async () => {
        const [raw, payrollRecords, employees] = await Promise.all([
            DataManager.getPnLRawRange(addDays(start, -1), end),
            DataManager.getPayrollRecords(),
            DataManager.getEmployees(),
        ]);
        const data = { settlements: raw.settlements as any[], standaloneExpenses: raw.standaloneExpenses as any[], billPayments: raw.billPayments as any[] };
        // 传统账目画面目前的分类金额（业务发生制，照抄 FinancialReport）
        const fr = legacyFinancialReport({ ...data, payrollRecords: payrollRecords as any[], employees: employees as any[] }, start, end, 'ACCRUAL');
        return auditExpenses(month, data, fr.classicCostByCategory);
    })();
    return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), TIMEOUT_MS))]);
};

const f = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rowText = (r: AuditRow) => `${r.date} | ${r.supplier || '（没有供应商）'} | ${r.item || '—'} | ${f(r.accrualAmount)} | ${r.category}${r.parts.length > 1 ? `（拆分：${r.parts.map(p => `${p.category} ${f(p.amount)}`).join('、')}）` : ''}`;

/** 贴回对话用的摘要：供应商与金额照列；薪资 / 兼职 / 预支 / 借款等含员工姓名的记录只列笔数 */
export const expenseAuditSummaryText = (a: ExpenseAuditResult): string => {
    const t = a.totals;
    const cb = a.cashBox;
    const lines = [
        `【杂项费用专项审计 ${a.month}】（只读；以传统账目目前的规则核对，未修改任何资料）`,
        `AP / 独立支出共 ${t.count} 笔，原始费用总额 ${f(t.apTotal)}`,
        `  已计入传统账目 ${f(t.counted)}；列在 CAPEX ${f(t.capex)}；没有进入任何科目 ${f(t.notInClassic)}；不计入（转账 / 押金 / 借款 / 分红）${f(t.nonOperating)}`,
        `  改由日结副本计入 ${f(t.viaSettlement)}；薪资付款 / 固定账单镜像 / 对账手续费（由其他来源计入或略过）${f(t.skipped)}`,
        `  分期付款被重复计入 ${f(t.duplicateInstalments)}；已计入但没有单据或发票号码 ${t.missingVoucher} 笔；UTC 切日计到别月 ${t.utcShifted} 笔`,
        '',
        '传统账目各科目核对（来源：AP / 固定账单 / 日结副本 / 系统计算 → 传统账目金额，差额）：',
        ...a.lineChecks.map(x => `  ${x.line}：${f(x.fromAP)} / ${f(x.fromBills)} / ${f(x.fromSettlement)} / ${f(x.computed)} → ${f(x.classic)}，差额 ${f(x.diff)}`),
        '',
        '分类汇总（AP 计入部分）：',
        ...a.byCategory.map(c => `  ${c.category}：${c.count} 笔 ${f(c.amount)} → ${c.line || '没有进入任何科目'}`),
        '',
        `没有进入任何科目：${a.notInClassic.length} 笔 ${f(t.notInClassic)}`,
        ...a.notInClassic.filter(r => !r.personal).map(r => `  ${rowText(r)} | 凭证：${r.voucher ? '有连结' : r.invoiceRef ? `发票 ${r.invoiceRef}` : '无'}`),
        '',
        '重点类别：',
        ...Object.entries(a.focus).map(([k, v]) => `  ${k}：${v.count} 笔 ${f(v.amount)}`),
        '',
        `疑似分类错误 / 太笼统：${a.suspicious.length} 笔`,
        ...a.suspicious.slice(0, 120).map(r => `  ${rowText(r)} → ${r.suspicion!.suggestedCategory ? `建议 ${r.suspicion!.suggestedCategory}（${r.suspicion!.suggestedLine}）` : '请补分类'}：${r.suspicion!.reason}`),
        ...(a.suspicious.length > 120 ? [`  另有 ${a.suspicious.length - 120} 笔，见 Excel`] : []),
        '',
        `钱箱支出对照：${cb.entries.length} 笔 ${f(cb.total)}；` + (Object.keys(cb.byStatus) as CashBoxStatus[]).map(k => `${CASH_BOX_STATUS_LABEL[k]} ${cb.byStatus[k].count} 笔 ${f(cb.byStatus[k].amount)}`).join('、'),
        '疑似未登记 AP 的钱箱支出（人工类只列笔数）：',
        ...cb.entries.filter(e => e.status === 'MISSING' && e.use !== 'LABOUR').sort((x, y) => y.amount - x.amount).slice(0, 80)
            .map(e => `  ${e.date} | ${e.text} | ${f(e.amount)} | 用途粗分：${CASH_BOX_USE_LABEL[e.use]}`),
        `  （人工类钱箱支出缺少记录 ${cb.entries.filter(e => e.status === 'MISSING' && e.use === 'LABOUR').length} 笔，不列内容）`,
        '',
        '修正建议：',
        ...a.suggestions.map((s, i) => `  ${i + 1}. ${s}`),
    ];
    return lines.join('\n');
};

/** 完整 Excel 审计报告（留在负责人装置，不上传） */
export const exportExpenseAuditExcel = async (a: ExpenseAuditResult): Promise<Blob> => {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const sheet = (name: string, header: string[], rows: (string | number)[][]) => {
        const ws = wb.addWorksheet(name);
        ws.addRow(header).font = { bold: true };
        rows.forEach(r => ws.addRow(r));
        ws.columns.forEach(c => { c.width = 16; });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        return ws;
    };
    const t = a.totals;
    sheet('总览', ['项目', '金额 / 笔数'], [
        ['月份', a.month],
        ['AP / 独立支出笔数', t.count],
        ['AP 原始费用总额', t.apTotal],
        ['已计入传统账目', t.counted],
        ['列在 CAPEX（不计入净利）', t.capex],
        ['没有进入任何科目', t.notInClassic],
        ['不计入（转账 / 押金 / 借款 / 分红）', t.nonOperating],
        ['改由日结副本计入', t.viaSettlement],
        ['薪资付款 / 固定账单镜像 / 对账手续费', t.skipped],
        ['分期付款被重复计入', t.duplicateInstalments],
        ['已计入但没有单据或发票号码（笔）', t.missingVoucher],
        ['UTC 切日计到别月（笔）', t.utcShifted],
    ]);
    sheet('逐笔明细', ['日期', '马来西亚日期', '供应商', '项目 / 说明', '发票号码', '单据连结', '金额', '账单全额', '传统账目计入金额', '付款状态', '付款方式', '原始分类', '细分', '传统账目科目', '处理方式', '分期重复', '疑似分类问题', '建议分类', '记录 ID'],
        a.rows.map(r => [r.date, r.myDate, r.supplier, r.item, r.invoiceRef, r.voucher, r.amount, r.totalBillAmount, r.accrualAmount, r.paymentStatus, r.paymentMethod, r.category, r.subCategory,
            r.parts.map(p => `${p.line || '（没有科目）'}${r.parts.length > 1 ? ` ${p.amount}` : ''}`).join('；'), TREATMENT_LABEL[r.treatment], r.duplicateInstalment ? '是' : '',
            r.suspicion?.reason || '', r.suspicion?.suggestedCategory || '', r.id]));
    sheet('分类汇总', ['分类', '笔数', '金额', '传统账目科目', '段落'], a.byCategory.map(c => [c.category, c.count, c.amount, c.line || '没有进入任何科目', c.section || '']));
    sheet('科目核对', ['传统账目科目', '段落', '来自 AP', '来自固定账单', '来自日结副本', '系统计算（薪资 / 平台）', '传统账目金额', '差额'],
        a.lineChecks.map(x => [x.line, x.section, x.fromAP, x.fromBills, x.fromSettlement, x.computed, x.classic, x.diff]));
    sheet('未计入科目', ['日期', '供应商', '项目', '金额', '分类', '凭证', '记录 ID'], a.notInClassic.map(r => [r.date, r.supplier, r.item, r.accrualAmount, r.category, r.voucher || r.invoiceRef || '无', r.id]));
    sheet('重点类别', ['类别', '日期', '供应商', '项目', '金额', '传统账目科目', '疑似问题'],
        Object.entries(a.focus).flatMap(([k, v]) => v.rows.map(r => [k, r.date, r.supplier, r.item, r.accrualAmount, r.parts.map(p => p.line || '（没有科目）').join('；'), r.suspicion?.reason || ''])));
    sheet('疑似分类错误', ['日期', '供应商', '项目', '金额', '目前分类', '目前科目', '原因', '建议分类', '建议科目', '记录 ID'],
        a.suspicious.map(r => [r.date, r.supplier, r.item, r.accrualAmount, r.category, r.parts[0]?.line || '（没有科目）', r.suspicion!.reason, r.suspicion!.suggestedCategory || '', r.suspicion!.suggestedLine || '', r.id]));
    sheet('钱箱对照', ['日期', '钱箱填写内容', '金额', '状态', '用途粗分', '对应记录类别', '对应记录', '对应日期', '对应金额', '说明'],
        a.cashBox.entries.map(e => [e.date, e.text, e.amount, CASH_BOX_STATUS_LABEL[e.status], CASH_BOX_USE_LABEL[e.use],
            e.match ? CASH_BOX_KIND_LABEL[e.match.kind] : '', e.match?.name || '', e.match?.date || '', e.match?.amount ?? '', e.note]));
    sheet('修正建议', ['#', '建议'], a.suggestions.map((s, i) => [i + 1, s]));
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
