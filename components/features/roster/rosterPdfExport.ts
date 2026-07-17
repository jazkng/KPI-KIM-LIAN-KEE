import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { ROSTER_STATUSES } from './rosterConstants';
import { getDayOfWeekText, getEmployeeDept } from './rosterUtils';

interface ExportOptions {
    showEmployeeId: boolean;
    showSignatures: boolean;
    includeLegend: boolean;
}

export async function exportRosterToPdf(
    monthKey: string,
    employees: any[],
    days: string[],
    roster: Record<string, Record<string, string>>,
    notes: Record<string, string>,
    options: ExportOptions
) {
    // 1. Slicing employees into pages of 12 for clean A3 pagination
    const activeEmployees = employees.filter(e => !e.isArchived && e.status !== 'TERMINATED');
    const itemsPerPage = 12;
    const totalPages = Math.max(1, Math.ceil(activeEmployees.length / itemsPerPage));

    // Create a temporary off-screen container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '1580px'; // A3-proportional high-res width
    document.body.appendChild(container);

    // Initialize jsPDF A3 landscape
    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3'
    });

    const isWeekendDay = (day: string) => {
        const info = getDayOfWeekText(day);
        return info.short === 'Sat' || info.short === 'Sun';
    };

    // Build each page in the DOM
    for (let p = 0; p < totalPages; p++) {
        const pageStart = p * itemsPerPage;
        const pageEnd = Math.min(pageStart + itemsPerPage, activeEmployees.length);
        const pageEmployees = activeEmployees.slice(pageStart, pageEnd);

        const pageEl = document.createElement('div');
        pageEl.style.width = '1580px';
        pageEl.style.padding = '40px';
        pageEl.style.background = '#FFFFFF';
        pageEl.style.fontFamily = '"Inter", "PingFang SC", sans-serif';
        pageEl.className = 'pdf-page';

        // Page HTML Content
        pageEl.innerHTML = `
            <!-- Title Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111111; padding-bottom: 15px; margin-bottom: 20px;">
                <div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #111111; letter-spacing: -0.5px;">
                        金莲记 甲洞店 - 月度排班计划表
                    </h1>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #666666; font-weight: 500;">
                        Kim Lian Kee Kepong - Monthly Employee Roster (Page ${p + 1} of ${totalPages})
                    </p>
                </div>
                <div style="text-align: right; font-family: monospace;">
                    <div style="font-size: 16px; font-weight: 700; color: #111111; background: #FFD200; padding: 4px 12px; border-radius: 6px; display: inline-block;">
                        ${monthKey}
                    </div>
                    <div style="font-size: 10px; color: #999999; margin-top: 5px;">
                        导出时间: ${new Date().toLocaleString()}
                    </div>
                </div>
            </div>

            <!-- Main Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; border: 2px solid #111111;">
                <thead>
                    <tr style="background: #111111; color: #FFFFFF; font-weight: bold; height: 38px;">
                        <th style="border: 1px solid #333333; width: 140px; text-align: left; padding-left: 12px; font-size: 12px;">员工姓名 (Name)</th>
                        <th style="border: 1px solid #333333; width: 100px; font-size: 11px;">职务部门 (Role)</th>
                        ${days.map(d => {
                            const dNum = d.split('-')[2];
                            const dText = getDayOfWeekText(d).short;
                            const isWe = isWeekendDay(d);
                            return `
                                <th style="border: 1px solid #333333; font-size: 10px; background: ${isWe ? '#333333' : '#111111'}; font-weight: 700; min-width: 32px; padding: 4px 0;">
                                    ${dNum}<br/>
                                    <span style="font-size: 8px; font-weight: 400; color: ${isWe ? '#FCA5A5' : '#9CA3AF'}">${dText}</span>
                                </th>
                            `;
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${pageEmployees.map(emp => {
                        const dept = getEmployeeDept(emp);
                        return `
                            <tr style="height: 32px; border-bottom: 1px solid #E5E7EB; background: #FFFFFF;">
                                <td style="border: 1px solid #E5E7EB; text-align: left; padding-left: 12px; font-weight: 700; font-size: 12px; color: #111111; white-space: nowrap;">
                                    ${options.showEmployeeId ? `[${emp.id}] ` : ''}${emp.name}
                                </td>
                                <td style="border: 1px solid #E5E7EB; font-weight: 500; color: #4B5563; font-size: 10px; white-space: nowrap; padding: 0 4px;">
                                    ${emp.role || 'Staff'}
                                </td>
                                ${days.map(day => {
                                    const statusKey = (roster[day] || {})[emp.id] || 'UNASSIGNED';
                                    const statusConfig = ROSTER_STATUSES[statusKey] || ROSTER_STATUSES.UNASSIGNED;
                                    const cellNote = notes[`${day}_${emp.id}`];

                                    // Color styling
                                    let cellBg = '#FFFFFF';
                                    let cellFg = '#000000';
                                    switch (statusKey) {
                                        case 'OFF':
                                            cellBg = '#F3F4F6';
                                            cellFg = '#9CA3AF';
                                            break;
                                        case 'WORK':
                                        case 'MORNING':
                                        case 'AFTERNOON':
                                        case 'NIGHT':
                                            cellBg = '#DCFCE7';
                                            cellFg = '#166534';
                                            break;
                                        case 'MC':
                                            cellBg = '#FEE2E2';
                                            cellFg = '#991B1B';
                                            break;
                                        case 'LEAVE':
                                            cellBg = '#FFEDD5';
                                            cellFg = '#9A3412';
                                            break;
                                        case 'ANNUAL':
                                            cellBg = '#DBEAFE';
                                            cellFg = '#1E40AF';
                                            break;
                                        case 'HOLIDAY':
                                            cellBg = '#FCE7F3';
                                            cellFg = '#9D174D';
                                            break;
                                        case 'PENDING':
                                            cellBg = '#FEF08A';
                                            cellFg = '#854D0E';
                                            break;
                                    }

                                    return `
                                        <td style="border: 1px solid #E5E7EB; background: ${cellBg}; color: ${cellFg}; font-weight: bold; font-size: 10px; position: relative; padding: 0;">
                                            ${statusConfig.short}
                                            ${cellNote ? '<div style="position: absolute; top: 0; right: 0; width: 0; height: 0; border-top: 5px solid #EAB308; border-left: 5px solid transparent;"></div>' : ''}
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- Legend & Signatures -->
            <div style="margin-top: 25px; display: flex; justify-content: space-between; font-size: 11px; align-items: flex-start;">
                <!-- Legend -->
                <div style="flex: 1; max-width: 60%; display: ${options.includeLegend ? 'block' : 'none'};">
                    <p style="margin: 0 0 8px 0; font-weight: 700; color: #374151;">排班对照说明 (Legend):</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                        ${Object.values(ROSTER_STATUSES).slice(0, 8).map(item => `
                            <div style="display: flex; align-items: center; gap: 5px;">
                                <span style="background: ${item.color.includes('bg-gray-100') ? '#F3F4F6' : '#DCFCE7'}; width: 22px; height: 16px; display: inline-block; border-radius: 3px; font-size: 9px; line-height: 16px; text-align: center; font-weight: bold; border: 1px solid #E5E7EB;">
                                    ${item.short}
                                </span>
                                <span style="color: #4B5563; font-size: 10px;">${item.label}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Signatures -->
                <div style="display: ${options.showSignatures ? 'flex' : 'none'}; gap: 60px; text-align: center; margin-left: auto;">
                    <div>
                        <p style="margin: 0; color: #4B5563;">编制人 (Prepared By)</p>
                        <div style="margin-top: 35px; width: 140px; border-bottom: 1.5px dashed #666666;"></div>
                    </div>
                    <div>
                        <p style="margin: 0; color: #4B5563;">复核人 (Audited By)</p>
                        <div style="margin-top: 35px; width: 140px; border-bottom: 1.5px dashed #666666;"></div>
                    </div>
                    <div>
                        <p style="margin: 0; color: #4B5563;">批准人 (Approved By)</p>
                        <div style="margin-top: 35px; width: 140px; border-bottom: 1.5px dashed #666666;"></div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(pageEl);

        // Render to canvas
        const canvas = await html2canvas(pageEl, {
            scale: 2, // Double DPI resolution
            useCORS: true,
            logging: false,
            backgroundColor: '#FFFFFF'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        // Add page to PDF
        if (p > 0) {
            pdf.addPage();
        }

        // A3 Landscape coordinates: 420mm x 297mm
        pdf.addImage(imgData, 'JPEG', 0, 0, 420, 297);
        
        // Clean up individual page DOM element
        container.removeChild(pageEl);
    }

    // Clean up container
    document.body.removeChild(container);

    // Save
    pdf.save(`KimLianKee_Roster_${monthKey}.pdf`);
}
