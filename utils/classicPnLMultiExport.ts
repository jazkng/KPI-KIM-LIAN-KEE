// ==========================================
// 📒 传统账目 — 多月份 P&L 导出（新档案，不动原本的 classicPnLExport.ts）
// ------------------------------------------
// 版面：
//   A 科目 | B 合计 | C %占销售 | D %占该段 | E/F 月1 | G/H 月2 | …
//   B 栏是 Excel 公式（=E6+G6+I6+…），所以你在 Excel 里改任何一个月，合计会自己跟着动。
//
// 「%占销售」= 金额 ÷ 该栏 SALES
// 「%占该段」= 金额 ÷ 它所属的大段（COST / PERSONAL / OPERATION…）
//   两个都给，因为老板两种都要看。
// ==========================================

import { loadExcelJS } from './lazyLibs';
import { ClassicPnLData, ClassicRow } from './classicPnLBuilder';

const YELLOW = 'FFFFD200';
const GREY = 'FFF6F7FB';

export interface MultiMonthPeriod {
    label: string;              // '2026-08'
    data: ClassicPnLData;
}

export interface MultiExportOptions {
    storeName?: string;
    periods: MultiMonthPeriod[];   // 依时间排好序
    /** 自我校验结果：对不上的科目，会写在表格最后提醒 */
    selfCheck?: { month: string; issues: { key: string; mine: number; theirs: number; diff: number }[] } | null;
}

/** Excel 栏号：1→A, 27→AA */
const colLetter = (n: number): string => {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
};

