import ExcelJS from 'exceljs';
import { ROSTER_STATUSES } from './rosterConstants';
import { getDayOfWeekText } from './rosterUtils';

interface ExportOptions {
    showEmployeeId: boolean;
    showSignatures: boolean;
    includeLegend: boolean;
}

export async function exportRosterToExcel(
    monthKey: string,
    employees: any[],
    days: string[],
    roster: Record<string, Record<string, string>>,
    notes: Record<string, string>,
    options: ExportOptions
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '御膳智控 ERP';
    workbook.lastModifiedBy = '御膳智控 ERP';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheetName = `${monthKey} 排班表`;
    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
        pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // 1. Set Column Widths
    const columns: any[] = [
        { header: '员工姓名 (Name)', key: 'name', width: 22 },
        { header: '职务部门 (Dept)', key: 'dept', width: 16 }
    ];

    // Add days columns
    days.forEach(day => {
        const dNum = day.split('-')[2];
        columns.push({
            header: dNum,
            key: day,
            width: 7
        });
    });
    worksheet.columns = columns;

    // 2. Title Block
    worksheet.mergeCells(1, 1, 1, days.length + 2);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = `金莲记 甲洞店 - 排班大表 (Kim Lian Kee Kepong - Roster Management)`;
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFD200' } };
    titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF111111' }
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 40;

    // Subtitle Row
    worksheet.mergeCells(2, 1, 2, days.length + 2);
    const subCell = worksheet.getCell(2, 1);
    subCell.value = `月份 (Month): ${monthKey}  |  生成时间 (Generated): ${new Date().toLocaleString()}  |  状态 (Status): 已发布 (Published)`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFCCCCCC' } };
    subCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF222222' }
    };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 24;

    // 3. Header Row (Day of Week)
    const dayOfWeekRow = worksheet.getRow(3);
    dayOfWeekRow.height = 26;
    dayOfWeekRow.getCell(1).value = '员工姓名 (Name)';
    dayOfWeekRow.getCell(2).value = '职务部门 (Role)';
    
    // Style Column Headers 1 & 2
    for (let c = 1; c <= 2; c++) {
        const cell = dayOfWeekRow.getCell(c);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF444444' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF444444' } },
            right: { style: 'thin', color: { argb: 'FF444444' } }
        };
    }

    days.forEach((day, index) => {
        const colIdx = index + 3;
        const cell = dayOfWeekRow.getCell(colIdx);
        const dayInfo = getDayOfWeekText(day);
        const dayNum = day.split('-')[2];
        cell.value = `${dayNum}\n(${dayInfo.short})`;
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // Highlight weekends in dark gray/blue
        const isWe = dayInfo.short === 'Sat' || dayInfo.short === 'Sun';
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isWe ? 'FF555555' : 'FF444444' }
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF666666' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF666666' } },
            right: { style: 'thin', color: { argb: 'FF666666' } }
        };
    });

    // 4. Populate Employee Data
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    let currentRowIdx = 4;

    activeEmployees.forEach((emp) => {
        const row = worksheet.getRow(currentRowIdx);
        row.height = 24;

        // Name
        const nameCell = row.getCell(1);
        nameCell.value = options.showEmployeeId ? `[${emp.id}] ${emp.name}` : emp.name;
        nameCell.font = { name: 'Arial', size: 10, bold: true };
        nameCell.alignment = { vertical: 'middle', horizontal: 'left' };
        nameCell.border = { right: { style: 'thin', color: { argb: 'FFD2D2D2' } } };

        // Department Role
        const deptCell = row.getCell(2);
        deptCell.value = emp.role || 'Staff';
        deptCell.font = { name: 'Arial', size: 9 };
        deptCell.alignment = { vertical: 'middle', horizontal: 'center' };
        deptCell.border = { right: { style: 'medium', color: { argb: 'FF666666' } } }; // wait, in database RosterModule has date keys like YYYY-MM-DD
        days.forEach((day, index) => {
            const colIdx = index + 3;
            const statusKey = (roster[day] || {})[emp.id] || 'UNASSIGNED';
            const statusConfig = ROSTER_STATUSES[statusKey] || ROSTER_STATUSES.UNASSIGNED;
            const cell = row.getCell(colIdx);
            
            cell.value = statusConfig.short;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };

            // Apply styling depending on the status
            let cellColor = 'FFFFFFFF'; // white
            let textColor = 'FF000000'; // black

            switch (statusKey) {
                case 'OFF':
                    cellColor = 'FFF3F4F6'; // light gray
                    textColor = 'FF9CA3AF'; // dark gray
                    break;
                case 'WORK':
                case 'MORNING':
                case 'AFTERNOON':
                case 'NIGHT':
                    cellColor = 'FFDCFCE7'; // light green
                    textColor = 'FF166534'; // dark green
                    break;
                case 'MC':
                    cellColor = 'FFFEE2E2'; // light red
                    textColor = 'FF991B1B'; // dark red
                    break;
                case 'LEAVE':
                    cellColor = 'FFFFEDD5'; // light orange
                    textColor = 'FF9A3412'; // dark orange
                    break;
                case 'ANNUAL':
                    cellColor = 'FFDBEAFE'; // light blue
                    textColor = 'FF1E40AF'; // dark blue
                    break;
                case 'HOLIDAY':
                    cellColor = 'FFFCE7F3'; // pink
                    textColor = 'FF9D174D'; // dark pink
                    break;
                case 'PENDING':
                    cellColor = 'FEFEF08A'; // light yellow
                    textColor = 'FF854D0E'; // dark yellow
                    break;
                default:
                    cellColor = 'FFFFFFFF';
                    textColor = 'FFCCCCCC';
            }

            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: cellColor }
            };
            cell.font = { name: 'Arial', size: 9, bold: ['OFF', 'MC', 'ABSENT'].includes(statusKey), color: { argb: textColor } };
            
            // Standard thin borders for grids
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
        });

        currentRowIdx++;
    });

    // 5. Divider
    const dividerRow = worksheet.getRow(currentRowIdx);
    dividerRow.height = 8;
    for (let c = 1; c <= days.length + 2; c++) {
        dividerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    }
    currentRowIdx++;

    // 6. Legend block
    if (options.includeLegend) {
        const legendRow = worksheet.getRow(currentRowIdx);
        legendRow.height = 24;
        worksheet.mergeCells(currentRowIdx, 1, currentRowIdx, 2);
        const lTitle = legendRow.getCell(1);
        lTitle.value = '班次/状态说明 (Legend):';
        lTitle.font = { name: 'Arial', size: 9, bold: true };
        lTitle.alignment = { vertical: 'middle', horizontal: 'center' };

        let offset = 3;
        Object.values(ROSTER_STATUSES).slice(0, 8).forEach(item => {
            const cell = legendRow.getCell(offset);
            cell.value = `${item.short}: ${item.label}`;
            cell.font = { name: 'Arial', size: 8, color: { argb: 'FF555555' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            offset += 3;
        });
        currentRowIdx += 2;
    }

    // 7. Signature Rows
    if (options.showSignatures) {
        worksheet.getRow(currentRowIdx).height = 20;
        currentRowIdx++;

        const sigRow = worksheet.getRow(currentRowIdx);
        sigRow.height = 36;
        
        // Col 2: Preparer
        worksheet.mergeCells(currentRowIdx, 2, currentRowIdx, 4);
        const prepCell = sigRow.getCell(2);
        prepCell.value = '编制人 (Prepared By):\n_______________________';
        prepCell.font = { name: 'Arial', size: 9 };
        prepCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

        // Col 10: Auditor
        const auditColIdx = Math.floor(days.length / 2) + 1;
        worksheet.mergeCells(currentRowIdx, auditColIdx, currentRowIdx, auditColIdx + 2);
        const audCell = sigRow.getCell(auditColIdx);
        audCell.value = '复核人 (Audited By):\n_______________________';
        audCell.font = { name: 'Arial', size: 9 };
        audCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

        // Col 22: Approver
        const appColIdx = days.length - 2;
        worksheet.mergeCells(currentRowIdx, appColIdx, currentRowIdx, appColIdx + 2);
        const appCell = sigRow.getCell(appColIdx);
        appCell.value = '批准人 (Approved By):\n_______________________';
        appCell.font = { name: 'Arial', size: 9 };
        appCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
    }

    // Write buffer & download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `KimLianKee_Roster_${monthKey}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
