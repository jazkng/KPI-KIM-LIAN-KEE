// ==========================================
// 📒 传统账目 — Excel 导出
// ------------------------------------------
// 版面照 KIM LIAN KEE 原本那份 XLSX：
//   左边科目、右边「金额 / 占比」，可并排两个期间。
// 用 exceljs（package.json 已有），不额外装套件。
// ==========================================

import { loadExcelJS } from './lazyLibs';
import { ClassicPnLData } from './classicPnLBuilder';

const YELLOW = 'FFFFD200';
const GREY = 'FFF6F7FB';

export interface ExportOptions {
    storeName?: string;
    /** 当期 */
    current: ClassicPnLData;
    /** 比较期，没有就单栏 */
    compare?: ClassicPnLData | null;
    currentLabel: string;
    compareLabel?: string;
}

export const exportClassicPnLToExcel = async (opts: ExportOptions): Promise<Blob> => {
    const { storeName = 'KIM LIAN KEE KEPONG', current, compare, currentLabel, compareLabel } = opts;

    const wb = new (await loadExcelJS()).Workbook();
    wb.creator = '御膳智控 ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('P&L', {
        views: [{ state: 'frozen', ySplit: 5 }],
    });

    const hasCompare = !!compare;

    // 栏宽
    ws.getColumn(1).width = 40;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 10;
    if (hasCompare) {
        ws.getColumn(4).width = 16;
        ws.getColumn(5).width = 10;
    }

    // ==========================================
    // 表头
    // ==========================================
    const lastCol = hasCompare ? 5 : 3;
    const titleCell = (text: string, row: number, bold = true, size = 12) => {
        ws.mergeCells(row, 1, row, lastCol);
        const c = ws.getCell(row, 1);
        c.value = text;
        c.font = { bold, size };
        c.alignment = { horizontal: 'left' };
    };
    titleCell(storeName, 1, true, 14);
    titleCell('PROFIT & LOSS', 2, true, 12);
    titleCell(current.month, 3, false, 10);

    // 期间标题列
    const hdr = ws.getRow(5);
    hdr.getCell(1).value = '';
    hdr.getCell(2).value = currentLabel;
    hdr.getCell(3).value = '%';
    if (hasCompare) {
        hdr.getCell(4).value = compareLabel || '';
        hdr.getCell(5).value = '%';
    }
    for (let i = 1; i <= lastCol; i++) {
        const c = hdr.getCell(i);
        c.font = { bold: true, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
        c.alignment = { horizontal: i === 1 ? 'left' : 'right' };
        c.border = { bottom: { style: 'thin' } };
    }

    // ==========================================
    // 内容
    // ==========================================
    const compareById: Record<string, number> = {};
    const compareRatioById: Record<string, number | null> = {};
    if (compare) {
        compare.rows.forEach(r => {
            compareById[r.id] = r.amount;
            compareRatioById[r.id] = r.ratio;
        });
    }

    let rowIdx = 6;
    current.rows.forEach(r => {
        const row = ws.getRow(rowIdx);

        const indent = r.level === 2 ? '      ' : r.level === 1 ? '   ' : '';
        row.getCell(1).value = `${indent}${r.label}`;
        row.getCell(1).font = { bold: r.isSection, size: r.level === 2 ? 10 : 11 };

        row.getCell(2).value = r.amount;
        row.getCell(2).numFmt = '#,##0.00';
        row.getCell(2).font = { bold: r.isSection, size: r.level === 2 ? 10 : 11 };

        row.getCell(3).value = r.ratio;
        row.getCell(3).numFmt = '0.0%';
        row.getCell(3).font = { size: 10, color: { argb: 'FF6B7280' } };

        if (hasCompare) {
            row.getCell(4).value = compareById[r.id] ?? 0;
            row.getCell(4).numFmt = '#,##0.00';
            row.getCell(4).font = { bold: r.isSection, size: r.level === 2 ? 10 : 11 };

            row.getCell(5).value = compareRatioById[r.id] ?? null;
            row.getCell(5).numFmt = '0.0%';
            row.getCell(5).font = { size: 10, color: { argb: 'FF6B7280' } };
        }

        if (r.isSection) {
            for (let i = 1; i <= lastCol; i++) {
                row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
                row.getCell(i).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
            }
        }

        rowIdx++;
    });

    // ==========================================
    // 註记
    // ==========================================
    rowIdx += 1;
    const notes: string[] = [
        'PLATFORM SALES 取每日结算填的平台 Gross（未扣任何平台费用与折扣）。',
    ];
    if (current.hasStorehubData && current.inStoreRatio !== null) {
        notes.push(
            `SHOP LOT 品类明细为推算值：StoreHub 的 SKU 报表没有渠道栏位，平台单与店内单混在一起，` +
            `按当月店内收款占比 ${(current.inStoreRatio * 100).toFixed(2)}% 缩放，使明细加总 = SHOP LOT SALES。`
        );
    }
    notes.push('CAPEX（资本支出）不计入净利。');
    notes.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);

    notes.forEach(n => {
        ws.mergeCells(rowIdx, 1, rowIdx, lastCol);
        const c = ws.getCell(rowIdx, 1);
        c.value = `· ${n}`;
        c.font = { size: 9, color: { argb: 'FF6B7280' } };
        c.alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(rowIdx).height = 24;
        rowIdx++;
    });

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/** 触发浏览器下载 */
export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ==========================================
// 📄 CSV 导出
// ------------------------------------------
// Excel 那份适合直接给会计看；CSV 适合再丢进别的系统或自己用公式加工。
// 用 UTF-8 BOM 开头，Excel 打开中文才不会变乱码。
// ==========================================

