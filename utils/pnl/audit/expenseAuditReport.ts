// ============================================================================
// 杂项费用专项审计 · 读取、摘要文字、Excel 报告（只读）
// ============================================================================
import { DataManager } from '../../dataManager';
import { addDays, daysInMonth } from '../../cockpit/periods';
import { legacyFinancialReport } from '../reconciliation/legacyFinancialReport';
import { auditExpenses, TREATMENT_LABEL, type AuditRow, type ExpenseAuditResult } from './expenseAudit';
import { parentBillIdOfPayment } from '../../monthlyPnLAggregator';
import { loadExcelJS } from '../../lazyLibs';

const TIMEOUT_MS = 45000;

/** 读取该月（含前一天：UTC 存档、马来西亚日期在本月的记录）资料，跑审计。只读。 */
export const loadExpenseAudit = async (month: string): Promise<ExpenseAuditResult> => {
    const start = `${month}-01`;
    const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const work = (async () => {
        const [raw, payrollRecords, employees] = await Promise.all([
            DataManager.getPnLRawRange(addDays(start, -1), end),
            DataManager.getPayrollRecords(),
            DataManager.getEmployees(),
        ]);
        const standalone = raw.standaloneExpenses as any[];
        const loaded = new Set(standalone.map(e => e.id));
        const missing = [...new Set(standalone.map(e => parentBillIdOfPayment(e.id)).filter((id): id is string => !!id && !loaded.has(id)))];
        const parents = new Map((missing.length ? await DataManager.getStandaloneExpensesByIds(missing) : []).map(b => [b.id, b as any]));
        const data = { settlements: raw.settlements as any[], standaloneExpenses: standalone, billPayments: raw.billPayments as any[] };
        // 传统账目画面目前的分类金额（业务发生制，与 FinancialReport 相同）
        const fr = legacyFinancialReport({ ...data, payrollRecords: payrollRecords as any[], employees: employees as any[], parentBills: parents }, start, end, 'ACCRUAL');
        return auditExpenses(month, data, fr.classicCostByCategory, { records: payrollRecords as any[], employees: employees as any[] }, parents);
    })();
    return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('读取逾时，请检查网络')), TIMEOUT_MS))]);
};

const f = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const partsText = (r: AuditRow) => (r.parts.length > 1 ? `（混合发票：${r.parts.map(p => `${p.line || p.category} ${f(p.amount)}`).join(' + ')}）` : '');
const rowText = (r: AuditRow) => `${r.date} | ${r.supplier || '（没有供应商）'} | ${r.item || '—'} | ${f(r.accrualAmount)} | ${r.category}${partsText(r)}`;