export const exportClassicPnLMultiToExcel = async (opts: MultiExportOptions): Promise<Blob> => {
    const { storeName = 'KIM LIAN KEE KEPONG', periods, selfCheck } = opts;
    if (periods.length === 0) throw new Error('没有任何月份可以导出');

    const wb = new (await loadExcelJS()).Workbook();
    wb.creator = '御膳智控 ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('P&L', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] });

    // ---------- 栏宽 ----------
    ws.getColumn(1).width = 42;
    ws.getColumn(2).width = 16;   // 合计
    ws.getColumn(3).width = 10;   // %占销售
    ws.getColumn(4).width = 10;   // %占该段
    periods.forEach((_, i) => {
        ws.getColumn(5 + i * 2).width = 15;
        ws.getColumn(6 + i * 2).width = 9;
    });
    const lastCol = 4 + periods.length * 2;

    // ---------- 标题 ----------
    const titleCell = (text: string, row: number, bold = true, size = 12) => {
        ws.mergeCells(row, 1, row, lastCol);
        const c = ws.getCell(row, 1);
        c.value = text; c.font = { bold, size }; c.alignment = { horizontal: 'left' };
    };
    titleCell(storeName, 1, true, 14);
    titleCell('PROFIT & LOSS（多月份）', 2, true, 12);
    titleCell(`${periods[0].label} ~ ${periods[periods.length - 1].label}　共 ${periods.length} 个月`, 3, false, 10);

    // ---------- 表头 ----------
    const hdr = ws.getRow(5);
    hdr.getCell(1).value = '';
    hdr.getCell(2).value = '合计';
    hdr.getCell(3).value = '% 占销售';
    hdr.getCell(4).value = '% 占该段';
    periods.forEach((p, i) => {
        hdr.getCell(5 + i * 2).value = p.label;
        hdr.getCell(6 + i * 2).value = '%';
    });
    for (let i = 1; i <= lastCol; i++) {
        const c = hdr.getCell(i);
        c.font = { bold: true, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
        c.alignment = { horizontal: i === 1 ? 'left' : 'right' };
        c.border = { bottom: { style: 'thin' } };
    }

    // ---------- 主科目清单：照出现顺序合并各月的行 ----------
    const master: ClassicRow[] = [];
    const seen = new Set<string>();
    periods.forEach(p => {
        p.data.rows.forEach(r => {
            if (seen.has(r.id)) return;
            seen.add(r.id);
            master.push(r);
        });
    });

    // 每个月的 id → row，方便查
    const byMonth = periods.map(p => {
        const m: Record<string, ClassicRow> = {};
        p.data.rows.forEach(r => { m[r.id] = r; });
        return m;
    });

    // ---------- 内容 ----------
    let rowIdx = 6;
    let salesRowNo = 0;                 // SALES 那一行，给「%占销售」当分母
    let sectionRowNo = 0;               // 最近一个大段的行号，给「%占该段」当分母
    const monthAmountCols = periods.map((_, i) => colLetter(5 + i * 2));

    master.forEach(ref => {
        const row = ws.getRow(rowIdx);
        const indent = ref.level === 2 ? '      ' : ref.level === 1 ? '   ' : '';
        row.getCell(1).value = `${indent}${ref.label}`;
        row.getCell(1).font = { bold: ref.isSection, size: ref.level === 2 ? 10 : 11 };

        if (ref.id === 'SALES') salesRowNo = rowIdx;
        if (ref.isSection) sectionRowNo = rowIdx;

        // B：合计 = 各月相加（用公式，老板在 Excel 改哪一格都会自动更新）
        row.getCell(2).value = { formula: monthAmountCols.map(c => `${c}${rowIdx}`).join('+') } as any;
        row.getCell(2).numFmt = '#,##0.00';
        row.getCell(2).font = { bold: ref.isSection, size: ref.level === 2 ? 10 : 11 };

        // C：% 占销售
        row.getCell(3).value = salesRowNo
            ? ({ formula: `IF($B$${salesRowNo}=0,"",B${rowIdx}/$B$${salesRowNo})` } as any)
            : null;
        row.getCell(3).numFmt = '0.0%';
        row.getCell(3).font = { size: 10, color: { argb: 'FF6B7280' } };

        // D：% 占该段（大段自己 = 100%）
        row.getCell(4).value = sectionRowNo
            ? ({ formula: `IF($B$${sectionRowNo}=0,"",B${rowIdx}/$B$${sectionRowNo})` } as any)
            : null;
        row.getCell(4).numFmt = '0.0%';
        row.getCell(4).font = { size: 10, color: { argb: 'FF9CA3AF' } };

        // 各月
        periods.forEach((_, i) => {
            const r = byMonth[i][ref.id];
            const amtCell = row.getCell(5 + i * 2);
            amtCell.value = r ? r.amount : 0;
            amtCell.numFmt = '#,##0.00';
            amtCell.font = { bold: ref.isSection, size: ref.level === 2 ? 10 : 11 };

            const pctCell = row.getCell(6 + i * 2);
            pctCell.value = r ? (r.ratio ?? null) : null;
            pctCell.numFmt = '0.0%';
            pctCell.font = { size: 10, color: { argb: 'FF6B7280' } };
        });

        if (ref.isSection) {
            for (let i = 1; i <= lastCol; i++) {
                row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
                row.getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            }
        }
        rowIdx++;
    });

    // ---------- 註记 ----------
    rowIdx += 1;
    const notes: string[] = [
        'B 栏「合计」是 Excel 公式（各月相加），你在表内改任何一个月的数字，合计会自己更新。',
        '「% 占销售」= 金额 ÷ 该期 SALES；「% 占该段」= 金额 ÷ 它所属的大段（COST / PERSONAL / OPERATION）。两个分母不同，不要互相比。',
        'PLATFORM SALES 取每日结算填的平台 Gross（未扣任何平台费用与折扣）；平台抽佣与广告费列在 OPERATION 的 PLATFORM FEES。',
        'SHOP LOT 品类明细为推算值（StoreHub SKU 报表没有渠道栏位，按当月店内收款占比缩放）。',
        'CAPEX（资本支出）不计入净利。',
    ];
    if (selfCheck) {
        if (selfCheck.issues.length === 0) {
            notes.push(`✅ 自我校验通过：${selfCheck.month} 用多月算法算出来的每一个科目，跟画面上显示的完全一致。`);
        } else {
            notes.push(`⚠️ 自我校验发现 ${selfCheck.issues.length} 个科目对不上（${selfCheck.month}），请勿直接使用，先告诉开发者：`);
            selfCheck.issues.slice(0, 15).forEach(x => {
                notes.push(`　　${x.key}：多月算法 ${x.mine.toFixed(2)} vs 画面 ${x.theirs.toFixed(2)}　差 ${x.diff.toFixed(2)}`);
            });
        }
    }
    notes.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);

    notes.forEach(n => {
        ws.mergeCells(rowIdx, 1, rowIdx, lastCol);
        const c = ws.getCell(rowIdx, 1);
        c.value = `· ${n}`;
        c.font = { size: 9, color: { argb: n.startsWith('⚠️') ? 'FFB91C1C' : 'FF6B7280' } };
        c.alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(rowIdx).height = 22;
        rowIdx++;
    });

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