/** 一个栏位包成 CSV 安全格式：有逗号/引号/换行就加引号 */
const csvCell = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface CsvExportOptions {
    current: ClassicPnLData;
    compare?: ClassicPnLData | null;
    currentLabel: string;
    compareLabel?: string;
    /** 一起附上品类毛利区块 */
    margins?: Array<{ label: string; sales: number; cost: number; profit: number; marginPct: number | null }>;
    storeName?: string;
}

export const buildClassicPnLCsv = (opts: CsvExportOptions): string => {
    const { current, compare, currentLabel, compareLabel, margins, storeName = 'KIM LIAN KEE KEPONG' } = opts;
    const lines: string[] = [];
    const hasCompare = !!compare;

    lines.push([csvCell(storeName)].join(','));
    lines.push([csvCell('PROFIT & LOSS')].join(','));
    lines.push([csvCell(`导出时间`), csvCell(new Date().toLocaleString('zh-CN'))].join(','));
    lines.push('');

    // 主表
    const header = ['项目', `${currentLabel} 金额`, `${currentLabel} 占比`];
    if (hasCompare) header.push(`${compareLabel} 金额`, `${compareLabel} 占比`);
    lines.push(header.map(csvCell).join(','));

    const cmp: Record<string, { amount: number; ratio: number | null }> = {};
    compare?.rows.forEach(r => { cmp[r.id] = { amount: r.amount, ratio: r.ratio }; });

    current.rows.forEach(r => {
        // 用全形空白缩排，Excel 打开才看得出层级
        const indent = r.level === 2 ? '　　' : r.level === 1 ? '　' : '';
        const row: (string | number)[] = [
            `${indent}${r.label}`,
            r.amount.toFixed(2),
            r.ratio === null ? '' : (r.ratio * 100).toFixed(1) + '%',
        ];
        if (hasCompare) {
            const c = cmp[r.id];
            row.push(c ? c.amount.toFixed(2) : '', c && c.ratio !== null ? (c.ratio * 100).toFixed(1) + '%' : '');
        }
        lines.push(row.map(csvCell).join(','));
    });

    // 品类毛利
    if (margins && margins.length > 0) {
        lines.push('');
        lines.push(csvCell('品类毛利 (销售取全渠道数字)'));
        lines.push(['类别', '销售', '成本', '毛利', '毛利率'].map(csvCell).join(','));
        margins.forEach(m => {
            lines.push([
                m.label,
                m.sales.toFixed(2),
                m.cost.toFixed(2),
                m.profit.toFixed(2),
                m.marginPct === null ? '' : (m.marginPct * 100).toFixed(1) + '%',
            ].map(csvCell).join(','));
        });
    }

    lines.push('');
    lines.push(csvCell('· 金额以每日结算为准；StoreHub 只负责把 SHOP LOT 拆成品类'));
    lines.push(csvCell('· 缩排的子行是上一层的拆解，不另外加进小计'));
    lines.push(csvCell('· CAPEX 不计入净利'));

    // BOM：Excel 打开中文才不会乱码
    return '﻿' + lines.join('\r\n');
};

export const downloadCsv = (csv: string, filename: string) => {
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
};