/** 贴回对话用的摘要：供应商与金额照列；薪资 / 兼职 / 预支 / 借款等含员工姓名的记录只列笔数与金额 */
export const expenseAuditSummaryText = (a: ExpenseAuditResult): string => {
    const t = a.totals;
    const L = a.labour;
    const lines = [
        `【杂项费用专项审计 ${a.month}】（只读；以传统账目目前的规则核对，未修改任何资料；每日结算的钱箱支出不纳入）`,
        `月份按单据的马来西亚日期判断。AP / 独立支出共 ${t.count} 笔，原始费用总额 ${f(t.apTotal)}`,
        `  已计入传统账目 ${f(t.counted)}；列在 CAPEX ${f(t.capex)}；不在对照表、并入后备科目 ${f(t.folded)}；没有进入任何科目 ${f(t.notInClassic)}；不计入（转账 / 押金 / 借款 / 分红）${f(t.nonOperating)}`,
        `  改由日结副本计入 ${f(t.viaSettlement)}；薪资付款 / 固定账单镜像 / 对账手续费（由其他来源计入或略过）${f(t.skipped)}`,
        `  分期付款列（原账单已全额计入，不再计）${f(t.duplicateInstalments)}；扣减（CN）${a.creditNoteRows.length} 笔 ${f(t.creditNotes)}；UTC 切日跨月 ${t.utcShifted} 笔`,
        '',
        '传统账目各科目核对（来源：AP / 固定账单 / 日结副本 / 系统计算 → 传统账目金额，差额）：',
        ...a.lineChecks.map(x => `  ${x.line}：${f(x.fromAP)} / ${f(x.fromBills)} / ${f(x.fromSettlement)} / ${f(x.computed)} → ${f(x.classic)}，差额 ${f(x.diff)}`),
        '  注意：差额为 0 只代表每一块钱都找得到来源，不代表分类正确、也不代表没有漏账。',
        '',
        '人工只计一次核对：',
        ...(L ? [
            `  传统账目人工 = 薪资单实发 ${f(L.classic.payrollNet)} + 预支 ${f(L.classic.advance)} + 兼职 ${f(L.classic.partTime)} + 手动工资 ${f(L.classic.manualSalary)} + 员工餐 ${f(L.classic.staffMeal)} + 其他 ${f(L.classic.other)} + 法定缴款 ${f(L.classic.statutory)} = ${f(L.classic.total)}`,
            ...L.notes.map(n => `  - ${n}`),
        ] : ['  （没有读取薪资单）']),
        '',
        '分类汇总（AP 计入部分）：',
        ...a.byCategory.map(c => `  ${c.category}：${c.count} 笔 ${f(c.amount)} → ${c.line || '没有进入任何科目'}`),
        '',
        `分类不在科目对照表：${a.notInClassic.length} 笔（并入后备科目 ${f(t.folded)}，不计 ${f(t.notInClassic)}）`,
        ...a.notInClassic.filter(r => !r.personal).map(r => `  ${rowText(r)} | 凭证：${r.voucher ? '有连结' : r.invoiceRef ? `发票 ${r.invoiceRef}` : '无'}`),
        '',
        `固定账单付款的分类不在对照表：${a.unmappedBills.length} 笔 ${f(a.unmappedBills.reduce((s, b) => s + b.amount, 0))}`,
        ...a.unmappedBills.map(b => `  ${b.date} | ${b.name} | ${b.category} → ${b.line || '不计'} | ${f(b.amount)}`),
        '',
        `拆分金额合计与账单全额不同（传统账目按比例缩放）：${a.splitMismatch.length} 笔`,
        ...a.splitMismatch.filter(r => !r.personal).map(r => `  ${r.id} | ${r.date} | ${r.supplier} | 账单 ${f(r.totalBillAmount || r.amount)}，拆分合计 ${f(r.splitTotal || 0)}${partsText(r)}`),
        '',
        `扣减（credit note）：${a.creditNoteRows.length} 笔 ${f(t.creditNotes)}（请对照 CN / 退货凭证）`,
        ...a.creditNoteRows.filter(r => !r.personal).map(r => `  ${r.id} | ${r.date} | ${r.supplier} | 发票 ${r.invoiceRef || '—'} | 账单 ${f(r.totalBillAmount || r.amount)} − CN ${f(r.creditNote)} = 计入 ${f(r.accrualAmount)}`),
        '',
        '杂项类别分组（只是分组，不代表分类有问题）：',
        ...Object.entries(a.focus).map(([k, v]) => `  ${k}：${v.count} 笔 ${f(v.amount)}`),
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
    const lineText = (r: AuditRow) => r.parts.map(p => `${p.line || '（没有科目）'}${r.parts.length > 1 ? ` ${p.amount}` : ''}`).join('；');
    sheet('总览', ['项目', '金额 / 笔数'], [
        ['月份（按单据的马来西亚日期）', a.month],
        ['AP / 独立支出笔数', t.count],
        ['AP 原始费用总额', t.apTotal],
        ['已计入传统账目', t.counted],
        ['列在 CAPEX（不计入净利）', t.capex],
        ['不在对照表、并入后备科目', t.folded],
        ['没有进入任何科目', t.notInClassic],
        ['不计入（转账 / 押金 / 借款 / 分红）', t.nonOperating],
        ['改由日结副本计入', t.viaSettlement],
        ['薪资付款 / 固定账单镜像 / 对账手续费', t.skipped],
        ['分期付款列（原账单已全额计入，不再计）', t.duplicateInstalments],
        ['扣减 credit note 合计', t.creditNotes],
        ['UTC 切日跨月（笔）', t.utcShifted],
        ['说明', '每日结算的钱箱支出不纳入本审计；科目差额为 0 不代表分类全部正确'],
    ]);
    sheet('逐笔明细', ['单据日期（马来西亚）', 'UTC 日期', '付款日期', '供应商', '项目 / 说明', '发票号码', '单据连结', '金额', '账单全额', '拆分合计', '扣减 CN', '传统账目计入金额', '付款状态', '付款方式', '原始分类', '细分', '传统账目科目', '处理方式', '记录 ID'],
        a.rows.map(r => [r.date, r.utcDate, r.paymentDate, r.supplier, r.item, r.invoiceRef, r.voucher, r.amount, r.totalBillAmount, r.splitTotal ?? '', r.creditNote, r.accrualAmount, r.paymentStatus, r.paymentMethod, r.category, r.subCategory,
            lineText(r), TREATMENT_LABEL[r.treatment], r.id]));
    sheet('分类汇总', ['分类', '笔数', '金额', '传统账目科目', '段落'], a.byCategory.map(c => [c.category, c.count, c.amount, c.line || '没有进入任何科目', c.section || '']));
    sheet('科目核对', ['传统账目科目', '段落', '来自 AP', '来自固定账单', '来自日结副本', '系统计算（薪资 / 平台）', '传统账目金额', '差额'],
        a.lineChecks.map(x => [x.line, x.section, x.fromAP, x.fromBills, x.fromSettlement, x.computed, x.classic, x.diff]));
    const L = a.labour;
    if (L) {
        const ws = sheet('人工核对', ['项目', '金额'], [
            ['薪资单状态', L.payrollStatus],
            ['应发', L.identity?.gross ?? ''], ['实发', L.identity?.netPay ?? ''], ['预支扣回', L.identity?.advanceLoan ?? ''],
            ['员工法定扣款', L.identity?.employeeStatutory ?? ''], ['其他扣款', L.identity?.otherDeductions ?? ''], ['恒等式差额', L.identity?.gap ?? ''],
            ['本月登记预支（STAFF_ADVANCE）', L.advanceAP], ['预支差额（登记 − 扣回）', L.advanceGap],
            ['薪资付款纪录：实发', L.payrollPaymentRecords.net], ['薪资付款纪录：缴政府', L.payrollPaymentRecords.statutory],
            ['传统账目：薪资实发', L.classic.payrollNet], ['传统账目：预支', L.classic.advance], ['传统账目：兼职', L.classic.partTime],
            ['传统账目：手动工资', L.classic.manualSalary], ['传统账目：员工餐', L.classic.staffMeal], ['传统账目：津贴 / 佣金', L.classic.other],
            ['传统账目：法定缴款', L.classic.statutory], ['传统账目人工合计', L.classic.total],
            ...L.notes.map((n, i) => [`说明 ${i + 1}`, n] as (string | number)[]),
        ]);
        ws.getColumn(2).width = 100;
        sheet('工资待确认', ['记录 ID', '日期', '付款日期', '登记名称', '说明', '金额', '相近的月薪员工', '单据'],
            L.possibleDuplicates.map(x => [x.row.id, x.row.date, x.row.paymentDate, x.row.supplier, x.row.item, x.row.accrualAmount, x.payrollName, x.row.voucher]));
        if (L.payroll) sheet('薪资逐人', ['员工', '应发', '实发', '预支扣回', '宿舍费', '其他扣款', '还款', '无薪假', '罚款状态', '员工法定', '雇主法定'],
            L.payroll.employees.map(e => [e.employeeName, e.gross, e.netPay, e.advanceLoan, e.hostelFee, e.otherDeduction, e.loanRepay, e.unpaidLeave, e.penaltyStatus, e.employeeStatutory, e.employerStatutory]));
    }
    sheet('扣减CN', ['记录 ID', '单据日期', '供应商', '发票号码', '账单全额', '扣减 CN', '计入金额', '单据连结'],
        a.creditNoteRows.map(r => [r.id, r.date, r.supplier, r.invoiceRef, r.totalBillAmount || r.amount, r.creditNote, r.accrualAmount, r.voucher]));
    sheet('固定账单无对照', ['日期', '名称', '分类', '计入科目', '金额', '记录 ID'], a.unmappedBills.map(b => [b.date, b.name, b.category, b.line || '不计', b.amount, b.id]));
    sheet('拆分不符', ['记录 ID', '单据日期', '供应商', '账单全额', '拆分合计', '扣减 CN', '计入金额', '各科目（按比例）'],
        a.splitMismatch.map(r => [r.id, r.date, r.supplier, r.totalBillAmount || r.amount, r.splitTotal ?? '', r.creditNote, r.accrualAmount, lineText(r)]));
    sheet('不在对照表', ['单据日期', '供应商', '项目', '金额', '分类', '凭证', '记录 ID'], a.notInClassic.map(r => [r.date, r.supplier, r.item, r.accrualAmount, r.category, r.voucher || r.invoiceRef || '无', r.id]));
    sheet('杂项类别', ['类别', '单据日期', '供应商', '项目', '金额', '传统账目科目'],
        Object.entries(a.focus).flatMap(([k, v]) => v.rows.map(r => [k, r.date, r.supplier, r.item, r.accrualAmount, lineText(r)])));
    sheet('修正建议', ['#', '建议'], a.suggestions.map((s, i) => [i + 1, s]));
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
